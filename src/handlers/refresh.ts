import * as core from "@actions/core";
import type { ActionContext } from "../github/context.js";
import { findDiagramComment, updateDiagramComment, postErrorComment } from "../github/comments.js";
import { LogicClient } from "../api/logic-client.js";
import {
  getGenericErrorComment,
  getRefreshNotFoundComment,
  TimeoutError,
  getTimeoutErrorComment,
  LogicApiError,
} from "../errors/index.js";

export interface RefreshResult {
  success: boolean;
  imageUrl?: string;
  fileId?: string;
  commentId?: number;
}

export interface RefreshOptions {
  apiToken: string;
  timeoutMs: number;
  apiBaseUrl: string;
}

/**
 * Handle the /refresh-diagram command
 */
export async function handleRefresh(
  context: ActionContext,
  options: RefreshOptions
): Promise<RefreshResult> {
  const client = new LogicClient(options.apiBaseUrl, options.apiToken, options.timeoutMs);

  try {
    // Find existing diagram comment
    core.info("Looking for existing diagram comment...");
    const existingComment = await findDiagramComment(context);

    if (!existingComment) {
      core.warning("No existing diagram comment found");
      await postErrorComment(context, getRefreshNotFoundComment());
      return { success: false };
    }

    core.info(
      `Found existing diagram comment (ID: ${existingComment.id}, fileId: ${existingComment.fileId})`
    );

    // Refresh the URL
    core.info("Refreshing diagram URL...");
    const response = await client.refreshUrl(existingComment.fileId);

    // Get the image URL from the response (prefer processed, fall back to original)
    const refreshedUrl = response.processed ?? response.original;
    if (!refreshedUrl) {
      throw new LogicApiError("No URL in file response");
    }

    // Fetch image and convert to base64
    core.info("Fetching diagram image...");
    const imageResult = await client.fetchImageAsBase64(
      refreshedUrl,
      "image/png" // Default mimeType for refresh
    );

    // Use data URL if image fits, otherwise fall back to presigned URL
    const imageUrl = imageResult.dataUrl ?? refreshedUrl;
    const isEmbedded = !imageResult.tooLarge;

    if (imageResult.tooLarge) {
      core.info("Image too large for inline embedding, using presigned URL");
    } else {
      core.info("Image embedded as base64");
    }

    // Update the comment with the new URL
    core.info("Updating diagram comment...");
    await updateDiagramComment(
      context,
      existingComment.id,
      imageUrl,
      existingComment.fileId,
      isEmbedded
    );

    core.info("Diagram refreshed successfully");

    return {
      success: true,
      imageUrl,
      fileId: existingComment.fileId,
      commentId: existingComment.id,
    };
  } catch (error) {
    if (error instanceof TimeoutError) {
      core.warning("Request timed out");
      await postErrorComment(context, getTimeoutErrorComment(options.timeoutMs / 1000));
      return { success: false };
    }

    // Generic error
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    core.error(`Diagram refresh failed: ${errorMessage}`);
    await postErrorComment(context, getGenericErrorComment(errorMessage));
    return { success: false };
  }
}
