import { Daytona, DaytonaNotFoundError } from "@daytona/sdk";
import type { Sandbox as DaytonaSdkSandbox } from "@daytona/sdk";
import type { Dirent } from "fs";
import path from "node:path";
import type {
  ExecResult,
  Sandbox,
  SandboxHooks,
  SandboxStats,
} from "../interface";
import type {
  DaytonaSandboxConfig,
  DaytonaSandboxConnectConfig,
} from "./config";
import type { DaytonaResourcesState, DaytonaState } from "./state";

const MAX_OUTPUT_LENGTH = 50_000;
const DEFAULT_USER_HOME = "/home/daytona";
const DEFAULT_AUTO_STOP_INTERVAL_MINUTES = 30;
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 60;
const DEFAULT_CREATE_TIMEOUT_SECONDS = 600;

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function truncateOutput(value = ""): {
  output: string;
  truncated: boolean;
} {
  if (value.length <= MAX_OUTPUT_LENGTH) {
    return { output: value, truncated: false };
  }

  return {
    output: value.slice(0, MAX_OUTPUT_LENGTH),
    truncated: true,
  };
}

function toTimeoutMessage(timeoutMs: number): string {
  return `Command timed out after ${timeoutMs}ms`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof DaytonaNotFoundError ||
    getErrorMessage(error).toLowerCase().includes("not found")
  );
}

function isBrokenProcessSessionError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("expected a stream of command data") ||
    message.includes("failed to write command") ||
    message.includes("broken pipe")
  );
}

function toEnoent(pathname: string, action: string): Error {
  return Object.assign(
    new Error(`ENOENT: no such file or directory, ${action} '${pathname}'`),
    { code: "ENOENT" },
  );
}

function normalizeTimeoutMs(intervalMinutes: number | undefined): {
  timeout?: number;
  expiresAt?: number;
} {
  if (intervalMinutes === undefined) {
    return {};
  }

  const timeout = intervalMinutes * 60_000;
  return {
    timeout,
    expiresAt: Date.now() + timeout,
  };
}

function toResourcesState(sandbox: DaytonaSdkSandbox): DaytonaResourcesState {
  return {
    cpu: sandbox.cpu,
    memory: sandbox.memory,
    disk: sandbox.disk,
  };
}

function resolveWorkspaceDirectory(baseWorkingDirectory?: string): string {
  const root = baseWorkingDirectory?.trim() || DEFAULT_USER_HOME;
  return root.endsWith("/workspace")
    ? root
    : path.posix.join(root, "workspace");
}

function buildGitCloneUrl(repoUrl: string, token?: string): string {
  if (!token) {
    return repoUrl;
  }

  const parsed = new URL(repoUrl);
  if (parsed.hostname !== "github.com") {
    return repoUrl;
  }

  parsed.username = "x-access-token";
  parsed.password = token;
  return parsed.toString();
}

function buildSandboxEnv(config: {
  env?: Record<string, string>;
  githubToken?: string;
}): Record<string, string> {
  if (!config.githubToken) {
    return { ...config.env };
  }

  return {
    ...config.env,
    GITHUB_TOKEN: config.githubToken,
  };
}

async function ensureSessionExists(
  sandbox: DaytonaSdkSandbox,
  sessionId: string,
): Promise<void> {
  try {
    await sandbox.process.getSession(sessionId);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    await sandbox.process.createSession(sessionId);
  }
}

