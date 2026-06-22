import * as esbuild from "esbuild";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

console.log("Building logic-diagram-action...");

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  outfile: "dist/index.js",
  format: "cjs",
  sourcemap: true,
  minify: false,
  // Bundle all dependencies into the output file
  // This is required for GitHub Actions
  external: [],
  banner: {
    js: `// logic-diagram-action v${pkg.version}\n// https://github.com/with-logic/logic-diagram-action`,
  },
  define: {
    "process.env.npm_package_version": JSON.stringify(pkg.version),
  },
});

console.log("Build complete: dist/index.js");
