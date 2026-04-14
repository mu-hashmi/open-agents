/**
 * Create an org-scoped Daytona base snapshot for blank Open Harness sandboxes.
 *
 * This is useful when a deployment uses one shared Daytona organization.
 * For BYOK Daytona across arbitrary user orgs, prefer publishing the same
 * runtime as a Docker image and set `DAYTONA_SANDBOX_BASE_IMAGE` instead.
 *
 * Usage:
 *   DAYTONA_API_KEY=your-key bun run scripts/create-daytona-base-snapshot.ts
 *
 * Options (env vars):
 *   DAYTONA_API_KEY              - Required. Daytona API key.
 *   DAYTONA_BASE_SNAPSHOT_NAME   - Snapshot name (default: "open-harness-daytona-base")
 */

import { Daytona } from "@daytona/sdk";
import { buildOpenHarnessDaytonaBaseImage } from "../packages/sandbox/daytona/base-image";

const SNAPSHOT_NAME =
  process.env.DAYTONA_BASE_SNAPSHOT_NAME ?? "open-harness-daytona-base";

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) {
    console.error("DAYTONA_API_KEY is required");
    process.exit(1);
  }

  const daytona = new Daytona({ apiKey });

  console.log(`Creating Daytona base snapshot "${SNAPSHOT_NAME}"...`);
  console.log("This installs the shared Open Harness toolchain once.\n");

  const snapshot = await daytona.snapshot.create(
    {
      name: SNAPSHOT_NAME,
      image: buildOpenHarnessDaytonaBaseImage(),
      resources: { cpu: 2, memory: 4, disk: 10 },
    },
    {
      onLogs: (chunk) => process.stdout.write(chunk),
      timeout: 0,
    },
  );

  console.log(`\nSnapshot created: ${snapshot.name} (${snapshot.id})`);
  console.log(`State: ${snapshot.state}`);
  console.log("");
  console.log("To use it for blank Daytona sandboxes in this deployment, set:");
  console.log(`  DAYTONA_SANDBOX_BASE_SNAPSHOT=${snapshot.name}`);
}

main().catch((error) => {
  console.error("Failed to create Daytona base snapshot:", error);
  process.exit(1);
});