async function recreateSession(
  sandbox: DaytonaSdkSandbox,
  sessionId: string,
): Promise<void> {
  try {
    await sandbox.process.deleteSession(sessionId);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  await sandbox.process.createSession(sessionId);
}

async function runSetupCommand(params: {
  sandbox: DaytonaSdkSandbox;
  sessionId: string;
  command: string;
  timeoutSeconds?: number;
}): Promise<void> {
  const result = await params.sandbox.process.executeSessionCommand(
    params.sessionId,
    { command: params.command },
    params.timeoutSeconds,
  );

  if ((result.exitCode ?? 1) !== 0) {
    throw new Error(
      `Daytona setup command failed: ${params.command}\n${result.stderr ?? result.output ?? result.stdout ?? ""}`.trim(),
    );
  }
}

async function detectCurrentBranch(params: {
  sandbox: DaytonaSdkSandbox;
  sessionId: string;
  workingDirectory: string;
}): Promise<string | undefined> {
  const result = await params.sandbox.process.executeSessionCommand(
    params.sessionId,
    {
      command: `cd ${shellEscape(params.workingDirectory)} && git symbolic-ref --short HEAD`,
    },
    10,
  );

  if ((result.exitCode ?? 1) !== 0) {
    return undefined;
  }

  const branch = result.stdout?.trim();
  return branch ? branch : undefined;
}

async function loadPreviewUrls(
  sandbox: DaytonaSdkSandbox,
  ports: number[] | undefined,
): Promise<Map<number, string>> {
  const previewUrls = new Map<number, string>();

  if (!ports || ports.length === 0) {
    return previewUrls;
  }

  await Promise.all(
    ports.map(async (port) => {
      const preview = await sandbox.getPreviewLink(port);
      previewUrls.set(port, preview.url);
    }),
  );

  return previewUrls;
}

async function ensureWorkspaceDirectory(params: {
  sandbox: DaytonaSdkSandbox;
  sessionId: string;
  workingDirectory: string;
}): Promise<void> {
  await runSetupCommand({
    sandbox: params.sandbox,
    sessionId: params.sessionId,
    command: `mkdir -p ${shellEscape(params.workingDirectory)}`,
  });
}

/**
 * Daytona-backed sandbox implementation with persistent shell sessions.
 */
export class DaytonaSandbox implements Sandbox {
  readonly type = "daytona" as const;
  readonly workingDirectory: string;
  readonly env?: Record<string, string>;
  readonly currentBranch?: string;
  readonly hooks?: SandboxHooks;
  readonly launchImage?: string;
  readonly launchSnapshot?: string;

  private _expiresAt?: number;
  private _timeout?: number;
  private readonly previewUrls: Map<number, string>;
  private sessionReadyPromise?: Promise<void>;
  private sessionRecoveryPromise?: Promise<void>;

  private constructor(
    private readonly sandbox: DaytonaSdkSandbox,
    private readonly sessionId: string,
    options: {
      workingDirectory: string;
      env?: Record<string, string>;
      currentBranch?: string;
      hooks?: SandboxHooks;
      image?: string;
      previewUrls?: Map<number, string>;
      snapshot?: string;
      timeout?: number;
      expiresAt?: number;
    },
  ) {
    this.workingDirectory = options.workingDirectory;
    this.env = options.env;
    this.currentBranch = options.currentBranch;
    this.hooks = options.hooks;
    this.launchImage = options.image;
    this.previewUrls = options.previewUrls ?? new Map();
    this.launchSnapshot = options.snapshot;
    this._timeout = options.timeout;
    this._expiresAt = options.expiresAt;
  }

  /**
   * Lazily initialize the persistent process session only for shell-backed work.
   */
  private async ensureProcessSession(): Promise<void> {
    this.sessionReadyPromise ??= ensureSessionExists(
      this.sandbox,
      this.sessionId,
    );
    const readyPromise = this.sessionReadyPromise;
    try {
      await readyPromise;
    } catch (error) {
      if (this.sessionReadyPromise === readyPromise) {
        this.sessionReadyPromise = undefined;
      }
      throw error;
    }
  }

  private async recoverProcessSession(): Promise<void> {
    if (!this.sessionRecoveryPromise) {
      const recoveryPromise = recreateSession(this.sandbox, this.sessionId);
      this.sessionRecoveryPromise = recoveryPromise;
      this.sessionReadyPromise = recoveryPromise;
    }

    const recoveryPromise = this.sessionRecoveryPromise;
    try {
      await recoveryPromise;
    } catch (error) {
      if (this.sessionReadyPromise === recoveryPromise) {
        this.sessionReadyPromise = undefined;
      }
      throw error;
    } finally {
      if (this.sessionRecoveryPromise === recoveryPromise) {
        this.sessionRecoveryPromise = undefined;
      }
    }
  }

  // Daytona can keep a session record around even after its command stream dies.
  // Rebuild that session once and retry the command instead of leaking the raw
  // broken-pipe error to callers.
  private async withRecoveredProcessSession<T>(
    execute: () => Promise<T>,
  ): Promise<T> {
    await this.ensureProcessSession();

    try {
      return await execute();
    } catch (error) {
      if (!isBrokenProcessSessionError(error)) {
        throw error;
      }

      await this.recoverProcessSession();
      return execute();
    }
  }

  get host(): string | undefined {
    const firstPreview = this.previewUrls.values().next().value;
    return firstPreview ? new URL(firstPreview).host : undefined;
  }

  get expiresAt(): number | undefined {
    return this._expiresAt;
  }

  get timeout(): number | undefined {
    return this._timeout;
  }

  get environmentDetails(): string {
    const previewLines = Array.from(this.previewUrls.entries()).map(
      ([port, url]) => `  - Port ${port}: ${url}`,
    );
    const previewBlock = previewLines.length
      ? `\n- Dev server URLs for locally running servers:\n${previewLines.join("\n")}`
      : "";

    return `- Shell commands run in a persistent Daytona session, so environment changes and background processes survive across exec calls
- All bash commands already run in the working directory by default — never prepend \`cd <working-directory> &&\`; just run the command directly
- Use workspace-relative paths for read/write/search/edit operations
- Git is already configured when a repository is attached to the sandbox
- GitHub tokens, when available, are exposed inside the sandbox as \`GITHUB_TOKEN\`
${previewBlock}`;
  }

  getState(): { type: "daytona" } & DaytonaState {
    return {
      type: "daytona",
      sandboxId: this.sandbox.id,
      sandboxName: this.sandbox.name,
      sessionId: this.sessionId,
      workingDirectory: this.workingDirectory,
      ...(this.launchImage ? { image: this.launchImage } : {}),
      ...(this._expiresAt !== undefined ? { expiresAt: this._expiresAt } : {}),
      resources: toResourcesState(this.sandbox),
      ...(this.launchSnapshot ? { snapshot: this.launchSnapshot } : {}),
    };
  }

  async readFile(pathname: string, _encoding: "utf-8"): Promise<string> {
    try {
      const buffer = (await this.sandbox.fs.downloadFile(pathname)) as Buffer;
      return buffer.toString("utf-8");
    } catch (error) {
      if (isNotFoundError(error)) {
        throw toEnoent(pathname, "open");
      }

      throw error;
    }
  }

  async writeFile(
    pathname: string,
    content: string,
    _encoding: "utf-8",
  ): Promise<void> {
    const parentDirectory = path.posix.dirname(pathname);
    if (parentDirectory && parentDirectory !== ".") {
      await this.mkdir(parentDirectory, { recursive: true });
    }

    await this.sandbox.fs.uploadFile(Buffer.from(content, "utf-8"), pathname);
  }

  async stat(pathname: string): Promise<SandboxStats> {
    try {
      const info = await this.sandbox.fs.getFileDetails(pathname);
      return {
        isDirectory: () => info.isDir,
        isFile: () => !info.isDir,
        size: info.size,
        mtimeMs: Date.parse(info.modTime),
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        throw toEnoent(pathname, "stat");
      }

      throw error;
    }
  }

  async access(pathname: string): Promise<void> {
    try {
      await this.sandbox.fs.getFileDetails(pathname);
    } catch (error) {
      if (isNotFoundError(error)) {
        throw toEnoent(pathname, "access");
      }

      throw error;
    }
  }

  async mkdir(
    pathname: string,
    options?: { recursive?: boolean },
  ): Promise<void> {
    const result = await this.withRecoveredProcessSession(() =>
      this.sandbox.process.executeSessionCommand(
        this.sessionId,
        {
          command: `mkdir ${options?.recursive ? "-p " : ""}${shellEscape(pathname)}`,
        },
        DEFAULT_CONNECT_TIMEOUT_SECONDS,
      ),
    );

    if ((result.exitCode ?? 1) !== 0) {
      throw new Error(
        result.stderr || `Failed to create directory: ${pathname}`,
      );
    }
  }

  async readdir(
    pathname: string,
    _options: { withFileTypes: true },
  ): Promise<Dirent[]> {
    try {
      const files = await this.sandbox.fs.listFiles(pathname);
      return files.map((entry) => {
        return {
          name: entry.name,
          parentPath: pathname,
          path: pathname,
          isDirectory: () => entry.isDir,
          isFile: () => !entry.isDir,
          isSymbolicLink: () => false,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isFIFO: () => false,
          isSocket: () => false,
        } as Dirent;
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        throw toEnoent(pathname, "scandir");
      }

      throw error;
    }
  }

  async exec(
    command: string,
    cwd: string,
    timeoutMs: number,
    options?: { signal?: AbortSignal },
  ): Promise<ExecResult> {
    const timeoutSeconds = Math.max(timeoutMs / 1000, 0.001);

    const abortPromise =
      options?.signal === undefined
        ? null
        : new Promise<never>((_resolve, reject) => {
            options.signal?.addEventListener(
              "abort",
              () => {
                reject(
                  new DOMException("The operation was aborted.", "AbortError"),
                );
              },
              { once: true },
            );
          });

    try {
      const execution = this.withRecoveredProcessSession(() =>
        this.sandbox.process.executeSessionCommand(
          this.sessionId,
          {
            command: `cd ${shellEscape(cwd)} && ${command}`,
          },
          timeoutSeconds,
        ),
      );

      const result = await (abortPromise
        ? Promise.race([execution, abortPromise])
        : execution);

      const stdout = truncateOutput(result.stdout ?? "");
      const stderr = truncateOutput(result.stderr ?? "");

      return {
        success: (result.exitCode ?? 1) === 0,
        exitCode: result.exitCode ?? null,
        stdout: stdout.output,
        stderr: stderr.output,
        truncated: stdout.truncated || stderr.truncated,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }

      const message = getErrorMessage(error).toLowerCase();
      if (message.includes("timed out")) {
        return {
          success: false,
          exitCode: null,
          stdout: "",
          stderr: toTimeoutMessage(timeoutMs),
          truncated: false,
        };
      }

      return {
        success: false,
        exitCode: null,
        stdout: "",
        stderr: getErrorMessage(error),
        truncated: false,
      };
    }
  }

  async execDetached(
    command: string,
    cwd: string,
  ): Promise<{ commandId: string }> {
    const result = await this.withRecoveredProcessSession(() =>
      this.sandbox.process.executeSessionCommand(
        this.sessionId,
        {
          command: `cd ${shellEscape(cwd)} && ${command}`,
          runAsync: true,
        },
        DEFAULT_CONNECT_TIMEOUT_SECONDS,
      ),
    );

    return { commandId: result.cmdId };
  }

  domain(port: number): string {
    const previewUrl = this.previewUrls.get(port);
    if (!previewUrl) {
      throw new Error(`Preview URL for port ${port} is not available`);
    }

    return previewUrl;
  }

  async stop(): Promise<void> {
    if (this.hooks?.beforeStop) {
      await this.hooks.beforeStop(this);
    }

    await this.sandbox.stop(DEFAULT_CONNECT_TIMEOUT_SECONDS);
    this._expiresAt = undefined;
    this._timeout = undefined;
  }

  async archive(): Promise<void> {
    await this.sandbox.archive();
  }

  async extendTimeout(additionalMs: number): Promise<{ expiresAt: number }> {
    const currentMinutes =
      this.sandbox.autoStopInterval ?? DEFAULT_AUTO_STOP_INTERVAL_MINUTES;
    const addedMinutes = Math.max(Math.ceil(additionalMs / 60_000), 1);
    const nextMinutes = currentMinutes + addedMinutes;

    await this.sandbox.setAutostopInterval(nextMinutes);
    Object.assign(this.sandbox, { autoStopInterval: nextMinutes });

    const nextTimeout = nextMinutes * 60_000;
    this._timeout = nextTimeout;
    this._expiresAt = Date.now() + nextTimeout;

    if (this.hooks?.onTimeoutExtended) {
      await this.hooks.onTimeoutExtended(this, additionalMs);
    }

    return { expiresAt: this._expiresAt };
  }

  async resize(resources: {
    cpu?: number;
    memory?: number;
    disk?: number;
  }): Promise<void> {
    await this.sandbox.resize(resources);
    Object.assign(this.sandbox, resources);
  }

  static async create(config: DaytonaSandboxConfig): Promise<DaytonaSandbox> {
    const daytona = new Daytona({ apiKey: config.apiKey });
    const env = buildSandboxEnv(config);

    const baseParams = {
      language: "typescript" as const,
      name: config.name,
      envVars: env,
      public: true,
      autoStopInterval:
        config.autoStopInterval ?? DEFAULT_AUTO_STOP_INTERVAL_MINUTES,
    };

    const sandbox = config.snapshot
      ? await daytona.create(
          {
            ...baseParams,
            snapshot: config.snapshot,
          },
          { timeout: DEFAULT_CREATE_TIMEOUT_SECONDS },
        )
      : config.image
        ? await daytona.create(
            {
              ...baseParams,
              image: config.image,
              ...(config.resources ? { resources: config.resources } : {}),
            },
            { timeout: DEFAULT_CREATE_TIMEOUT_SECONDS },
          )
        : await daytona.create(baseParams, {
            timeout: DEFAULT_CREATE_TIMEOUT_SECONDS,
          });

    await ensureSessionExists(sandbox, config.sessionId);

    // Resolve the workspace root before repository setup.
    const baseWorkingDirectory =
      (await sandbox.getWorkDir()) ??
      (await sandbox.getUserHomeDir()) ??
      DEFAULT_USER_HOME;
    const workingDirectory = resolveWorkspaceDirectory(baseWorkingDirectory);

    await ensureWorkspaceDirectory({
      sandbox,
      sessionId: config.sessionId,
      workingDirectory,
    });

    // Prepare the workspace repository.
    if (config.source) {
      const cloneUrl = buildGitCloneUrl(config.source.url, config.source.token);
      const cloneCommand = [
        "git clone",
        ...(config.source.branch
          ? [`--branch ${shellEscape(config.source.branch)}`]
          : []),
        shellEscape(cloneUrl),
        shellEscape(workingDirectory),
      ].join(" ");

      await runSetupCommand({
        sandbox,
        sessionId: config.sessionId,
        command: cloneCommand,
        timeoutSeconds: 300,
      });
    } else {
      await runSetupCommand({
        sandbox,
        sessionId: config.sessionId,
        command: `cd ${shellEscape(workingDirectory)} && git init`,
      });
    }

    // Configure git identity for commit-capable sessions.
    if (config.gitUser) {
      await runSetupCommand({
        sandbox,
        sessionId: config.sessionId,
        command: `cd ${shellEscape(workingDirectory)} && git config user.name ${shellEscape(config.gitUser.name)}`,
      });
      await runSetupCommand({
        sandbox,
        sessionId: config.sessionId,
        command: `cd ${shellEscape(workingDirectory)} && git config user.email ${shellEscape(config.gitUser.email)}`,
      });
    }

    // Seed empty workspaces so diff and commit flows have a HEAD ref.
    if (!config.source && config.gitUser) {
      await runSetupCommand({
        sandbox,
        sessionId: config.sessionId,
        command: `cd ${shellEscape(workingDirectory)} && git commit --allow-empty -m ${shellEscape("Initial commit")}`,
      });
    }

    // Create the requested working branch after clone.
    if (config.source?.newBranch) {
      await runSetupCommand({
        sandbox,
        sessionId: config.sessionId,
        command: `cd ${shellEscape(workingDirectory)} && git checkout -b ${shellEscape(config.source.newBranch)}`,
      });
    }

    const previewUrls = await loadPreviewUrls(sandbox, config.ports);
    const currentBranch =
      config.source?.newBranch ??
      (await detectCurrentBranch({
        sandbox,
        sessionId: config.sessionId,
        workingDirectory,
      }));

    const timeoutInfo = normalizeTimeoutMs(
      config.autoStopInterval ?? sandbox.autoStopInterval,
    );
    const daytonaSandbox = new DaytonaSandbox(sandbox, config.sessionId, {
      workingDirectory,
      env,
      currentBranch,
      hooks: config.hooks,
      image: config.image,
      previewUrls,
      snapshot: config.snapshot,
      timeout: timeoutInfo.timeout,
      expiresAt: timeoutInfo.expiresAt,
    });

    if (config.hooks?.afterStart) {
      await config.hooks.afterStart(daytonaSandbox);
    }

    return daytonaSandbox;
  }

  static async connect(
    state: DaytonaState,
    config: DaytonaSandboxConnectConfig,
  ): Promise<DaytonaSandbox> {
    const sandboxId = state.sandboxId ?? state.sandboxName;
    if (!sandboxId) {
      throw new Error("Daytona sandbox ID or name is required");
    }

    const daytona = new Daytona({ apiKey: config.apiKey });
    const sandbox = await daytona.get(sandboxId);

    if (sandbox.state !== "started" && config.resume !== false) {
      await sandbox.start(DEFAULT_CONNECT_TIMEOUT_SECONDS);
    }

    const previewUrls = await loadPreviewUrls(sandbox, config.ports);
    const timeoutInfo = normalizeTimeoutMs(sandbox.autoStopInterval);

    const daytonaSandbox = new DaytonaSandbox(sandbox, state.sessionId, {
      workingDirectory: state.workingDirectory,
      env: buildSandboxEnv(config),
      hooks: config.hooks,
      image: state.image,
      previewUrls,
      snapshot: state.snapshot,
      timeout: timeoutInfo.timeout,
      expiresAt: state.expiresAt ?? timeoutInfo.expiresAt,
    });

    if (config.hooks?.afterStart) {
      await config.hooks.afterStart(daytonaSandbox);
    }

    return daytonaSandbox;
  }
}
