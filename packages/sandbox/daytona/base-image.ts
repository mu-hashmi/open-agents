import { Image } from "@daytona/sdk";

const OPEN_HARNESS_DAYTONA_BASE_IMAGE = "oven/bun:1.2.14-debian";
const DEFAULT_SYSTEM_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const DEFAULT_CHROMIUM_PATH = "/usr/bin/chromium";

/**
 * Managed base runtime for blank Daytona sandboxes when a deployment chooses
 * to publish a shared image or create an org-scoped base snapshot from it.
 * Keep this in sync with `docker/daytona-base/Dockerfile`.
 */
export function buildOpenHarnessDaytonaBaseImage(): Image {
  return Image.base(OPEN_HARNESS_DAYTONA_BASE_IMAGE)
    .env({
      DEBIAN_FRONTEND: "noninteractive",
      PATH: DEFAULT_SYSTEM_PATH,
      AGENT_BROWSER_EXECUTABLE_PATH: DEFAULT_CHROMIUM_PATH,
    })
    .runCommands(
      "apt-get update && apt-get install -y --no-install-recommends ca-certificates chromium curl git jq nodejs npm procps ripgrep && rm -rf /var/lib/apt/lists/*",
      "curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=standalone --prefix=/usr/local",
      "npm install --global agent-browser",
    )
    .workdir("/home/daytona")
    .entrypoint(["sleep", "infinity"]);
}
