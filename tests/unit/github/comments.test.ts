import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import type { ActionContext } from "../../../src/github/context.js";
import { COMMENT_MARKER_PREFIX, COMMENT_MARKER_SUFFIX } from "../../../src/utils/constants.js";

// Mock @actions/github
const mockListComments = vi.fn();
const mockCreateComment = vi.fn();
const mockUpdateComment = vi.fn();

vi.mock("@actions/github", () => ({
  getOctokit: () => ({
    rest: {
      issues: {
        listComments: mockListComments,
        createComment: mockCreateComment,
        updateComment: mockUpdateComment,
      },
    },
  }),
}));

// Import after mocking
import {
  findDiagramComment,
  createDiagramComment,
  updateDiagramComment,
  postErrorComment,
} from "../../../src/github/comments.js";

describe("Unit: comments", () => {
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

  const mockFileId = "test-file-id-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("findDiagramComment", () => {
    test("should find existing diagram comment", async () => {
      const commentBody = `## Architecture Diagram\n\n![Diagram](https://example.com/img.png)\n\n${COMMENT_MARKER_PREFIX}${mockFileId}${COMMENT_MARKER_SUFFIX}`;

      mockListComments.mockResolvedValue({
        data: [
          { id: 1, body: "Regular comment" },
          { id: 2, body: commentBody },
          { id: 3, body: "Another comment" },
        ],
      });

      const result = await findDiagramComment(mockContext);

      expect(result).toEqual({
        id: 2,
        fileId: mockFileId,
        body: commentBody,
      });
    });

    test("should return null if no diagram comment exists", async () => {
      mockListComments.mockResolvedValue({
        data: [
          { id: 1, body: "Regular comment" },
          { id: 2, body: "Another regular comment" },
        ],
      });

      const result = await findDiagramComment(mockContext);

      expect(result).toBeNull();
    });

    test("should return null for empty comments list", async () => {
      mockListComments.mockResolvedValue({
        data: [],
      });

      const result = await findDiagramComment(mockContext);

      expect(result).toBeNull();
    });
  });

  describe("createDiagramComment", () => {
    test("should create a new diagram comment", async () => {
      mockCreateComment.mockResolvedValue({
        data: { id: 456 },
      });

      const result = await createDiagramComment(
        mockContext,
        "https://example.com/image.png",
        mockFileId
      );

      expect(result).toBe(456);
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Architecture Diagram"),
      });
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining(mockFileId),
      });
    });
  });

  describe("updateDiagramComment", () => {
    test("should update an existing diagram comment", async () => {
      mockUpdateComment.mockResolvedValue({
        data: { id: 789 },
      });

      await updateDiagramComment(mockContext, 789, "https://example.com/new-image.png", mockFileId);

      expect(mockUpdateComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        comment_id: 789,
        body: expect.stringContaining("https://example.com/new-image.png"),
      });
    });
  });

  describe("postErrorComment", () => {
    test("should post an error comment", async () => {
      mockCreateComment.mockResolvedValue({
        data: { id: 111 },
      });

      await postErrorComment(mockContext, "Error: Something went wrong");

      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: "Error: Something went wrong",
      });
    });
  });
});
