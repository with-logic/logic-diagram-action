import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import type { ActionContext } from "../../../src/github/context.js";
import { TimeoutError } from "../../../src/errors/index.js";

// Mock @actions/core
vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

// Create mock functions
const mockFindDiagramComment = vi.fn();
const mockUpdateDiagramComment = vi.fn();
const mockPostErrorComment = vi.fn();
const mockRefreshUrl = vi.fn();
const mockFetchImageAsBase64 = vi.fn();

vi.mock("../../../src/github/comments.js", () => ({
  findDiagramComment: (...args: unknown[]) => mockFindDiagramComment(...args),
  updateDiagramComment: (...args: unknown[]) => mockUpdateDiagramComment(...args),
  postErrorComment: (...args: unknown[]) => mockPostErrorComment(...args),
}));

vi.mock("../../../src/api/logic-client.js", () => ({
  LogicClient: class MockLogicClient {
    refreshUrl(...args: unknown[]) {
      return mockRefreshUrl(...args);
    }
    fetchImageAsBase64(...args: unknown[]) {
      return mockFetchImageAsBase64(...args);
    }
  },
}));

// Import after mocking
import { handleRefresh, type RefreshOptions } from "../../../src/handlers/refresh.js";

describe("Unit: handleRefresh", () => {
  const mockContext: ActionContext = {
    owner: "test-owner",
    repo: "test-repo",
    prNumber: 123,
    commentBody: "/refresh-diagram",
    commandType: "refresh",
    isFork: false,
    isDraft: false,
    token: "test-token",
  };

  const mockOptions: RefreshOptions = {
    apiToken: "test-api-token",
    timeoutMs: 60000,
    apiBaseUrl: "https://api.logic.inc/v1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should refresh diagram URL successfully", async () => {
    mockFindDiagramComment.mockResolvedValue({
      id: 789,
      fileId: "existing-file-id",
      body: "existing comment",
    });

    mockRefreshUrl.mockResolvedValue({
      processed: "https://example.com/refreshed-image.png",
    });

    mockFetchImageAsBase64.mockResolvedValue({
      base64: "iVBORw0KGgo",
      dataUrl: "data:image/png;base64,iVBORw0KGgo",
      tooLarge: false,
    });

    const result = await handleRefresh(mockContext, mockOptions);

    expect(result).toEqual({
      success: true,
      imageUrl: "data:image/png;base64,iVBORw0KGgo",
      fileId: "existing-file-id",
      commentId: 789,
    });

    expect(mockUpdateDiagramComment).toHaveBeenCalledWith(
      mockContext,
      789,
      "data:image/png;base64,iVBORw0KGgo",
      "existing-file-id",
      true
    );
  });

  test("should fall back to presigned URL when image is too large", async () => {
    mockFindDiagramComment.mockResolvedValue({
      id: 789,
      fileId: "existing-file-id",
      body: "existing comment",
    });

    mockRefreshUrl.mockResolvedValue({
      processed: "https://example.com/refreshed-image.png",
    });

    mockFetchImageAsBase64.mockResolvedValue({
      base64: null,
      dataUrl: null,
      tooLarge: true,
    });

    const result = await handleRefresh(mockContext, mockOptions);

    expect(result).toEqual({
      success: true,
      imageUrl: "https://example.com/refreshed-image.png",
      fileId: "existing-file-id",
      commentId: 789,
    });

    expect(mockUpdateDiagramComment).toHaveBeenCalledWith(
      mockContext,
      789,
      "https://example.com/refreshed-image.png",
      "existing-file-id",
      false
    );
  });

  test("should post error when no existing diagram comment found", async () => {
    mockFindDiagramComment.mockResolvedValue(null);

    const result = await handleRefresh(mockContext, mockOptions);

    expect(result.success).toBe(false);
    expect(mockPostErrorComment).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("No existing diagram")
    );
    expect(mockRefreshUrl).not.toHaveBeenCalled();
  });

  test("should handle TimeoutError", async () => {
    mockFindDiagramComment.mockResolvedValue({
      id: 789,
      fileId: "existing-file-id",
      body: "existing comment",
    });

    mockRefreshUrl.mockRejectedValue(new TimeoutError());

    const result = await handleRefresh(mockContext, mockOptions);

    expect(result.success).toBe(false);
    expect(mockPostErrorComment).toHaveBeenCalled();
  });

  test("should handle generic errors", async () => {
    mockFindDiagramComment.mockResolvedValue({
      id: 789,
      fileId: "existing-file-id",
      body: "existing comment",
    });

    mockRefreshUrl.mockRejectedValue(new Error("Something went wrong"));

    const result = await handleRefresh(mockContext, mockOptions);

    expect(result.success).toBe(false);
    expect(mockPostErrorComment).toHaveBeenCalled();
  });

  test("should handle non-Error thrown values", async () => {
    mockFindDiagramComment.mockResolvedValue({
      id: 789,
      fileId: "existing-file-id",
      body: "existing comment",
    });

    mockRefreshUrl.mockRejectedValue("string error");

    const result = await handleRefresh(mockContext, mockOptions);

    expect(result.success).toBe(false);
    expect(mockPostErrorComment).toHaveBeenCalled();
  });

  test("should handle missing URL in refresh response", async () => {
    mockFindDiagramComment.mockResolvedValue({
      id: 789,
      fileId: "existing-file-id",
      body: "existing comment",
    });

    // API returns empty response with no URLs
    mockRefreshUrl.mockResolvedValue({});

    const result = await handleRefresh(mockContext, mockOptions);

    expect(result.success).toBe(false);
    expect(mockPostErrorComment).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("No URL in file response")
    );
  });
});
