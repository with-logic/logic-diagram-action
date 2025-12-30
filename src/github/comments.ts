import * as github from "@actions/github";
import type { ActionContext } from "./context.js";
import {
  COMMENT_MARKER_PREFIX,
  createCommentMarker,
  extractFileIdFromComment,
} from "../utils/constants.js";

export interface DiagramComment {
  id: number;
  fileId: string;
  body: string;
}

/**
 * Find an existing diagram comment on the PR
 */
export async function findDiagramComment(context: ActionContext): Promise<DiagramComment | null> {
  const octokit = github.getOctokit(context.token);

  // List all comments on the PR
  const { data: comments } = await octokit.rest.issues.listComments({
    owner: context.owner,
    repo: context.repo,
    issue_number: context.prNumber,
    per_page: 100,
  });

  // Find the comment with our marker
  for (const comment of comments) {
    const body = comment.body ?? "";
    if (body.includes(COMMENT_MARKER_PREFIX)) {
      const fileId = extractFileIdFromComment(body);
      if (fileId) {
        return {
          id: comment.id,
          fileId,
          body,
        };
      }
    }
  }

  return null;
}

/**
 * Create a new diagram comment on the PR
 */
export async function createDiagramComment(
  context: ActionContext,
  imageUrl: string,
  fileId: string,
  isEmbedded: boolean = false
): Promise<number> {
  const octokit = github.getOctokit(context.token);

  const body = formatDiagramComment(imageUrl, fileId, isEmbedded);

  const { data: comment } = await octokit.rest.issues.createComment({
    owner: context.owner,
    repo: context.repo,
    issue_number: context.prNumber,
    body,
  });

  return comment.id;
}

/**
 * Update an existing diagram comment with a new image URL
 */
export async function updateDiagramComment(
  context: ActionContext,
  commentId: number,
  imageUrl: string,
  fileId: string,
  isEmbedded: boolean = false
): Promise<void> {
  const octokit = github.getOctokit(context.token);

  const body = formatDiagramComment(imageUrl, fileId, isEmbedded);

  await octokit.rest.issues.updateComment({
    owner: context.owner,
    repo: context.repo,
    comment_id: commentId,
    body,
  });
}

/**
 * Post an error comment on the PR
 */
export async function postErrorComment(context: ActionContext, errorBody: string): Promise<void> {
  const octokit = github.getOctokit(context.token);

  await octokit.rest.issues.createComment({
    owner: context.owner,
    repo: context.repo,
    issue_number: context.prNumber,
    body: errorBody,
  });
}

/**
 * Format the diagram comment with the standard template
 */
function formatDiagramComment(imageUrl: string, fileId: string, isEmbedded: boolean): string {
  if (isEmbedded) {
    // No expiration notice for embedded images
    return `## Architecture Diagram

![Architecture Diagram](${imageUrl})

${createCommentMarker(fileId)}`;
  }

  // Presigned URL fallback - include expiration notice
  return `## Architecture Diagram

![Architecture Diagram](${imageUrl})

---
Image link expires in ~1 hour | Comment \`/refresh-diagram\` to get a new link

${createCommentMarker(fileId)}`;
}
