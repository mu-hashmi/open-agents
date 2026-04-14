import path from "node:path";

const DOCKERFILE_PATH = path.join("docker", "daytona-base", "Dockerfile");
const BUILD_CONTEXT = path.join("docker", "daytona-base");
const DEFAULT_PLATFORMS = "linux/amd64,linux/arm64";
const DEFAULT_IMAGE_NAME = "ghcr.io/mu-hashmi/open-agents-daytona-base";
const DEFAULT_BUILDER_NAME = "open-agents-multiarch";
const IMAGE_TITLE = "Open Agents Daytona Base";
const IMAGE_DESCRIPTION =
  "Shared base runtime for blank Open Agents Daytona sandboxes";

function run(command: string[], options?: { cwd?: string; quiet?: boolean }) {
  const proc = Bun.spawnSync(command, {
    cwd: options?.cwd,
    stdout: options?.quiet ? "pipe" : "inherit",
    stderr: "inherit",
  });

  if (proc.exitCode !== 0) {
    throw new Error(`Command failed: ${command.join(" ")}`);
  }

  return new TextDecoder().decode(proc.stdout).trim();
}

function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } {
  const normalized = remoteUrl.trim();

  const httpsMatch = normalized.match(
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/,
  );
  if (httpsMatch) {
    const [, owner, repo] = httpsMatch;
    return { owner, repo };
  }

  throw new Error(`Unsupported GitHub remote URL: ${remoteUrl}`);
}

function getDefaultImageName() {
  try {
    const remoteUrl = run(["git", "remote", "get-url", "origin"], {
      quiet: true,
    });
    const { owner } = parseGitHubRemote(remoteUrl);
    return `ghcr.io/${owner}/open-agents-daytona-base`;
  } catch {
    return DEFAULT_IMAGE_NAME;
  }
}

function getDefaultTag() {
  const date = new Date().toISOString().slice(0, 10);
  const shortSha = run(["git", "rev-parse", "--short", "HEAD"], {
    quiet: true,
  });
  return `${date}-${shortSha}`;
}

function getDigest(imageRef: string) {
  const manifest = run(
    [
      "docker",
      "buildx",
      "imagetools",
      "inspect",
      imageRef,
      "--format",
      "{{json .Manifest}}",
    ],
    { quiet: true },
  );
  const parsed = JSON.parse(manifest) as { digest?: unknown };
  if (typeof parsed.digest !== "string" || parsed.digest.length === 0) {
    throw new Error(`Could not determine digest for ${imageRef}`);
  }
  return parsed.digest;
}

function ensureBuilder(builderName: string) {
  const inspectProc = Bun.spawnSync(
    ["docker", "buildx", "inspect", builderName],
    {
      stdout: "ignore",
      stderr: "ignore",
    },
  );

  if (inspectProc.exitCode !== 0) {
    run([
      "docker",
      "buildx",
      "create",
      "--name",
      builderName,
      "--driver",
      "docker-container",
      "--use",
    ]);
  } else {
    run(["docker", "buildx", "use", builderName]);
  }

  run(["docker", "buildx", "inspect", "--bootstrap", builderName]);
}

function buildAndLoadImage(params: {
  builderName: string;
  platform: string;
  targetRef: string;
  sourceUrl: string;
}) {
  run([
    "docker",
    "buildx",
    "build",
    "--builder",
    params.builderName,
    "--platform",
    params.platform,
    "--provenance=false",
    "--sbom=false",
    "--load",
    "-f",
    DOCKERFILE_PATH,
    "-t",
    params.targetRef,
    "--label",
    `org.opencontainers.image.source=${params.sourceUrl}`,
    "--label",
    `org.opencontainers.image.title=${IMAGE_TITLE}`,
    "--label",
    `org.opencontainers.image.description=${IMAGE_DESCRIPTION}`,
    BUILD_CONTEXT,
  ]);
}

function pushImage(targetRef: string) {
  run(["docker", "push", targetRef]);
}

function createManifestList(targetRefs: string[], sourceRefs: string[]) {
  run([
    "docker",
    "buildx",
    "imagetools",
    "create",
    ...targetRefs.flatMap((targetRef) => ["--tag", targetRef]),
    ...sourceRefs,
  ]);
}

function getPlatformTagSuffix(platform: string) {
  return platform.replaceAll("/", "-");
}

function main() {
  const imageName =
    process.env.DAYTONA_BASE_IMAGE_NAME ?? getDefaultImageName();
  const versionTag = process.env.DAYTONA_BASE_IMAGE_TAG ?? getDefaultTag();
  const platforms = (
    process.env.DAYTONA_BASE_IMAGE_PLATFORMS ?? DEFAULT_PLATFORMS
  )
    .split(",")
    .map((platform) => platform.trim())
    .filter((platform) => platform.length > 0);
  const builderName =
    process.env.DAYTONA_BASE_IMAGE_BUILDER ?? DEFAULT_BUILDER_NAME;
  const latestTag = `${imageName}:latest`;
  const versionedRef = `${imageName}:${versionTag}`;
  const remoteUrl = run(["git", "remote", "get-url", "origin"], {
    quiet: true,
  });
  const { owner, repo } = parseGitHubRemote(remoteUrl);
  const sourceUrl = `https://github.com/${owner}/${repo}`;

  console.log(`Publishing ${versionedRef}`);
  console.log(`Also tagging ${latestTag}`);
  console.log(`Platforms: ${platforms.join(",")}`);
  console.log(`Builder: ${builderName}`);
  console.log("");

  ensureBuilder(builderName);

  const platformRefs = platforms.map((platform) => ({
    platform,
    ref: `${imageName}:${versionTag}-${getPlatformTagSuffix(platform)}`,
  }));

  for (const platformRef of platformRefs) {
    console.log(`Building ${platformRef.platform} -> ${platformRef.ref}`);
    buildAndLoadImage({
      builderName,
      platform: platformRef.platform,
      targetRef: platformRef.ref,
      sourceUrl,
    });
    console.log(`Pushing ${platformRef.ref}`);
    pushImage(platformRef.ref);
  }

  console.log(`Creating manifest list for ${versionedRef} and ${latestTag}`);
  createManifestList(
    [versionedRef, latestTag],
    platformRefs.map((platformRef) => platformRef.ref),
  );

  const digest = getDigest(versionedRef);
  const immutableRef = `${imageName}@${digest}`;

  console.log("");
  console.log(`Published versioned tag: ${versionedRef}`);
  console.log(`Published latest tag: ${latestTag}`);
  console.log(`Immutable ref: ${immutableRef}`);
}

main();
