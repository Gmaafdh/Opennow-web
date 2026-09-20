/**
 * Desktop lifecycle watchdog (Tauri shell).
 *
 * The desktop app runs this backend as a child process of the Rust host.
 * Normally the host terminates the backend on exit, but if the host ever
 * crashes or is force-killed, nothing would be left to clean up. This
 * watchdog polls the host PID and shuts the backend down as soon as the
 * parent disappears, so no orphaned Node process keeps listening in the
 * background.
 *
 * It is completely inert unless `OPENNOW_PARENT_PID` is set (desktop only).
 */
const WATCHDOG_INTERVAL_MS = 2_000;

export function startDesktopWatchdog(): void {
  const parentPid = Number(process.env.OPENNOW_PARENT_PID ?? Number.NaN);
  if (!Number.isInteger(parentPid) || parentPid <= 0 || parentPid === process.pid) return;

  console.log(`[Desktop] Watchdog armed for host process ${parentPid}.`);
  const timer = setInterval(() => {
    try {
      // Signal 0 is a pure existence probe — it delivers nothing.
      process.kill(parentPid, 0);
    } catch (error) {
      // EPERM would mean the process still exists but is owned by another
      // user; that cannot happen for our own parent, so treat any failure
      // as "host is gone".
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      console.log("[Desktop] Host process is gone — shutting down the backend.");
      clearInterval(timer);
      process.exit(0);
    }
  }, WATCHDOG_INTERVAL_MS);
  // Never keep the event loop alive just for the watchdog.
  if (typeof timer.unref === "function") timer.unref();
}
