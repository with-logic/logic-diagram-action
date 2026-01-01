import { describe, test, expect } from "vitest";
import { truncateDiff } from "../../../src/utils/truncate.js";

describe("Unit: truncateDiff", () => {
  test("should return the original diff if under max length", () => {
    const diff = "short diff";
    const result = truncateDiff(diff, 100);
    expect(result).toBe(diff);
  });

  test("should truncate at the max length exactly if within limit", () => {
    const diff = "12345";
    const result = truncateDiff(diff, 5);
    expect(result).toBe(diff);
  });

  test("should truncate to the last newline before max length", () => {
    const diff = "line1\nline2\nline3\nline4";
    const result = truncateDiff(diff, 15);
    // 15 chars would be "line1\nline2\nli", but we cut at the last newline
    expect(result).toBe("line1\nline2\n... (truncated)");
  });

  test("should add truncation indicator", () => {
    const diff = "a".repeat(100);
    const result = truncateDiff(diff, 50);
    expect(result).toContain("... (truncated)");
  });

  test("should handle diff with no newlines", () => {
    const diff = "a".repeat(100);
    const result = truncateDiff(diff, 50);
    expect(result.length).toBeLessThanOrEqual(50 + 20); // 50 chars + truncation message
  });

  test("should handle empty diff", () => {
    const result = truncateDiff("", 100);
    expect(result).toBe("");
  });

  test("should handle diff that is exactly at max length", () => {
    const diff = "exactly10!";
    const result = truncateDiff(diff, 10);
    expect(result).toBe(diff);
  });
});
