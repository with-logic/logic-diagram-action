import * as core from "@actions/core";
import { parseContext } from "./github/context.js";
import { handleGenerate } from "./handlers/generate.js";
import { handleRefresh } from "./handlers/refresh.js";
import {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_DIFF_LENGTH,
  DEFAULT_API_BASE_URL,
  DEFAULT_VERSION,
} from "./utils/constants.js";

/**
 * Main entry point for the action
 */
export async function run(): Promise<void> {
  try {
    // Parse action inputs
    const githubToken = core.getInput("github_token", { required: true });

    const documentId = core.getInput("document_id", { required: true });
    const timeoutInput = core.getInput("timeout");
    const maxDiffLengthInput = core.getInput("max_diff_length");
    const apiBaseUrlInput = core.getInput("api_base_url");
    const versionInput = core.getInput("version");

    const timeoutMs = timeoutInput ? parseInt(timeoutInput, 10) * 1000 : DEFAULT_TIMEOUT_MS;
    const maxDiffLength = maxDiffLengthInput
      ? parseInt(maxDiffLengthInput, 10)
      : DEFAULT_MAX_DIFF_LENGTH;
    const apiBaseUrl = apiBaseUrlInput || DEFAULT_API_BASE_URL;
    const version = versionInput || DEFAULT_VERSION;

    // Get API token from environment
    const apiToken = process.env.LOGIC_API_TOKEN;
    if (!apiToken) {
      throw new Error("LOGIC_API_TOKEN environment variable is required");
    }

    // Parse GitHub context
    const context = parseContext(githubToken);
    if (!context) {
      core.info(
        "No valid trigger detected. This action responds to /generate-diagram or /refresh-diagram comments on PRs."
      );
      return;
    }

    core.info(`Command detected: ${context.commandType}`);
    core.info(`PR #${context.prNumber} in ${context.owner}/${context.repo}`);

    // Route to appropriate handler
    let result;

    if (context.commandType === "generate") {
      result = await handleGenerate(context, {
        documentId,
        apiToken,
        timeoutMs,
        maxDiffLength,
        apiBaseUrl,
        version,
      });
    } else {
      // commandType === "refresh" (only other valid option from parseContext)
      result = await handleRefresh(context, {
        apiToken,
        timeoutMs,
        apiBaseUrl,
      });
    }

    // Set outputs
    if (result.success) {
      if (result.imageUrl) {
        core.setOutput("image_url", result.imageUrl);
      }
      if (result.fileId) {
        core.setOutput("file_id", result.fileId);
      }
      if (result.commentId) {
        core.setOutput("comment_id", result.commentId.toString());
      }
    }

    // Note: We don't fail the action on diagram generation failure
    // to keep it non-blocking. Errors are communicated via PR comments.
    if (!result.success && context.commandType === "generate") {
      core.warning("Diagram generation was not successful. Check the PR comments for details.");
    } else if (!result.success && context.commandType === "refresh") {
      core.warning("Diagram refresh was not successful. Check the PR comments for details.");
    }
  } catch (error) {
    // For unexpected errors, fail the action
    const message = error instanceof Error ? error.message : "Unknown error";
    core.setFailed(`Action failed: ${message}`);
  }
}
