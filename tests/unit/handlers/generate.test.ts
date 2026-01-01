import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import type { ActionContext } from "../../../src/github/context.js";
import { PayloadTooLargeError, TimeoutError, RateLimitError } from "../../../src/errors/index.js";

// Mock @actions/core
vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

// Create mock functions that can be referenced
const mockFetchPullRequest = vi.fn();
const mockFindDiagramComment = vi.fn();
const mockCreateDiagramComment = vi.fn();
const mockUpdateDiagramComment = vi.fn();
const mockPostErrorComment = vi.fn();
const mockGenerateDiagram = vi.fn();
const mockFetchImageAsBase64 = vi.fn();

vi.mock("../../../src/github/pr.js", () => ({
  fetchPullRequest: (...args: unknown[]) => mockFetchPullRequest(...args),
}));

vi.mock("../../../src/github/comments.js", () => ({
  findDiagramComment: (...args: unknown[]) => mockFindDiagramComment(...args),
  createDiagramComment: (...args: unknown[]) => mockCreateDiagramComment(...args),
  updateDiagramComment: (...args: unknown[]) => mockUpdateDiagramComment(...args),
  postErrorComment: (...args: unknown[]) => mockPostErrorComment(...args),
}));

vi.mock("../../../src/api/logic-client.js", () => ({
  LogicClient: class MockLogicClient {
    generateDiagram(...args: unknown[]) {
      return mockGenerateDiagram(...args);
    }
    fetchImageAsBase64(...args: unknown[]) {
      return mockFetchImageAsBase64(...args);
    }
  },
}));

// Import after mocking
import { handleGenerate, type GenerateOptions } from "../../../src/handlers/generate.js";

