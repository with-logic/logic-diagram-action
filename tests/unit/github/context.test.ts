import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { detectCommand } from "../../../src/github/context.js";

// Mock @actions/github
vi.mock("@actions/github", () => ({
  context: {
    eventName: "issue_comment",
    repo: { owner: "test-owner", repo: "test-repo" },
    payload: {
      issue: {
        number: 123,
        pull_request: { url: "https://api.github.com/repos/test-owner/test-repo/pulls/123" },
      },
      comment: {
        body: "/generate-diagram",
      },
    },
  },
}));

describe("Unit: context", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("detectCommand", () => {
    test("should detect /generate-diagram command", () => {
      expect(detectCommand("/generate-diagram")).toBe("generate");
      expect(detectCommand("Please /generate-diagram for this PR")).toBe("generate");
      expect(detectCommand("  /generate-diagram  ")).toBe("generate");
    });

    test("should detect /refresh-diagram command", () => {
      expect(detectCommand("/refresh-diagram")).toBe("refresh");
      expect(detectCommand("Can you /refresh-diagram please")).toBe("refresh");
    });

    test("should return null for no command", () => {
      expect(detectCommand("Just a regular comment")).toBeNull();
      expect(detectCommand("")).toBeNull();
      expect(detectCommand("generate-diagram")).toBeNull();
    });

    test("should handle case insensitivity", () => {
      expect(detectCommand("/GENERATE-DIAGRAM")).toBe("generate");
      expect(detectCommand("/Generate-Diagram")).toBe("generate");
      expect(detectCommand("/REFRESH-DIAGRAM")).toBe("refresh");
    });

    test("should prioritize generate over refresh if both present", () => {
      expect(detectCommand("/generate-diagram /refresh-diagram")).toBe("generate");
    });
  });
});
