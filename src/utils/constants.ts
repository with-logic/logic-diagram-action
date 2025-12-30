/**
 * Logic.inc API configuration
 */
export const DEFAULT_API_BASE_URL = "https://api.logic.inc/v1";
export const DEFAULT_VERSION = "draft";

/**
 * Default timeout for API requests in milliseconds
 */
export const DEFAULT_TIMEOUT_MS = 600_000; // 600 seconds

/**
 * Default maximum diff length before truncation
 */
export const DEFAULT_MAX_DIFF_LENGTH = 50_000;

/**
 * Rate limit retry configuration
 */
export const RATE_LIMIT_RETRY_DELAY_MS = 60_000; // 60 seconds
export const RATE_LIMIT_MAX_RETRIES = 1;

/**
 * Maximum base64 size for inline images
 * GitHub comments have a 65536 character limit, so we use 60000 to leave room for the rest of the comment
 */
export const MAX_INLINE_IMAGE_SIZE = 60_000;

/**
 * Command triggers
 */
export const COMMAND_GENERATE = "/generate-diagram";
export const COMMAND_REFRESH = "/refresh-diagram";

/**
 * Comment marker for identifying diagram comments
 */
export const COMMENT_MARKER_PREFIX = "<!-- logic-diagram-file-id: ";
export const COMMENT_MARKER_SUFFIX = " -->";

/**
 * Extract file ID from comment body
 */
export function extractFileIdFromComment(body: string): string | null {
  const markerStart = body.indexOf(COMMENT_MARKER_PREFIX);
  if (markerStart === -1) return null;

  const idStart = markerStart + COMMENT_MARKER_PREFIX.length;
  const idEnd = body.indexOf(COMMENT_MARKER_SUFFIX, idStart);
  if (idEnd === -1) return null;

  return body.substring(idStart, idEnd);
}

/**
 * Create comment marker with file ID
 */
export function createCommentMarker(fileId: string): string {
  return `${COMMENT_MARKER_PREFIX}${fileId}${COMMENT_MARKER_SUFFIX}`;
}
