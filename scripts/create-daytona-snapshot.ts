/**
 * One-off script to create a Daytona snapshot for the open-agents app.
 *
 * The snapshot includes:
 * - Bun runtime + git + system deps
 * - The repo cloned from GitHub
 * - All dependencies pre-installed (bun install)
 * - Source code ready for the agent to edit
 *
 * The app does NOT auto-start — the user hits "Start dev server" in the UI,
 * which runs `bun run dev` with runtime env vars from the sandbox.
 *
 * Usage:
 *   DAYTONA_API_KEY=your-key bun run scripts/create-daytona-snapshot.ts
 *
 * Options (env vars):
 *   DAYTONA_API_KEY       - Required. Your Daytona API key.
 *   SNAPSHOT_NAME         - Snapshot name (default: "open-agents")
 *   REPO_URL              - Git repo URL (default: https://github.com/mu-hashmi/open-agents.git)
 *   REPO_BRANCH           - Branch to clone (default: "daytona-backend")
 */

import { Daytona, Image } from "@daytona/sdk";

const SNAPSHOT_NAME = process.env.SNAPSHOT_NAME ?? "open-agents";
const REPO_URL =
  process.env.REPO_URL ??
  "https://github.com/mu-hashmi/open-agents.git";
const REPO_BRANCH = process.env.REPO_BRANCH ?? "daytona-backend";

const WORKSPACE = "/home/daytona/workspace";

const image = Image.base("oven/bun:1.2.14-debian")
  .runCommands(
    // System deps: git for cloning, curl for health checks, ca-certs for HTTPS
    "apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates && rm -rf /var/lib/apt/lists/*",
  )
  .workdir(WORKSPACE)
  .runCommands(
    // Clone the repo
    `git clone --branch ${REPO_BRANCH} --single-branch --depth 1 ${REPO_URL} .`,
    // Install all dependencies (this is the slow part we want pre-baked)
    "bun install",
  )
  .entrypoint(["sleep", "infinity"]);

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) {
    console.error("DAYTONA_API_KEY is required");
    process.exit(1);
  }

  const daytona = new Daytona({ apiKey });

  console.log(`Creating snapshot "${SNAPSHOT_NAME}" from ${REPO_URL}@${REPO_BRANCH}...`);
  console.log("This will take a few minutes (cloning repo + bun install).\n");

  const snapshot = await daytona.snapshot.create(
    {
      name: SNAPSHOT_NAME,
      image,
      resources: { cpu: 2, memory: 4, disk: 10 },
    },
    {
      onLogs: (chunk) => process.stdout.write(chunk),
      timeout: 0, // no timeout — let it finish
    },
  );

  console.log(`\nSnapshot created: ${snapshot.name} (${snapshot.id})`);
  console.log(`State: ${snapshot.state}`);
  console.log(`\nUse this snapshot in the UI "From snapshot" picker, or create a sandbox with:`);
  console.log(`  daytona create --snapshot ${SNAPSHOT_NAME}`);
}

main().catch((error) => {
  console.error("Failed to create snapshot:", error);
  process.exit(1);
});
