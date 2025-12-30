import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { LogicClient } from "../../../src/api/logic-client.js";
import {
  PayloadTooLargeError,
  LogicApiError,
  TimeoutError,
  RateLimitError,
} from "../../../src/errors/index.js";

describe("Unit: LogicClient", () => {
  const mockApiBaseUrl = "https://api.logic.inc/v1";
  const mockApiToken = "test-api-token";
  const mockDocumentId = "test-document-id";
  const mockFileId = "test-file-id";
  const timeoutMs = 5000;

  let client: LogicClient;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    client = new LogicClient(mockApiBaseUrl, mockApiToken, timeoutMs);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("generateDiagram", () => {
    test("should generate a diagram successfully", async () => {
      // API returns the new format with diagramImage
      const mockApiResponse = {
        diagramImage: {
          id: "generated-file-id",
          url: "https://example.com/image.png",
          mimeType: "image/png",
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const result = await client.generateDiagram(mockDocumentId, {
        title: "Test PR",
        description: "Test description",
        diff: "test diff",
      });

      // Client transforms to internal format
      expect(result).toEqual({
        outputImageUrl: "https://example.com/image.png",
        fileId: "generated-file-id",
        mimeType: "image/png",
      });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/documents/${mockDocumentId}/executions`),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiToken}`,
          }),
        })
      );
    });

    test("should throw PayloadTooLargeError on 413 response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 413,
      });

      await expect(
        client.generateDiagram(mockDocumentId, {
          title: "Test",
          description: "Test",
          diff: "test",
        })
      ).rejects.toThrow(PayloadTooLargeError);
    });

    test("should throw LogicApiError on other errors", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Internal server error" }),
      });

      await expect(
        client.generateDiagram(mockDocumentId, {
          title: "Test",
          description: "Test",
          diff: "test",
        })
      ).rejects.toThrow(LogicApiError);
    });

    test("should handle JSON parse error in error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });

      await expect(
        client.generateDiagram(mockDocumentId, {
          title: "Test",
          description: "Test",
          diff: "test",
        })
      ).rejects.toThrow("HTTP 500");
    });
  });

  describe("refreshUrl", () => {
    test("should refresh URL successfully", async () => {
      const mockResponse = {
        outputImageUrl: "https://example.com/new-image.png",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.refreshUrl(mockFileId);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/files/${mockFileId}/urls`),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiToken}`,
          }),
        })
      );
    });

    test("should throw LogicApiError on error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: "File not found" }),
      });

      await expect(client.refreshUrl(mockFileId)).rejects.toThrow(LogicApiError);
    });

    test("should handle JSON parse error in error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });

      await expect(client.refreshUrl(mockFileId)).rejects.toThrow("HTTP 404");
    });
  });

  describe("timeout handling", () => {
    test("should throw TimeoutError when request is aborted", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";

      global.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(
        client.generateDiagram(mockDocumentId, {
          title: "Test",
          description: "Test",
          diff: "test",
        })
      ).rejects.toThrow(TimeoutError);
    });

    test("should rethrow non-abort errors", async () => {
      const networkError = new Error("Network error");

      global.fetch = vi.fn().mockRejectedValue(networkError);

      await expect(
        client.generateDiagram(mockDocumentId, {
          title: "Test",
          description: "Test",
          diff: "test",
        })
      ).rejects.toThrow("Network error");
    });
  });

  describe("rate limit handling", () => {
    test("should retry once on rate limit and succeed", async () => {
      vi.useFakeTimers();

      const mockApiResponse = {
        diagramImage: {
          id: "file-id",
          url: "https://example.com/image.png",
          mimeType: "image/png",
        },
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockApiResponse),
        });

      const promise = client.generateDiagram(mockDocumentId, {
        title: "Test",
        description: "Test",
        diff: "test",
      });

      // Advance timers to trigger the retry
      await vi.advanceTimersByTimeAsync(60000);

      const result = await promise;

      expect(result).toEqual({
        outputImageUrl: "https://example.com/image.png",
        fileId: "file-id",
        mimeType: "image/png",
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    test("should throw RateLimitError after max retries", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      // Use a shorter timeout client for this test
      const shortClient = new LogicClient(mockApiBaseUrl, mockApiToken, 100);

      // Mock sleep to resolve immediately
      vi.spyOn(shortClient as never, "sleep").mockResolvedValue(undefined);

      await expect(
        shortClient.generateDiagram(mockDocumentId, {
          title: "Test",
          description: "Test",
          diff: "test",
        })
      ).rejects.toThrow(RateLimitError);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test("should throw RateLimitError for nested TOOL_RATELIMIT_ERROR in 400 response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: {
              reason: "TOOL_RATELIMIT_ERROR",
              errors: ["Daily image generation limit reached. Please try again tomorrow."],
            },
          }),
      });

      const shortClient = new LogicClient(mockApiBaseUrl, mockApiToken, 100);
      vi.spyOn(shortClient as never, "sleep").mockResolvedValue(undefined);

      await expect(
        shortClient.generateDiagram(mockDocumentId, {
          title: "Test",
          description: "Test",
          diff: "test",
        })
      ).rejects.toThrow(RateLimitError);

      await expect(
        shortClient.generateDiagram(mockDocumentId, {
          title: "Test",
          description: "Test",
          diff: "test",
        })
      ).rejects.toThrow("Daily image generation limit reached");
    });

    test("should extract error message from nested errors array", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: {
              errors: ["First error", "Second error"],
            },
          }),
      });

      await expect(
        client.generateDiagram(mockDocumentId, {
          title: "Test",
          description: "Test",
          diff: "test",
        })
      ).rejects.toThrow("First error; Second error");
    });

    test("should also handle top-level error fields for backwards compatibility", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            reason: "TOOL_RATELIMIT_ERROR",
            errors: ["Rate limit hit"],
          }),
      });

      const shortClient = new LogicClient(mockApiBaseUrl, mockApiToken, 100);
      vi.spyOn(shortClient as never, "sleep").mockResolvedValue(undefined);

      await expect(
        shortClient.generateDiagram(mockDocumentId, {
          title: "Test",
          description: "Test",
          diff: "test",
        })
      ).rejects.toThrow(RateLimitError);
    });
  });

  describe("response handling", () => {
    test("should throw LogicApiError when diagramImage is missing", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await expect(
        client.generateDiagram(mockDocumentId, {
          title: "Test",
          description: "Test",
          diff: "test",
        })
      ).rejects.toThrow("No diagram image in response");
    });

    test("should handle response with output wrapper", async () => {
      const mockApiResponse = {
        output: {
          diagramImage: {
            id: "file-id",
            url: "https://example.com/image.png",
            mimeType: "image/png",
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const result = await client.generateDiagram(mockDocumentId, {
        title: "Test",
        description: "Test",
        diff: "test",
      });

      expect(result).toEqual({
        outputImageUrl: "https://example.com/image.png",
        fileId: "file-id",
        mimeType: "image/png",
      });
    });

    test("should use version parameter in URL", async () => {
      const mockApiResponse = {
        diagramImage: {
          id: "file-id",
          url: "https://example.com/image.png",
          mimeType: "image/png",
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      await client.generateDiagram(
        mockDocumentId,
        { title: "Test", description: "Test", diff: "test" },
        "published"
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("version=published"),
        expect.any(Object)
      );
    });
  });

  describe("fetchImageAsBase64", () => {
    test("should fetch image and convert to base64", async () => {
      const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(imageBytes.buffer),
      });

      const result = await client.fetchImageAsBase64("https://example.com/image.png", "image/png");

      expect(result.tooLarge).toBe(false);
      expect(result.base64).toBe(Buffer.from(imageBytes).toString("base64"));
      expect(result.dataUrl).toBe(`data:image/png;base64,${result.base64}`);
    });

    test("should return tooLarge when image exceeds limit", async () => {
      // Create a large image (over 60000 bytes when base64 encoded)
      const largeImage = new Uint8Array(50000);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(largeImage.buffer),
      });

      const result = await client.fetchImageAsBase64("https://example.com/image.png", "image/png");

      expect(result.tooLarge).toBe(true);
      expect(result.base64).toBeNull();
      expect(result.dataUrl).toBeNull();
    });

    test("should throw LogicApiError on fetch failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(
        client.fetchImageAsBase64("https://example.com/image.png", "image/png")
      ).rejects.toThrow(LogicApiError);
    });
  });
});
