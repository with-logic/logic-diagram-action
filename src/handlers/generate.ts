import * as core from "@actions/core";
import type { ActionContext } from "../github/context.js";
import { fetchPullRequest } from "../github/pr.js";
import {
  findDiagramComment,
  createDiagramComment,
  updateDiagramComment,
  postErrorComment,
} from "../github/comments.js";
import { LogicClient } from "../api/logic-client.js";
import { truncateDiff } from "../utils/truncate.js";
import {
  PayloadTooLargeError,
  RateLimitError,
  TimeoutError,
  getGenericErrorComment,
  getPayloadTooLargeErrorComment,
  getRateLimitErrorComment,
  getTimeoutErrorComment,
  getForkSkipComment,
} from "../errors/index.js";

export interface GenerateResult {
  success: boolean;
  imageUrl?: string;
  fileId?: string;
  commentId?: number;
}

export interface GenerateOptions {
  documentId: string;
  apiToken: string;
  timeoutMs: number;
  maxDiffLength: number;
  apiBaseUrl: string;
  version: string;
}

/**
 * Handle the /generate-diagram command
 */
export async function handleGenerate(
  context: ActionContext,
  options: GenerateOptions
): Promise<GenerateResult> {
  const client = new LogicClient(options.apiBaseUrl, options.apiToken, options.timeoutMs);

  try {
    // Fetch PR data
    core.info("Fetching pull request data...");
    const pr = await fetchPullRequest(context);

    // Update context with fork/draft status
    context.isFork = pr.isFork;
    context.isDraft = pr.isDraft;

    // Skip fork PRs
    if (pr.isFork) {
      core.info("Skipping diagram generation for fork PR");
      await postErrorComment(context, getForkSkipComment());
      return { success: false };
    }

    // Skip draft PRs silently
    if (pr.isDraft) {
      core.info("Skipping diagram generation for draft PR");
      return { success: false };
    }

    // Truncate diff proactively if too large
    let diff = pr.diff;
    let truncated = false;
    if (diff.length > options.maxDiffLength) {
      core.info(
        `Diff too large (${diff.length} chars), truncating to ${options.maxDiffLength} chars...`
      );
      diff = truncateDiff(diff, options.maxDiffLength);
      truncated = true;
    }

    // Generate diagram
    core.info("Generating diagram via Logic.inc API...");
    const response = await client.generateDiagram(
      options.documentId,
      {
        title: pr.title,
        description: pr.body,
        diff,
        truncated,
      },
      options.version
    );

    if (truncated) {
      core.info("Diagram generated successfully (with truncated diff)");
    } else {
      core.info("Diagram generated successfully");
    }

    // Fetch image and convert to base64
    core.info("Fetching diagram image...");
    const imageResult = await client.fetchImageAsBase64(response.outputImageUrl, response.mimeType);

    // Use data URL if image fits, otherwise fall back to presigned URL
    const imageUrl = imageResult.dataUrl ?? response.outputImageUrl;
    const isEmbedded = !imageResult.tooLarge;

    if (imageResult.tooLarge) {
      core.info("Image too large for inline embedding, using presigned URL");
    } else {
      core.info("Image embedded as base64");
    }

    // Check for existing comment and update or create
    const existingComment = await findDiagramComment(context);
    let commentId: number;

    if (existingComment) {
      core.info(`Updating existing diagram comment (ID: ${existingComment.id})`);
      await updateDiagramComment(
        context,
        existingComment.id,
        imageUrl,
        response.fileId,
        isEmbedded
      );
      commentId = existingComment.id;
    } else {
      core.info("Creating new diagram comment");
      commentId = await createDiagramComment(context, imageUrl, response.fileId, isEmbedded);
    }

    return {
      success: true,
      imageUrl,
      fileId: response.fileId,
      commentId,
    };
  } catch (error) {
    // Handle specific errors
    if (error instanceof RateLimitError) {
      core.warning(`Rate limit exceeded: ${error.message}`);
      await postErrorComment(context, getRateLimitErrorComment(error.message));
      return { success: false };
    }

    if (error instanceof PayloadTooLargeError) {
      core.warning("Payload too large for API");
      await postErrorComment(context, getPayloadTooLargeErrorComment());
      return { success: false };
    }

    if (error instanceof TimeoutError) {
      core.warning("Request timed out");
      await postErrorComment(context, getTimeoutErrorComment(options.timeoutMs / 1000));
      return { success: false };
    }

    // Generic error
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    core.error(`Diagram generation failed: ${errorMessage}`);
    await postErrorComment(context, getGenericErrorComment(errorMessage));
    return { success: false };
  }
}
