import { describe, test, expect } from "vitest";
import {
  LogicApiError,
  RateLimitError,
  PayloadTooLargeError,
  TimeoutError,
  DiagramNotFoundError,
  getRateLimitErrorComment,
  getPayloadTooLargeErrorComment,
  getTimeoutErrorComment,
  getGenericErrorComment,
  getForkSkipComment,
  getRefreshNotFoundComment,
} from "../../../src/errors/index.js";

describe("Unit: errors", () => {
  describe("Error classes", () => {
    test("should create LogicApiError with message and status code", () => {
      const error = new LogicApiError("Test error", 500);
      expect(error.message).toBe("Test error");
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe("LogicApiError");
    });

    test("should create RateLimitError with default message", () => {
      const error = new RateLimitError();
      expect(error.message).toBe("Rate limit exceeded");
      expect(error.statusCode).toBe(429);
      expect(error.name).toBe("RateLimitError");
    });

    test("should create PayloadTooLargeError with default message", () => {
      const error = new PayloadTooLargeError();
      expect(error.message).toBe("Payload too large");
      expect(error.statusCode).toBe(413);
      expect(error.name).toBe("PayloadTooLargeError");
    });

    test("should create TimeoutError with default message", () => {
      const error = new TimeoutError();
      expect(error.message).toBe("Request timed out");
      expect(error.name).toBe("TimeoutError");
    });

    test("should create DiagramNotFoundError with default message", () => {
      const error = new DiagramNotFoundError();
      expect(error.message).toBe("No existing diagram comment found");
      expect(error.name).toBe("DiagramNotFoundError");
    });
  });

  describe("Error comment templates", () => {
    test("should return rate limit error comment with default message", () => {
      const comment = getRateLimitErrorComment();
      expect(comment).toContain("Rate Limited");
      expect(comment).toContain("Rate limit exceeded");
    });

    test("should return rate limit error comment with custom message", () => {
      const comment = getRateLimitErrorComment(
        "Daily image generation limit reached. Please try again tomorrow."
      );
      expect(comment).toContain("Rate Limited");
      expect(comment).toContain("Daily image generation limit reached");
    });

    test("should return payload too large error comment", () => {
      const comment = getPayloadTooLargeErrorComment();
      expect(comment).toContain("PR Too Large");
      expect(comment).toContain("Payload too large");
    });

    test("should return timeout error comment with seconds", () => {
      const comment = getTimeoutErrorComment(30);
      expect(comment).toContain("Timeout");
      expect(comment).toContain("30 seconds");
    });

    test("should return generic error comment with message", () => {
      const comment = getGenericErrorComment("Something went wrong");
      expect(comment).toContain("Diagram Generation Failed");
      expect(comment).toContain("Something went wrong");
    });

    test("should return fork skip comment", () => {
      const comment = getForkSkipComment();
      expect(comment).toContain("Skipped");
      expect(comment).toContain("forked repositories");
    });

    test("should return refresh not found comment", () => {
      const comment = getRefreshNotFoundComment();
      expect(comment).toContain("Refresh Failed");
      expect(comment).toContain("/generate-diagram");
    });
  });
});
