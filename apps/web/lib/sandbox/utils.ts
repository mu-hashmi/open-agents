import type { SandboxState } from "@open-harness/sandbox";
import {
  DEFAULT_DAYTONA_WORKING_DIRECTORY,
  SANDBOX_EXPIRES_BUFFER_MS,
} from "./config";

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function getSandboxExpiresAt(state: unknown): number | undefined {
  if (!state || typeof state !== "object") {
    return undefined;
  }

  const expiresAt = (state as { expiresAt?: unknown }).expiresAt;
  return typeof expiresAt === "number" ? expiresAt : undefined;
}

function getSandboxType(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const sandboxType = (state as { type?: unknown }).type;
  return typeof sandboxType === "string" ? sandboxType : null;
}

function getLegacySandboxId(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const sandboxId = (state as { sandboxId?: unknown }).sandboxId;
  return hasNonEmptyString(sandboxId) ? sandboxId : null;
}

function getDaytonaSessionId(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const sessionId = (state as { sessionId?: unknown }).sessionId;
  return hasNonEmptyString(sessionId) ? sessionId : null;
}

export function getDaytonaSnapshot(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const snapshot = (state as { snapshot?: unknown }).snapshot;
  return hasNonEmptyString(snapshot) ? snapshot : null;
}

export function getDaytonaImage(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const image = (state as { image?: unknown }).image;
  return hasNonEmptyString(image) ? image : null;
}

function getWorkingDirectory(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const workingDirectory = (state as { workingDirectory?: unknown })
    .workingDirectory;
  return hasNonEmptyString(workingDirectory) ? workingDirectory : null;
}

function getDaytonaResources(
  state: unknown,
): { cpu: number; memory: number; disk: number } | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const resources = (state as { resources?: unknown }).resources;
  if (!resources || typeof resources !== "object") {
    return null;
  }

  const cpu = (resources as { cpu?: unknown }).cpu;
  const memory = (resources as { memory?: unknown }).memory;
  const disk = (resources as { disk?: unknown }).disk;

  if (
    typeof cpu !== "number" ||
    typeof memory !== "number" ||
    typeof disk !== "number"
  ) {
    return null;
  }

  return { cpu, memory, disk };
}

export function getSessionSandboxName(sessionId: string): string {
  return `session_${sessionId}`;
}

export function createPendingSandboxState(
  params:
    | {
        sandboxType: "vercel";
        sessionId: string;
      }
    | {
        sandboxType: "daytona";
        sessionId: string;
        snapshot?: string;
        image?: string;
      },
): SandboxState {
  if (params.sandboxType === "daytona") {
    return {
      type: "daytona",
      sessionId: `session-${params.sessionId}`,
      workingDirectory: DEFAULT_DAYTONA_WORKING_DIRECTORY,
      ...(params.snapshot ? { snapshot: params.snapshot } : {}),
      ...(params.image ? { image: params.image } : {}),
    };
  }

  return { type: "vercel" };
}

export function getPersistentSandboxName(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const sandboxName = (state as { sandboxName?: unknown }).sandboxName;
  return hasNonEmptyString(sandboxName) ? sandboxName : null;
}

export function getResumableSandboxName(state: unknown): string | null {
  return getPersistentSandboxName(state) ?? getLegacySandboxId(state);
}

export function hasResumableSandboxState(state: unknown): boolean {
  if (getSandboxType(state) === "daytona") {
    return (
      getResumableSandboxName(state) !== null &&
      getDaytonaSessionId(state) !== null
    );
  }

  return getResumableSandboxName(state) !== null;
}

export function hasPausedSandboxState(state: unknown): boolean {
  return hasResumableSandboxState(state) && !hasRuntimeSandboxState(state);
}

/**
 * Type guard to check if a sandbox is active and ready to accept operations.
 */
