import {
  RATE_LIMIT_RETRY_DELAY_MS,
  RATE_LIMIT_MAX_RETRIES,
  MAX_INLINE_IMAGE_SIZE,
} from "../utils/constants.js";
import {
  LogicApiError,
  RateLimitError,
  PayloadTooLargeError,
  TimeoutError,
} from "../errors/index.js";

export interface GenerateDiagramInput {
  title: string;
  description: string;
  diff: string;
  truncated?: boolean;
}

interface ApiDiagramImage {
  id: string;
  url: string;
  mimeType: string;
}

interface ApiExecutionResponse {
  output?: {
    diagramImage?: ApiDiagramImage;
  };
  diagramImage?: ApiDiagramImage;
}

export interface GenerateDiagramResponse {
  outputImageUrl: string;
  fileId: string;
  mimeType: string;
}

export interface RefreshUrlResponse {
  original?: string;
  processed?: string;
  thumbnail?: string;
}

export interface FetchImageResult {
  base64: string | null;
  dataUrl: string | null;
  tooLarge: boolean;
}

/**
 * Logic.inc API client
 */
export class LogicClient {
  private readonly apiToken: string;
  private readonly timeoutMs: number;
  private readonly apiBaseUrl: string;

  constructor(apiBaseUrl: string, apiToken: string, timeoutMs: number) {
    this.apiBaseUrl = apiBaseUrl;
    this.apiToken = apiToken;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Generate a diagram from PR content
   */
  async generateDiagram(
    documentId: string,
    input: GenerateDiagramInput,
    version: string = "draft"
  ): Promise<GenerateDiagramResponse> {
    const url = `${this.apiBaseUrl}/documents/${documentId}/executions?version=${version}`;

    // Format the request body as a single description text blob
    const descriptionParts = [
      `# ${input.title}`,
      "",
      input.description || "No description provided.",
      "",
      "## Changes",
      "",
      "```diff",
      input.truncated ? "(diff truncated due to size)" : "",
      input.diff,
      "```",
    ];
    const requestBody = {
      description: descriptionParts.join("\n"),
    };

    let retries = 0;

    // Loop always exits via return (success) or throw (error)
    while (true) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          const apiResponse = (await response.json()) as ApiExecutionResponse;
          // Handle both possible response structures
          const diagramImage = apiResponse.output?.diagramImage ?? apiResponse.diagramImage;
          if (!diagramImage) {
            throw new LogicApiError("No diagram image in response");
          }
          return {
            outputImageUrl: diagramImage.url,
            fileId: diagramImage.id,
            mimeType: diagramImage.mimeType,
          };
        }

        // Handle specific error codes
        if (response.status === 429) {
          throw new RateLimitError();
        }

        if (response.status === 413) {
          throw new PayloadTooLargeError();
        }

        // Try to get error message from response
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorBody = (await response.json()) as {
            reason?: string;
            errors?: string[];
            message?: string;
            error?: {
              reason?: string;
              errors?: string[];
              message?: string;
            };
          };
          if (typeof errorBody === "object" && errorBody !== null) {
            // Error can be at top level or nested in "error" field
            const errorData = errorBody.error ?? errorBody;

            // Check for rate limit error from API (comes as 400, not 429)
            if (errorData.reason === "TOOL_RATELIMIT_ERROR") {
              const message = errorData.errors?.[0] ?? "Rate limit exceeded";
              throw new RateLimitError(message);
            }
            // Extract error message from various formats
            if (errorData.errors && errorData.errors.length > 0) {
              errorMessage = errorData.errors.join("; ");
            } else if (errorData.message) {
              errorMessage = String(errorData.message);
            }
          }
        } catch (parseError) {
          // Re-throw if it's a RateLimitError we just created
          if (parseError instanceof RateLimitError) {
            throw parseError;
          }
          // Ignore other JSON parse errors
        }

        throw new LogicApiError(errorMessage, response.status);
      } catch (error) {
        if (error instanceof RateLimitError && retries < RATE_LIMIT_MAX_RETRIES) {
          // Wait and retry for rate limit errors
          await this.sleep(RATE_LIMIT_RETRY_DELAY_MS);
          retries++;
          continue;
        }

        throw error;
      }
    }
  }

  /**
   * Refresh the presigned URL for a file
   */
  async refreshUrl(fileId: string): Promise<RefreshUrlResponse> {
    const url = `${this.apiBaseUrl}/files/${fileId}/urls`;

    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = await response.json();
        if (typeof errorBody === "object" && errorBody !== null && "message" in errorBody) {
          errorMessage = String(errorBody.message);
        }
      } catch {
        // Ignore JSON parse errors
      }

      throw new LogicApiError(errorMessage, response.status);
    }

    return (await response.json()) as RefreshUrlResponse;
  }

  /**
   * Fetch an image and convert to base64
   * Returns null base64/dataUrl if the image is too large for inline embedding
   */
  async fetchImageAsBase64(imageUrl: string, mimeType: string): Promise<FetchImageResult> {
    const response = await this.fetchWithTimeout(imageUrl, {
      method: "GET",
    });

    if (!response.ok) {
      throw new LogicApiError(`Failed to fetch image: HTTP ${response.status}`, response.status);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    if (base64.length > MAX_INLINE_IMAGE_SIZE) {
      return {
        base64: null,
        dataUrl: null,
        tooLarge: true,
      };
    }

    return {
      base64,
      dataUrl: `data:${mimeType};base64,${base64}`,
      tooLarge: false,
    };
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(
    url: string,
    options: Parameters<typeof fetch>[1]
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(`Request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
