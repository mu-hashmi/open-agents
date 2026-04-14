import type { Source } from "../types";

export interface DaytonaResourcesState {
  cpu: number;
  memory: number;
  disk: number;
}

/**
 * Persisted state for reconnecting to a Daytona sandbox.
 */
export interface DaytonaState {
  /** Daytona sandbox ID used for reconnecting. */
  sandboxId?: string;
  /** Stable sandbox name used for reconnecting. */
  sandboxName?: string;
  /** Optional Daytona snapshot used to seed a brand-new sandbox. */
  snapshot?: string;
  /** Optional Docker image reference used to seed a brand-new sandbox. */
  image?: string;
  /** Persistent shell session identifier. */
  sessionId: string;
  /** Current working directory inside the sandbox. */
  workingDirectory: string;
  /** Source repository for first-time sandbox creation. */
  source?: Source;
  /** Synthetic timeout tracking used by the app lifecycle when present. */
  expiresAt?: number;
  /** Current sandbox resources for UI display and resize flows. */
  resources?: DaytonaResourcesState;
}
