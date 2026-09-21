#!/usr/bin/env node
/**
 * CI wrapper around `tauri build` that makes failures diagnosable even when
 * raw Actions logs are unreachable: the tail of the combined output is written
 * to the step summary (check-run output, served by the regular API) and
 * error-looking lines are emitted as ::error:: workflow annotations.
 *
 * Usage: node scripts/ci-tauri-build.mjs [-- <tauri build args>...]
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const passthroughIndex = process.argv.indexOf("--");
const tauriArgs = passthroughIndex === -1 ? [] : process.argv.slice(passthroughIndex + 1);

const result = spawnSync("npx", ["tauri", "build", ...tauriArgs], {
  stdio: ["ignore", "pipe", "pipe"],
  encoding: "utf8",
  // npx is npx.cmd on Windows and needs a shell there.
  shell: process.platform === "win32",
  maxBuffer: 64 * 1024 * 1024,
});

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
process.stdout.write(output);

if (result.status !== 0) {
  const lines = output.split(/\r?\n/);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const tail = lines.slice(-150).join("\n");
    appendFileSync(
      summary,
      `\n## tauri build output (last 150 lines)\n\n\`\`\`\n${tail}\n\`\`\`\n`,
    );
  }
  const errorLines = lines.filter((line) => /error|panicked|failed/i.test(line));
  for (const line of errorLines.slice(0, 8)) {
    // Annotations must stay short; strip ANSI just in case.
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 230);
    console.log(`::error::${clean}`);
  }
  process.exit(result.status ?? 1);
}