describe("Unit: handleGenerate", () => {
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

  const mockOptions: GenerateOptions = {
    documentId: "test-doc-id",
    apiToken: "test-api-token",
    timeoutMs: 60000,
    maxDiffLength: 50000,
    apiBaseUrl: "https://api.logic.inc/v1",
    version: "draft",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should generate diagram successfully and create new comment", async () => {
    mockFetchPullRequest.mockResolvedValue({
      title: "Test PR",
      body: "Test body",
      diff: "diff content",
      isFork: false,
      isDraft: false,
    });

    mockGenerateDiagram.mockResolvedValue({
      outputImageUrl: "https://example.com/image.png",
      fileId: "generated-file-id",
      mimeType: "image/png",
    });

    mockFetchImageAsBase64.mockResolvedValue({
      base64: "iVBORw0KGgo",
      dataUrl: "data:image/png;base64,iVBORw0KGgo",
      tooLarge: false,
    });

    mockFindDiagramComment.mockResolvedValue(null);
    mockCreateDiagramComment.mockResolvedValue(456);

    const result = await handleGenerate(mockContext, mockOptions);

    expect(result).toEqual({
      success: true,
      imageUrl: "data:image/png;base64,iVBORw0KGgo",
      fileId: "generated-file-id",
      commentId: 456,
    });
  });

  test("should update existing comment instead of creating new one", async () => {
    mockFetchPullRequest.mockResolvedValue({
      title: "Test PR",
      body: "Test body",
      diff: "diff content",
      isFork: false,
      isDraft: false,
    });

    mockGenerateDiagram.mockResolvedValue({
      outputImageUrl: "https://example.com/image.png",
      fileId: "generated-file-id",
      mimeType: "image/png",
    });

    mockFetchImageAsBase64.mockResolvedValue({
      base64: "iVBORw0KGgo",
      dataUrl: "data:image/png;base64,iVBORw0KGgo",
      tooLarge: false,
    });

    mockFindDiagramComment.mockResolvedValue({
      id: 789,
      fileId: "old-file-id",
      body: "old comment",
    });

    const result = await handleGenerate(mockContext, mockOptions);

    expect(result.commentId).toBe(789);
    expect(mockUpdateDiagramComment).toHaveBeenCalled();
    expect(mockCreateDiagramComment).not.toHaveBeenCalled();
  });

  test("should skip fork PRs and post notification", async () => {
    mockFetchPullRequest.mockResolvedValue({
      title: "Fork PR",
      body: "From fork",
      diff: "diff",
      isFork: true,
      isDraft: false,
    });

    const result = await handleGenerate(mockContext, mockOptions);

    expect(result.success).toBe(false);
    expect(mockPostErrorComment).toHaveBeenCalled();
  });

  test("should skip draft PRs silently", async () => {
    mockFetchPullRequest.mockResolvedValue({
      title: "Draft PR",
      body: "WIP",
      diff: "diff",
      isFork: false,
      isDraft: true,
    });

    const result = await handleGenerate(mockContext, mockOptions);

    expect(result.success).toBe(false);
    expect(mockPostErrorComment).not.toHaveBeenCalled();
  });

  test("should handle PayloadTooLargeError", async () => {
    mockFetchPullRequest.mockResolvedValue({
      title: "Test PR",
      body: "Test body",
      diff: "diff content",
      isFork: false,
      isDraft: false,
    });

    mockGenerateDiagram.mockRejectedValue(new PayloadTooLargeError());

    const result = await handleGenerate(mockContext, mockOptions);

    expect(result.success).toBe(false);
    expect(mockPostErrorComment).toHaveBeenCalled();
  });

  test("should handle TimeoutError", async () => {
    mockFetchPullRequest.mockResolvedValue({
      title: "Test PR",
      body: "Test body",
      diff: "diff content",
      isFork: false,
      isDraft: false,
    });

    mockGenerateDiagram.mockRejectedValue(new TimeoutError());

    const result = await handleGenerate(mockContext, mockOptions);

    expect(result.success).toBe(false);
    expect(mockPostErrorComment).toHaveBeenCalled();
  });

  test("should handle RateLimitError", async () => {
    mockFetchPullRequest.mockResolvedValue({
      title: "Test PR",
      body: "Test body",
      diff: "diff content",
      isFork: false,
      isDraft: false,
    });

    mockGenerateDiagram.mockRejectedValue(new RateLimitError());

    const result = await handleGenerate(mockContext, mockOptions);

    expect(result.success).toBe(false);
    expect(mockPostErrorComment).toHaveBeenCalled();
  });

  test("should handle generic errors", async () => {
    mockFetchPullRequest.mockResolvedValue({
      title: "Test PR",
      body: "Test body",
      diff: "diff content",
      isFork: false,
      isDraft: false,
    });

    mockGenerateDiagram.mockRejectedValue(new Error("Something went wrong"));

    const result = await handleGenerate(mockContext, mockOptions);

    expect(result.success).toBe(false);
    expect(mockPostErrorComment).toHaveBeenCalled();
  });

  test("should handle non-Error thrown values", async () => {
    mockFetchPullRequest.mockResolvedValue({
      title: "Test PR",
      body: "Test body",
      diff: "diff content",
      isFork: false,
      isDraft: false,
    });

    mockGenerateDiagram.mockRejectedValue("string error");

    const result = await handleGenerate(mockContext, mockOptions);

    expect(result.success).toBe(false);
    expect(mockPostErrorComment).toHaveBeenCalled();
  });

  test("should proactively truncate large diffs before API call", async () => {
    const largeDiff = "x".repeat(60000); // larger than maxDiffLength of 50000

    mockFetchPullRequest.mockResolvedValue({
      title: "Test PR",
      body: "Test body",
      diff: largeDiff,
      isFork: false,
      isDraft: false,
    });

    mockGenerateDiagram.mockResolvedValue({
      outputImageUrl: "https://example.com/image.png",
      fileId: "file-id",
      mimeType: "image/png",
    });

    mockFetchImageAsBase64.mockResolvedValue({
      base64: "iVBORw0KGgo",
      dataUrl: "data:image/png;base64,iVBORw0KGgo",
      tooLarge: false,
    });

    mockFindDiagramComment.mockResolvedValue(null);
    mockCreateDiagramComment.mockResolvedValue(456);

    const result = await handleGenerate(mockContext, mockOptions);

    expect(result.success).toBe(true);
    // Only called once - truncation happens before API call, not as a retry
    expect(mockGenerateDiagram).toHaveBeenCalledTimes(1);
    // Verify truncated flag was passed
    expect(mockGenerateDiagram).toHaveBeenCalledWith(
      mockOptions.documentId,
      expect.objectContaining({ truncated: true }),
      mockOptions.version
    );
  });

  test("should fall back to presigned URL when image is too large", async () => {
    mockFetchPullRequest.mockResolvedValue({
      title: "Test PR",
      body: "Test body",
      diff: "diff content",
      isFork: false,
      isDraft: false,
    });

    mockGenerateDiagram.mockResolvedValue({
      outputImageUrl: "https://example.com/image.png",
      fileId: "generated-file-id",
      mimeType: "image/png",
    });

    mockFetchImageAsBase64.mockResolvedValue({
      base64: null,
      dataUrl: null,
      tooLarge: true,
    });

    mockFindDiagramComment.mockResolvedValue(null);
    mockCreateDiagramComment.mockResolvedValue(456);

    const result = await handleGenerate(mockContext, mockOptions);

    expect(result).toEqual({
      success: true,
      imageUrl: "https://example.com/image.png",
      fileId: "generated-file-id",
      commentId: 456,
    });
    // Verify fallback URL is used (not data URL)
    expect(mockCreateDiagramComment).toHaveBeenCalledWith(
      mockContext,
      "https://example.com/image.png",
      "generated-file-id",
      false
    );
  });

  test("should fail when API returns PayloadTooLargeError even after proactive truncation", async () => {
    const largeDiff = "x".repeat(60000);

    mockFetchPullRequest.mockResolvedValue({
      title: "Test PR",
      body: "Test body",
      diff: largeDiff,
      isFork: false,
      isDraft: false,
    });

    // Even with proactive truncation, API might still reject
    mockGenerateDiagram.mockRejectedValue(new PayloadTooLargeError());

    const result = await handleGenerate(mockContext, mockOptions);

    expect(result.success).toBe(false);
    // Only called once - no retry mechanism
    expect(mockGenerateDiagram).toHaveBeenCalledTimes(1);
    expect(mockPostErrorComment).toHaveBeenCalled();
  });
});
