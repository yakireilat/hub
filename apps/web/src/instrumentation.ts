/** Runs once when the Next.js server starts: begins the every-minute service checks. */
export async function register() {
  // Written exactly this way so Next leaves the Node-only code out of its edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
