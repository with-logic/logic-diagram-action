import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPullRequest } from "../../../src/github/pr.js";
import type { ActionContext } from "../../../src/github/context.js";

// Mock @actions/github
const mockGet = vi.fn();
vi.mock("@actions/github", () => ({
  getOctokit: () => ({
    rest: {
      pulls: {
        get: mockGet,
      },
    },
  }),
}));

describe("Unit: pr", () => {
  const mockContext: ActionContext = {
    owner: "test-owner",
    repo: "test-repo",
    prNumber: 123,
    commentBody: "/generate-diagram",
    commandType: "generate",
    isFork: false,
    isDraft: false,
    token: "test-token",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchPullRequest", () => {
    test("should fetch PR data successfully", async () => {
      // First call returns PR metadata
      mockGet.mockResolvedValueOnce({
        data: {
          title: "Test PR Title",
          body: "Test PR Body",
          draft: false,
          head: {
            repo: {
              fork: false,
            },
          },
        },
      });

      // Second call returns diff
      mockGet.mockResolvedValueOnce({
        data: "diff --git a/file.txt b/file.txt\n+new line",
      });

      const result = await fetchPullRequest(mockContext);

      expect(result).toEqual({
        title: "Test PR Title",
        body: "Test PR Body",
        diff: "diff --git a/file.txt b/file.txt\n+new line",
        isFork: false,
        isDraft: false,
      });
    });

    test("should detect fork PRs", async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          title: "Fork PR",
          body: "From a fork",
          draft: false,
          head: {
            repo: {
              fork: true,
            },
          },
        },
      });

      mockGet.mockResolvedValueOnce({
        data: "diff content",
      });

      const result = await fetchPullRequest(mockContext);

      expect(result.isFork).toBe(true);
    });

    test("should detect draft PRs", async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          title: "Draft PR",
          body: "Work in progress",
          draft: true,
          head: {
            repo: {
              fork: false,
            },
          },
        },
      });

      mockGet.mockResolvedValueOnce({
        data: "diff content",
      });

      const result = await fetchPullRequest(mockContext);

      expect(result.isDraft).toBe(true);
    });

    test("should handle null body", async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          title: "PR without body",
          body: null,
          draft: false,
          head: {
            repo: {
              fork: false,
            },
          },
        },
      });

      mockGet.mockResolvedValueOnce({
        data: "diff content",
      });

      const result = await fetchPullRequest(mockContext);

      expect(result.body).toBe("");
    });

    test("should throw error if diff response is not a string", async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          title: "Test PR",
          body: "Test body",
          draft: false,
          head: {
            repo: {
              fork: false,
            },
          },
        },
      });

      // Mock unexpected response format (object instead of string)
      mockGet.mockResolvedValueOnce({
        data: { unexpected: "object" },
      });

      await expect(fetchPullRequest(mockContext)).rejects.toThrow(
        "Unexpected response format: expected diff string"
      );
    });
  });
});
