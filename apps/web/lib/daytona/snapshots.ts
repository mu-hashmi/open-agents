import "server-only";

import * as DaytonaSdk from "@daytona/sdk";
import type { CreateSnapshotParams } from "@daytona/sdk";
import { createHash } from "node:crypto";

const IMAGE_SNAPSHOT_NAME_PREFIX = "open-agents:image";
const IMAGE_SNAPSHOT_HASH_LENGTH = 12;
const IMAGE_SNAPSHOT_SLUG_MAX_LENGTH = 72;
const SNAPSHOT_READY_POLL_INTERVAL_MS = 1_000;
const SNAPSHOT_READY_TIMEOUT_MS = 5 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSnapshotImageSlug(image: string): string {
  const normalized = image
    .trim()
    .toLowerCase()
    .replace(/@sha256:/g, "-sha256-")
    .replace(/[^a-z0-9_.:/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^[./:-]+|[./:-]+$/g, "");

  const truncated = normalized.slice(0, IMAGE_SNAPSHOT_SLUG_MAX_LENGTH);
  const trimmed = truncated.replace(/[./:-]+$/g, "");

  return trimmed || "image";
}

function isSnapshotFailureState(state: string): boolean {
  const normalized = state.toLowerCase();
  return normalized === "build_failed" || normalized === "error";
}

function matchesDaytonaErrorByName(
  error: unknown,
  expectedName: string,
): boolean {
  return error instanceof Error && error.name === expectedName;
}

function hasDaytonaStatusCode(
  error: unknown,
  expectedStatusCode: number,
): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    "statusCode" in error &&
    (error as { statusCode?: unknown }).statusCode === expectedStatusCode
  );
}

function isDaytonaConflictError(error: unknown): boolean {
  return (
    (typeof DaytonaSdk.DaytonaConflictError === "function" &&
      error instanceof DaytonaSdk.DaytonaConflictError) ||
    matchesDaytonaErrorByName(error, "DaytonaConflictError") ||
    matchesDaytonaErrorByName(error, "MockDaytonaConflictError") ||
    hasDaytonaStatusCode(error, 409)
  );
}

function isDaytonaNotFoundError(error: unknown): boolean {
  return (
    (typeof DaytonaSdk.DaytonaNotFoundError === "function" &&
      error instanceof DaytonaSdk.DaytonaNotFoundError) ||
    matchesDaytonaErrorByName(error, "DaytonaNotFoundError") ||
    matchesDaytonaErrorByName(error, "MockDaytonaNotFoundError") ||
    hasDaytonaStatusCode(error, 404)
  );
}

export function buildAutomaticDaytonaImageSnapshotName(image: string): string {
  const normalizedImage = image.trim().toLowerCase();
  const slug = normalizeSnapshotImageSlug(normalizedImage);
  const hash = createHash("sha256")
    .update(normalizedImage)
    .digest("hex")
    .slice(0, IMAGE_SNAPSHOT_HASH_LENGTH);

  return `${IMAGE_SNAPSHOT_NAME_PREFIX}:${slug}:${hash}`;
}

async function waitForActiveDaytonaSnapshot(
  daytona: DaytonaSdk.Daytona,
  snapshotName: string,
): Promise<string> {
  const deadline = Date.now() + SNAPSHOT_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      let snapshot = await daytona.snapshot.get(snapshotName);
      const state = snapshot.state.toLowerCase();

      if (state === "active") {
        return snapshot.name;
      }

      if (state === "inactive") {
        snapshot = await daytona.snapshot.activate(snapshot);
        if (snapshot.state.toLowerCase() === "active") {
          return snapshot.name;
        }
      }

      if (isSnapshotFailureState(snapshot.state)) {
        throw new Error(
          `Daytona snapshot "${snapshotName}" entered the "${snapshot.state}" state.`,
        );
      }
    } catch (error) {
      if (!isDaytonaNotFoundError(error)) {
        throw error;
      }
    }

    await sleep(SNAPSHOT_READY_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out waiting for Daytona snapshot "${snapshotName}" to become active.`,
  );
}

export async function ensureNamedDaytonaSnapshotForImage(params: {
  apiKey: string;
  apiUrl?: string;
  image: string;
}): Promise<{ snapshotName: string; created: boolean }> {
  const snapshotName = buildAutomaticDaytonaImageSnapshotName(params.image);
  const daytona = new DaytonaSdk.Daytona({
    apiKey: params.apiKey,
    ...(params.apiUrl ? { apiUrl: params.apiUrl } : {}),
  });
  const dockerfileImage = {
    contextList: [],
    dockerfile: `FROM ${params.image}\n`,
  } as unknown as CreateSnapshotParams["image"];

  try {
    const snapshot = await daytona.snapshot.get(snapshotName);
    return {
      snapshotName: await waitForActiveDaytonaSnapshot(daytona, snapshot.name),
      created: false,
    };
  } catch (error) {
    if (!isDaytonaNotFoundError(error)) {
      throw error;
    }
  }

  try {
    const snapshot = await daytona.snapshot.create(
      {
        name: snapshotName,
        // Match the existing image-launch behavior by converting the image
        // reference into the same minimal Dockerfile-backed build payload.
        image: dockerfileImage,
      },
      { timeout: 0 },
    );

    return { snapshotName: snapshot.name, created: true };
  } catch (error) {
    if (!isDaytonaConflictError(error)) {
      throw error;
    }

    return {
      snapshotName: await waitForActiveDaytonaSnapshot(daytona, snapshotName),
      created: false,
    };
  }
}
