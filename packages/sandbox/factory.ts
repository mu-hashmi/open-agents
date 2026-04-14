import type { Sandbox, SandboxHooks } from "./interface";
import type { SandboxStatus } from "./types";
import { connectDaytona } from "./daytona/connect";
import type { DaytonaState } from "./daytona/state";
import { connectVercel } from "./vercel/connect";
import type { VercelState } from "./vercel/state";

// Re-export SandboxStatus from types for convenience
export type { SandboxStatus };

/**
 * Unified sandbox state type.
 * Use `type` discriminator to determine which sandbox implementation to use.
 */
export type DaytonaSandboxState = { type: "daytona" } & DaytonaState;
export type SandboxState =
  | ({ type: "vercel" } & VercelState)
  | DaytonaSandboxState;

/**
 * Base connect options for all sandbox types.
 */
export interface ConnectOptions {
  /** Environment variables available to sandbox commands */
  env?: Record<string, string>;
  /** GitHub token used for credential brokering; never exposed inside the sandbox */
  githubToken?: string;
  /** Git user for commits */
  gitUser?: { name: string; email: string };
  /** Lifecycle hooks */
  hooks?: SandboxHooks;
  /** Timeout in milliseconds for sandboxes (default: 300,000 = 5 minutes) */
  timeout?: number;
  /** Ports to expose from the sandbox for dev server preview URLs */
  ports?: number[];
  /** Snapshot ID used as the base image for new sandboxes */
  baseSnapshotId?: string;
  /** Daytona API key (required for Daytona sandboxes) */
  apiKey?: string;
  /** Whether to resume a stopped persistent sandbox session */
  resume?: boolean;
  /** Whether to create the named sandbox when it does not already exist */
  createIfMissing?: boolean;
  /** Whether new sandboxes should persist filesystem state between sessions */
  persistent?: boolean;
  /** Default expiration for automatic persistent-sandbox snapshots */
  snapshotExpiration?: number;
  /**
   * Skip git init in an empty workspace (e.g. when refreshing a Vercel base snapshot).
   */
  skipGitWorkspaceBootstrap?: boolean;
  /** Daytona auto-stop interval in minutes */
  autoStopInterval?: number;
  /** Custom Daytona image */
  image?: string;
  /** Daytona resource allocation */
  resources?: { cpu?: number; memory?: number; disk?: number };
  /** Daytona snapshot name to create sandbox from */
  snapshot?: string;
}

/**
 * Configuration for connecting to a sandbox.
 */
export type SandboxConnectConfig = {
  state: SandboxState;
  options?: ConnectOptions;
};

function assertNever(value: never): never {
  throw new Error(`Unknown sandbox type: ${String(value)}`);
}

/**
 * Connect to a sandbox based on the provided configuration.
 */
export async function connectSandbox(
  configOrState: SandboxConnectConfig | SandboxState,
  legacyOptions?: ConnectOptions,
): Promise<Sandbox> {
  const isNewApi =
    typeof configOrState === "object" &&
    "state" in configOrState &&
    typeof configOrState.state === "object" &&
    "type" in configOrState.state;

  if (isNewApi) {
    const config = configOrState as SandboxConnectConfig;
    switch (config.state.type) {
      case "vercel":
        return connectVercel(config.state, config.options);
      case "daytona":
        return connectDaytona(config.state, config.options);
      default:
        return assertNever(config.state);
    }
  }

  const state = configOrState as SandboxState;
  switch (state.type) {
    case "vercel":
      return connectVercel(state, legacyOptions);
    case "daytona":
      return connectDaytona(state, legacyOptions);
    default:
      return assertNever(state);
  }
}
