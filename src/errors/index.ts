/**
 * Custom error types for the action
 */

export class LogicApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "LogicApiError";
  }
}

export class RateLimitError extends LogicApiError {
  constructor(message = "Rate limit exceeded") {
    super(message, 429);
    this.name = "RateLimitError";
  }
}

export class PayloadTooLargeError extends LogicApiError {
  constructor(message = "Payload too large") {
    super(message, 413);
    this.name = "PayloadTooLargeError";
  }
}

export class TimeoutError extends LogicApiError {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export class DiagramNotFoundError extends Error {
  constructor(message = "No existing diagram comment found") {
    super(message);
    this.name = "DiagramNotFoundError";
  }
}

/**
 * Error comment templates
 */

export function getRateLimitErrorComment(errorMessage?: string): string {
  const displayMessage = errorMessage ?? "Rate limit exceeded";
  return `## Rate Limited

The Logic.inc API rate limit has been exceeded.

**What to do:**
- Wait and try again later with \`/generate-diagram\`
- Consider upgrading your plan if you frequently hit limits

*Error: ${displayMessage}*`;
}

export function getPayloadTooLargeErrorComment(): string {
  return `## Diagram Generation Failed - PR Too Large

The pull request diff is too large to process, even after truncation.

**What to do:**
- Consider breaking this PR into smaller, more focused pull requests
- Try again with \`/generate-diagram\`

*Error: Payload too large*`;
}

export function getTimeoutErrorComment(timeoutSeconds: number): string {
  return `## Diagram Generation Failed - Timeout

The diagram generation request timed out after ${timeoutSeconds} seconds.

**What to do:**
- Try again with \`/generate-diagram\`
- If this persists, the PR may be too complex to process

*Error: Request timeout*`;
}

export function getGenericErrorComment(errorMessage: string): string {
  return `## Diagram Generation Failed

An error occurred while generating the architecture diagram.

**What to do:**
- Try again with \`/generate-diagram\`
- If this persists, check https://status.logic.inc

*Error: ${errorMessage}*`;
}

export function getForkSkipComment(): string {
  return `## Diagram Generation Skipped

Architecture diagram generation is not available for pull requests from forked repositories due to security restrictions on secrets access.`;
}

export function getRefreshNotFoundComment(): string {
  return `## Diagram Refresh Failed

No existing diagram was found to refresh. Please use \`/generate-diagram\` first to create a diagram.`;
}
