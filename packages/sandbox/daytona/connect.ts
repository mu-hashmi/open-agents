import type { ConnectOptions } from "../factory";
import type { Sandbox } from "../interface";
import { DaytonaSandbox } from "./sandbox";
import type { DaytonaState } from "./state";

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("not found") || message.includes("status code 404");
}

/**
 * Connect to a Daytona sandbox using persisted state and explicit BYOK auth.
 */
export async function connectDaytona(
  state: DaytonaState,
  options?: ConnectOptions,
): Promise<Sandbox> {
  if (!options?.apiKey) {
    throw new Error("Daytona API key is required");
  }

  const sandboxId = state.sandboxId ?? state.sandboxName;
  if (sandboxId) {
    try {
      return await DaytonaSandbox.connect(state, {
        apiKey: options.apiKey,
        env: options.env,
        githubToken: options.githubToken,
        hooks: options.hooks,
        ports: options.ports,
        resume: options.resume,
      });
    } catch (error) {
      if (!options.createIfMissing || !isNotFoundError(error)) {
        throw error;
      }
    }
  }

  const snapshot = options?.snapshot ?? state.snapshot;
  const image = snapshot ? undefined : (options?.image ?? state.image);

  return DaytonaSandbox.create({
    apiKey: options.apiKey,
    name: state.sandboxName,
    source: state.source
      ? {
          url: state.source.repo,
          branch: state.source.branch,
          token: state.source.token,
          newBranch: state.source.newBranch,
        }
      : undefined,
    env: options.env,
    githubToken: options.githubToken,
    gitUser: options.gitUser,
    hooks: options.hooks,
    autoStopInterval: options.autoStopInterval,
    image,
    resources: options.resources,
    ports: options.ports,
    snapshot,
    sessionId: state.sessionId,
  });
}
