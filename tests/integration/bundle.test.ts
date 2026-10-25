import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";

const runNode = promisify(execFile);
const pullPath = "/repos/test-owner/test-repo/pulls/7";
const commentPath = "/repos/test-owner/test-repo/issues/7/comments";
const title = "Bundle transport: café";
const description = "A compressed pull request";
const diff = "diff --git a/example.ts b/example.ts\n+compressed change\n";
const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("Integration: committed bundle", () => {
  test("uses the real GitHub client for compressed REST responses and a diff", async () => {
    const directory = await mkdtemp(join(tmpdir(), "diagram-action-bundle-"));
    const eventPath = join(directory, "event.json");
    const outputPath = join(directory, "output.txt");
    const requests: string[] = [];
    let generatedDescription: unknown;
    let postedComment: unknown;
    let baseUrl = "";

    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", baseUrl);
      requests.push(`${request.method} ${url.pathname}${url.search}`);
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      let data: string;

      if (url.pathname === pullPath) {
        const wantsDiff = request.headers.accept?.includes("diff");
        data = wantsDiff
          ? diff
          : JSON.stringify({
              title,
              body: description,
              draft: false,
              head: { repo: { fork: false } },
            });
        response.setHeader("Content-Type", wantsDiff ? "text/plain" : "application/json");
      } else if (url.pathname === "/documents/test-document/executions") {
        generatedDescription = JSON.parse(body).description;
        data = JSON.stringify({
          diagramImage: { id: "file-123", url: `${baseUrl}/image.png`, mimeType: "image/png" },
        });
      } else if (url.pathname === "/image.png") {
        response.setHeader("Content-Type", "image/png");
        response.end(image);
        return;
      } else if (url.pathname === commentPath && request.method === "GET") {
        data = "[]";
      } else if (url.pathname === commentPath && request.method === "POST") {
        postedComment = JSON.parse(body).body;
        response.statusCode = 201;
        data = JSON.stringify({ id: 123 });
      } else {
        response.statusCode = 404;
        response.end("Unexpected request");
        return;
      }

      if (!response.hasHeader("Content-Type")) {
        response.setHeader("Content-Type", "application/json");
      }
      response.setHeader("Content-Encoding", "gzip");
      response.end(gzipSync(data));
    });

    try {
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No loopback server port");
      baseUrl = `http://127.0.0.1:${address.port}`;
      await writeFile(
        eventPath,
        JSON.stringify({
          issue: { number: 7, pull_request: { url: `${baseUrl}${pullPath}` } },
          comment: { body: "/generate-diagram" },
        })
      );
      await writeFile(outputPath, "");

      const { stdout, stderr } = await runNode(
        process.execPath,
        [fileURLToPath(new URL("../../dist/index.js", import.meta.url))],
        {
          timeout: 10000,
          env: {
            PATH: process.env.PATH,
            GITHUB_REPOSITORY: "test-owner/test-repo",
            GITHUB_EVENT_NAME: "issue_comment",
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_API_URL: baseUrl,
            GITHUB_OUTPUT: outputPath,
            INPUT_GITHUB_TOKEN: "loopback-test-token",
            INPUT_DOCUMENT_ID: "test-document",
            INPUT_API_BASE_URL: baseUrl,
            LOGIC_API_TOKEN: "loopback-test-token",
          },
        }
      );

      expect(stderr).toBe("");
      expect(stdout).not.toContain("::error::");
      expect(requests).toEqual([
        `GET ${pullPath}`,
        `GET ${pullPath}`,
        "POST /documents/test-document/executions?version=draft",
        "GET /image.png",
        `GET ${commentPath}?per_page=100`,
        `POST ${commentPath}`,
      ]);
      expect(generatedDescription).toBe(
        [`# ${title}`, "", description, "", "## Changes", "", "```diff", "", diff, "```"].join("\n")
      );
      expect(postedComment).toContain(
        `![Architecture Diagram](data:image/png;base64,${image.toString("base64")})`
      );
      expect(postedComment).toContain("file-123");
      const output = await readFile(outputPath, "utf8");
      expect(output).toMatch(/file_id<<[^\n]+\nfile-123\n/);
      expect(output).toMatch(/comment_id<<[^\n]+\n123\n/);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await rm(directory, { recursive: true, force: true });
    }
  }, 15000);
});
