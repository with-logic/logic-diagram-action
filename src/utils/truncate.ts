/**
 * Truncate a diff to a maximum length, preserving complete lines where possible
 */
export function truncateDiff(diff: string, maxLength: number): string {
  if (diff.length <= maxLength) {
    return diff;
  }

  // Find the last newline before maxLength to avoid cutting mid-line
  const truncated = diff.substring(0, maxLength);
  const lastNewline = truncated.lastIndexOf("\n");

  if (lastNewline > 0) {
    return truncated.substring(0, lastNewline) + "\n... (truncated)";
  }

  return truncated + "\n... (truncated)";
}
