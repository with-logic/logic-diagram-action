import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mock environment and inputs before importing main
const mockGetInput = vi.fn();
const mockSetOutput = vi.fn();
const mockSetFailed = vi.fn();
const mockInfo = vi.fn();
const mockWarning = vi.fn();
const mockError = vi.fn();

vi.mock("@actions/core", () => ({
  getInput: (...args: unknown[]) => mockGetInput(...args),
  setOutput: (...args: unknown[]) => mockSetOutput(...args),
  setFailed: (...args: unknown[]) => mockSetFailed(...args),
  info: (...args: unknown[]) => mockInfo(...args),
  warning: (...args: unknown[]) => mockWarning(...args),
  error: (...args: unknown[]) => mockError(...args),
}));

// Mock GitHub context
let mockEventName = "issue_comment";
let mockPayload: Record<string, unknown> = {};

// Controllable mocks for GitHub API
const mockPullsGet = vi.fn();
const mockListComments = vi.fn();
const mockCreateComment = vi.fn();
const mockUpdateComment = vi.fn();

vi.mock("@actions/github", () => ({
  context: {
    get eventName() {
      return mockEventName;
    },
    repo: { owner: "test-owner", repo: "test-repo" },
    get payload() {
      return mockPayload;
    },
  },
  getOctokit: () => ({
    rest: {
      pulls: {
        get: mockPullsGet,
      },
      issues: {
        listComments: mockListComments,
        createComment: mockCreateComment,
        updateComment: mockUpdateComment,
      },
    },
  }),
}));

// Mock fetch for Logic API
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { run } from "../../src/main.js";

describe("Integration: main", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.GITHUB_TOKEN = "test-github-token";
    process.env.LOGIC_API_TOKEN = "test-logic-token";

    mockEventName = "issue_comment";
    mockPayload = {
      issue: {
        number: 42,
        pull_request: { url: "https://api.github.com/repos/test/test/pulls/42" },
      },
      comment: {
        body: "/generate-diagram",
      },
    };

    mockGetInput.mockImplementation((name: string) => {
      if (name === "github_token") return "test-github-token";
      if (name === "document_id") return "test-document-id";
      if (name === "timeout") return "600";
      if (name === "max_diff_length") return "50000";
      return "";
    });

    // Default mock responses for GitHub API
    mockPullsGet
      .mockResolvedValueOnce({
        data: {
          title: "Test PR",
          body: "Test body",
          draft: false,
          head: { repo: { fork: false } },
        },
      })
      .mockResolvedValueOnce({
        data: "diff --git a/test.ts b/test.ts\n+new line",
      });
    mockListComments.mockResolvedValue({ data: [] });
    mockCreateComment.mockResolvedValue({ data: { id: 123 } });
    mockUpdateComment.mockResolvedValue({ data: { id: 123 } });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  test("should handle missing github_token", async () => {
    mockGetInput.mockImplementation((name: string, options?: { required?: boolean }) => {
      if (name === "github_token" && options?.required) {
        throw new Error("Input required and not supplied: github_token");
      }
      if (name === "document_id") return "test-document-id";
      return "";
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining("github_token"));
  });

  test("should handle missing LOGIC_API_TOKEN", async () => {
    delete process.env.LOGIC_API_TOKEN;

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining("LOGIC_API_TOKEN"));
  });

  test("should skip non-issue_comment events", async () => {
    mockEventName = "push";

    await run();

    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining("No valid trigger"));
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test("should skip comments without commands", async () => {
    mockPayload = {
      issue: {
        number: 42,
        pull_request: { url: "https://api.github.com/..." },
      },
      comment: {
        body: "Just a regular comment",
      },
    };

    await run();

    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining("No valid trigger"));
  });

  test("should skip regular issue comments (not PR)", async () => {
    mockPayload = {
      issue: {
        number: 42,
        // No pull_request property = regular issue
      },
      comment: {
        body: "/generate-diagram",
      },
    };

    await run();

    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining("No valid trigger"));
  });

  test("should process generate command successfully", async () => {
    // Mock successful API response (new format with diagramImage)
    // First call: generate diagram API
    // Second call: fetch image for base64 conversion
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            diagramImage: {
              id: "generated-file-id",
              url: "https://example.com/diagram.png",
              mimeType: "image/png",
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer),
      });

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith(
      "image_url",
      expect.stringContaining("data:image/png;base64,")
    );
    expect(mockSetOutput).toHaveBeenCalledWith("file_id", "generated-file-id");
    expect(mockSetOutput).toHaveBeenCalledWith("comment_id", "123");
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test("should process refresh command", async () => {
    mockPayload = {
      issue: {
        number: 42,
        pull_request: { url: "https://api.github.com/..." },
      },
      comment: {
        body: "/refresh-diagram",
      },
    };

    await run();

    // Will fail because no existing comment, but should not crash
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test("should use default values when optional inputs are empty", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "github_token") return "test-github-token";
      if (name === "document_id") return "test-document-id";
      // Return empty for optional inputs to test defaults
      return "";
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            diagramImage: {
              id: "file-id",
              url: "https://example.com/diagram.png",
              mimeType: "image/png",
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer),
      });

    await run();

    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test("should warn when generate command fails", async () => {
    // Mock API failure
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: "Internal server error" }),
    });

    await run();

    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining("Diagram generation was not successful")
    );
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test("should warn when refresh command fails", async () => {
    mockPayload = {
      issue: {
        number: 42,
        pull_request: { url: "https://api.github.com/..." },
      },
      comment: {
        body: "/refresh-diagram",
      },
    };

    // No existing comment means refresh will fail
    mockListComments.mockResolvedValue({ data: [] });

    await run();

    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining("Diagram refresh was not successful")
    );
    expect(mockSetFailed).not.toHaveBeenCalled();
  });
});
