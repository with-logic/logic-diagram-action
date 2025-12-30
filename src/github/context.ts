import * as github from "@actions/github";
import { COMMAND_GENERATE, COMMAND_REFRESH } from "../utils/constants.js";

export type CommandType = "generate" | "refresh" | null;

export interface ActionContext {
  owner: string;
  repo: string;
  prNumber: number;
  commentBody: string;
  commandType: CommandType;
  isFork: boolean;
  isDraft: boolean;
  token: string;
}

/**
 * Parse the GitHub context and extract relevant information
 */
export function parseContext(githubToken: string): ActionContext | null {
  const context = github.context;
  const payload = context.payload;

  // Must be an issue_comment event
  if (context.eventName !== "issue_comment") {
    return null;
  }

  // Must be a PR comment (not a regular issue comment)
  if (!payload.issue?.pull_request) {
    return null;
  }

  const commentBody = payload.comment?.body ?? "";
  const commandType = detectCommand(commentBody);

  // Must contain a valid command
  if (!commandType) {
    return null;
  }

  return {
    owner: context.repo.owner,
    repo: context.repo.repo,
    prNumber: payload.issue.number,
    commentBody,
    commandType,
    // Fork/draft status will be determined after fetching PR details
    isFork: false,
    isDraft: false,
    token: githubToken,
  };
}

/**
 * Detect which command was triggered
 */
export function detectCommand(commentBody: string): CommandType {
  const normalized = commentBody.toLowerCase().trim();

  if (normalized.includes(COMMAND_GENERATE)) {
    return "generate";
  }

  if (normalized.includes(COMMAND_REFRESH)) {
    return "refresh";
  }

  return null;
}
