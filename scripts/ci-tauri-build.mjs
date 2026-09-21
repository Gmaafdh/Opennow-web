#!/usr/bin/env node
/**
 * CI wrapper around `tauri build` that makes failures diagnosable even when
 * raw Actions logs are unreachable from restricted environments:
 *
 *   - full combined output is teed to tauri-build.log (a later workflow step
 *     can push it to a diagnostics branch),
 *   - error-looking lines plus their follow-up context (the `--> file:line`
 *     pointers) are emitted as ::error:: workflow annotations,
 *   - the output tail is appended to the step summary.
 *
 * Usage: node scripts/ci-tauri-build.mjs [-- <tauri build args>...]
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const passthroughIndex = process.argv.indexOf("--");
const tauriArgs = passthroughIndex === -1 ? [] : process.argv.slice(passthroughIndex + 1);

// Invoke the CLI through node directly (no npx, no shell) so arguments with
// quotes or braces survive verbatim on every platform.
const cliEntry = join("node_modules", "@tauri-apps", "cli", "tauri.js");
const command = existsSync(cliEntry)
  ? { file: process.execPath, args: [cliEntry, "build", ...tauriArgs] }
  : { file: "npx", args: ["tauri", "build", ...tauriArgs] };

const result = spawnSync(command.file, command.args, {
  stdio: ["ignore", "pipe", "pipe"],
  encoding: "utf8",
  shell: false,
  maxBuffer: 64 * 1024 * 1024,
});

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
process.stdout.write(output);

// Cargo progress noise — must not burn the annotation budget (note:
// "thiserror" crate names contain the word "error"!).
const NOISE = /^(Compiling|Downloaded|Downloading|Download|Updating|Fresh|Locking|Adding|Blocking|Checking|Finished|Running|Doc-tests|note:|help:|warning:|For more information|consider)/i;
const stripAnsi = (line) => line.replace(/\x1b\[[0-9;]*[mK]/g, "");

const lines = output.split(/\r?\n/).map(stripAnsi);

if (result.status !== 0) {
  try {
    writeFileSync("tauri-build.log", output);
  } catch {
    // Best-effort only.
  }

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    try {
      const tail = lines.slice(-150).join("\n");
      appendFileSync(
        summary,
        `\n## tauri build output (last 150 lines)\n\n\`\`\`\n${tail}\n\`\`\`\n`,
      );
    } catch {
      // Best-effort only.
    }
  }

  // Real diagnostics only: cargo errors, build-script panics, link failures.
  // Each error line is paired with its follow-up line (usually the
  // `--> src/main.rs:12:5` location pointer).
  const picks = [];
  for (let index = 0; index < lines.length && picks.length < 10; index += 1) {
    const line = lines[index];
    if (NOISE.test(line.trim())) continue;
    const isError =
      /^error(\[E\d+\])?:/i.test(line.trim()) ||
      /panicked at/i.test(line) ||
      /could not compile/i.test(line) ||
      /failed to (run|compile|parse|read)/i.test(line);
    if (!isError) continue;
    picks.push(line.trim());
    const next = (lines[index + 1] ?? "").trim();
    if (next && !NOISE.test(next) && picks.length < 10) picks.push(next);
  }
  for (const pick of picks) {
    console.log(`::error::${pick.slice(0, 230)}`);
  }
  process.exit(result.status ?? 1);
}