export function isSandboxActive(
  state: SandboxState | null | undefined,
): state is SandboxState {
  if (!state) return false;

  if (state.type === "daytona") {
    const expiresAt = getSandboxExpiresAt(state);
    if (expiresAt === undefined) {
      return false;
    }

    if (Date.now() >= expiresAt - SANDBOX_EXPIRES_BUFFER_MS) {
      return false;
    }

    return hasRuntimeState(state);
  }

  const expiresAt = getSandboxExpiresAt(state);
  if (expiresAt === undefined) {
    return false;
  }

  if (Date.now() >= expiresAt - SANDBOX_EXPIRES_BUFFER_MS) {
    return false;
  }

  return hasRuntimeState(state);
}

/**
 * Check if we can perform operations on a live sandbox session (stop, extend, etc.).
 */
export function canOperateOnSandbox(
  state: SandboxState | null | undefined,
): state is SandboxState {
  if (!state) return false;
  return hasRuntimeState(state);
}

/**
 * Check if an unknown value represents sandbox state with live runtime data.
 */
export function hasRuntimeSandboxState(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;

  if (getSandboxType(state) === "daytona") {
    const expiresAt = getSandboxExpiresAt(state);
    if (expiresAt === undefined) {
      return false;
    }

    return (
      getResumableSandboxName(state) !== null &&
      getDaytonaSessionId(state) !== null &&
      getWorkingDirectory(state) !== null
    );
  }

  const expiresAt = getSandboxExpiresAt(state);
  if (expiresAt === undefined) {
    return false;
  }

  return hasResumableSandboxState(state);
}

export function isSandboxNotFoundError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("status code 404") ||
    normalized.includes("sandbox not found")
  );
}

/**
 * Check if an error message indicates the sandbox VM is permanently unavailable.
 */
export function isSandboxUnavailableError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("expected a stream of command data") ||
    normalized.includes("status code 410") ||
    normalized.includes("status code 404") ||
    normalized.includes("sandbox is stopped") ||
    normalized.includes("sandbox not found") ||
    normalized.includes("sandbox probe failed")
  );
}

function hasRuntimeState(state: SandboxState): boolean {
  if (state.type === "daytona") {
    const expiresAt = getSandboxExpiresAt(state);
    if (expiresAt === undefined) {
      return false;
    }

    return (
      hasResumableSandboxState(state) && getWorkingDirectory(state) !== null
    );
  }

  const expiresAt = getSandboxExpiresAt(state);
  if (expiresAt === undefined) {
    return false;
  }

  return hasResumableSandboxState(state);
}

/**
 * Clear sandbox runtime state while preserving durable resume state when available.
 */
export function clearSandboxState(
  state: SandboxState | null | undefined,
): SandboxState | null {
  if (!state) return null;

  if (state.type === "daytona") {
    const sandboxName = getPersistentSandboxName(state);
    const sandboxId = sandboxName ? null : getLegacySandboxId(state);
    const sessionId = getDaytonaSessionId(state);
    const workingDirectory = getWorkingDirectory(state);
    const resources = getDaytonaResources(state);

    if (!sessionId || !workingDirectory) {
      return { type: "daytona" } as SandboxState;
    }

    return {
      type: "daytona",
      ...(sandboxName ? { sandboxName } : {}),
      ...(sandboxId ? { sandboxId } : {}),
      sessionId,
      workingDirectory,
      ...(resources ? { resources } : {}),
    } as SandboxState;
  }

  const sandboxName = getPersistentSandboxName(state);
  const sandboxId = sandboxName ? null : getLegacySandboxId(state);

  return {
    type: state.type,
    ...(sandboxName ? { sandboxName } : {}),
    ...(sandboxId ? { sandboxId } : {}),
  } as SandboxState;
}

/**
 * Clear both runtime state and any saved resume handle.
 */
export function clearSandboxResumeState(
  state: SandboxState | null | undefined,
): SandboxState | null {
  if (!state) return null;

  return { type: state.type } as SandboxState;
}

/**
 * Clear sandbox state after an unavailable-sandbox error.
 * Hard 404s wipe the saved resume handle; other unavailable errors preserve it.
 */
export function clearUnavailableSandboxState(
  state: SandboxState | null | undefined,
  message: string,
): SandboxState | null {
  return isSandboxNotFoundError(message)
    ? clearSandboxResumeState(state)
    : clearSandboxState(state);
}
