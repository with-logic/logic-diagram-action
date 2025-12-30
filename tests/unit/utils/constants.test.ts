import { describe, test, expect } from "vitest";
import {
  extractFileIdFromComment,
  createCommentMarker,
  COMMENT_MARKER_PREFIX,
  COMMENT_MARKER_SUFFIX,
} from "../../../src/utils/constants.js";

describe("Unit: constants", () => {
  describe("extractFileIdFromComment", () => {
    test("should extract file ID from a valid comment", () => {
      const body = `## Architecture Diagram

![Diagram](https://example.com/image.png)

${COMMENT_MARKER_PREFIX}abc123-def456${COMMENT_MARKER_SUFFIX}`;

      const result = extractFileIdFromComment(body);
      expect(result).toBe("abc123-def456");
    });

    test("should return null if marker is not present", () => {
      const body = "Just a regular comment without the marker";
      const result = extractFileIdFromComment(body);
      expect(result).toBeNull();
    });

    test("should return null if marker is malformed (no closing)", () => {
      const body = `${COMMENT_MARKER_PREFIX}abc123`;
      const result = extractFileIdFromComment(body);
      expect(result).toBeNull();
    });

    test("should handle UUIDs", () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      const body = `Some text ${createCommentMarker(uuid)} more text`;
      const result = extractFileIdFromComment(body);
      expect(result).toBe(uuid);
    });
  });

  describe("createCommentMarker", () => {
    test("should create a valid marker", () => {
      const fileId = "test-file-id";
      const marker = createCommentMarker(fileId);
      expect(marker).toBe(`${COMMENT_MARKER_PREFIX}${fileId}${COMMENT_MARKER_SUFFIX}`);
    });

    test("should be extractable by extractFileIdFromComment", () => {
      const fileId = "roundtrip-test-id";
      const marker = createCommentMarker(fileId);
      const extracted = extractFileIdFromComment(marker);
      expect(extracted).toBe(fileId);
    });
  });
});
