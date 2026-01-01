import * as github from "@actions/github";
import type { ActionContext } from "./context.js";

export interface PullRequestData {
  title: string;
  body: string;
  diff: string;
  isFork: boolean;
  isDraft: boolean;
}

/**
 * Fetch pull request details including title, body, and diff
 */
export async function fetchPullRequest(context: ActionContext): Promise<PullRequestData> {
  const octokit = github.getOctokit(context.token);

  // Fetch PR metadata
  const { data: pr } = await octokit.rest.pulls.get({
    owner: context.owner,
    repo: context.repo,
    pull_number: context.prNumber,
  });

  // Fetch PR diff - the diff media type returns a string, not the usual PR object
  const response = await octokit.rest.pulls.get({
    owner: context.owner,
    repo: context.repo,
    pull_number: context.prNumber,
    mediaType: {
      format: "diff",
    },
  });

  // Octokit types don't account for media type overrides, so validate at runtime
  const diff = response.data;
  if (typeof diff !== "string") {
    throw new Error("Unexpected response format: expected diff string");
  }

  return {
    title: pr.title,
    body: pr.body ?? "",
    diff,
    isFork: pr.head.repo?.fork ?? false,
    isDraft: pr.draft ?? false,
  };
}
