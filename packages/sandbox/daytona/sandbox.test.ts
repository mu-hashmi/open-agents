import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { DaytonaState } from "./state";

type MockSession = {
  sessionId: string;
  commands: unknown[];
};

type MockExecuteRequest = {
  command: string;
  runAsync?: boolean;
};

type MockSessionExecuteResponse = {
  cmdId: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  output?: string;
};

type MockPreviewLink = {
  url: string;
};

type MockSandbox = {
  id: string;
  name: string;
  state: string;
  cpu: number;
  memory: number;
  disk: number;
  autoStopInterval: number;
  getWorkDir: () => Promise<string | undefined>;
  getUserHomeDir: () => Promise<string | undefined>;
  process: {
    getSession: (sessionId: string) => Promise<MockSession>;
    createSession: (sessionId: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
    executeSessionCommand: (
      sessionId: string,
      request: MockExecuteRequest,
      timeoutSeconds?: number,
    ) => Promise<MockSessionExecuteResponse>;
  };
  fs: {
    downloadFile: (pathname: string) => Promise<Buffer>;
    uploadFile: (content: Buffer, pathname: string) => Promise<void>;
    getFileDetails: (pathname: string) => Promise<{
      isDir: boolean;
      size: number;
      modTime: string;
    }>;
    listFiles: (
      pathname: string,
    ) => Promise<Array<{ name: string; isDir: boolean }>>;
  };
  getPreviewLink: (port: number) => Promise<MockPreviewLink>;
  start: (timeoutSeconds?: number) => Promise<void>;
  stop: (timeoutSeconds?: number) => Promise<void>;
  archive: () => Promise<void>;
  setAutostopInterval: (minutes: number) => Promise<void>;
  resize: (resources: {
    cpu?: number;
    memory?: number;
    disk?: number;
  }) => Promise<void>;
};

class MockDaytonaNotFoundError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "MockDaytonaNotFoundError";
  }
}

const getSessionMock = mock(
  async (sessionId: string): Promise<MockSession> => ({
    sessionId,
    commands: [],
  }),
);
const createSessionMock = mock(async (_sessionId: string) => undefined);
const deleteSessionMock = mock(async (_sessionId: string) => undefined);
const executeSessionCommandMock = mock(
  async (
    _sessionId: string,
    _request: MockExecuteRequest,
    _timeoutSeconds?: number,
  ): Promise<MockSessionExecuteResponse> => ({
    cmdId: "cmd-1",
    exitCode: 0,
    stdout: "",
    stderr: "",
  }),
);
const getSandboxMock = mock(async (_sandboxId: string) => currentSandbox);
const createSandboxMock = mock(
  async (_params: unknown, _options?: unknown) => currentSandbox,
);

let currentSandbox: MockSandbox;

const MockDaytona = function MockDaytona(_config: { apiKey: string }) {
  return {
    create: createSandboxMock,
    get: getSandboxMock,
  };
};

function buildMockSandbox(): MockSandbox {
  return {
    id: "sandbox-1",
    name: "casablanca",
    state: "started",
    cpu: 2,
    memory: 4,
    disk: 10,
    autoStopInterval: 30,
    getWorkDir: async () => "/home/daytona",
    getUserHomeDir: async () => "/home/daytona",
    process: {
      getSession: getSessionMock,
      createSession: createSessionMock,
      deleteSession: deleteSessionMock,
      executeSessionCommand: executeSessionCommandMock,
    },
    fs: {
      downloadFile: async () => Buffer.from(""),
      uploadFile: async () => undefined,
      getFileDetails: async () => ({
        isDir: false,
        size: 0,
        modTime: new Date(0).toISOString(),
      }),
      listFiles: async () => [],
    },
    getPreviewLink: async (port: number) => ({
      url: `https://sandbox-${port}.daytona.test`,
    }),
    start: async () => undefined,
    stop: async () => undefined,
    archive: async () => undefined,
    setAutostopInterval: async () => undefined,
    resize: async () => undefined,
  };
}

mock.module("@daytona/sdk", () => ({
  Daytona: MockDaytona,
  DaytonaNotFoundError: MockDaytonaNotFoundError,
}));

const sandboxModulePromise = import("./sandbox");

async function connectSandbox() {
  const { DaytonaSandbox } = await sandboxModulePromise;

  const state: DaytonaState = {
    sandboxId: "sandbox-1",
    sandboxName: "casablanca",
    sessionId: "session-1",
    workingDirectory: "/workspace",
  };

  return DaytonaSandbox.connect(state, { apiKey: "daytona-key" });
}

beforeEach(() => {
  currentSandbox = buildMockSandbox();
  getSessionMock.mockClear();
  createSessionMock.mockClear();
  deleteSessionMock.mockClear();
  executeSessionCommandMock.mockClear();
  createSandboxMock.mockClear();
  getSandboxMock.mockClear();

  getSessionMock.mockImplementation(async (sessionId: string) => ({
    sessionId,
    commands: [],
  }));
  createSessionMock.mockImplementation(async (_sessionId: string) => undefined);
  deleteSessionMock.mockImplementation(async (_sessionId: string) => undefined);
  executeSessionCommandMock.mockImplementation(
    async (
      _sessionId: string,
      _request: MockExecuteRequest,
      _timeoutSeconds?: number,
    ) => ({
      cmdId: "cmd-1",
      exitCode: 0,
      stdout: "",
      stderr: "",
    }),
  );
  getSandboxMock.mockImplementation(
    async (_sandboxId: string) => currentSandbox,
  );
  createSandboxMock.mockImplementation(
    async (_params: unknown, _options?: unknown) => currentSandbox,
  );
});

describe("DaytonaSandbox session recovery", () => {
  test("recreates a dead process session and retries exec", async () => {
    const operations: string[] = [];
    let attempt = 0;

    getSessionMock.mockImplementation(async (sessionId: string) => {
      operations.push(`get:${sessionId}`);
      return { sessionId, commands: [] };
    });
    deleteSessionMock.mockImplementation(async (sessionId: string) => {
      operations.push(`delete:${sessionId}`);
    });
    createSessionMock.mockImplementation(async (sessionId: string) => {
      operations.push(`create:${sessionId}`);
    });
    executeSessionCommandMock.mockImplementation(
      async (_sessionId: string, request: MockExecuteRequest) => {
        operations.push(`exec:${request.command}`);
        attempt += 1;
        if (attempt === 1) {
          throw new Error(
            "failed to execute command: bad request: failed to write command: write |1: broken pipe",
          );
        }

        return {
          cmdId: "cmd-2",
          exitCode: 0,
          stdout: "/workspace\n",
          stderr: "",
        };
      },
    );

    const sandbox = await connectSandbox();
    const result = await sandbox.exec("pwd", "/workspace", 5_000);

    expect(result).toEqual({
      success: true,
      exitCode: 0,
      stdout: "/workspace\n",
      stderr: "",
      truncated: false,
    });
    expect(operations).toEqual([
      "get:session-1",
      "exec:cd '/workspace' && pwd",
      "delete:session-1",
      "create:session-1",
      "exec:cd '/workspace' && pwd",
    ]);
  });

  test("recreates a dead process session and retries execDetached", async () => {
    const operations: string[] = [];
    let attempt = 0;

    deleteSessionMock.mockImplementation(async (sessionId: string) => {
      operations.push(`delete:${sessionId}`);
    });
    createSessionMock.mockImplementation(async (sessionId: string) => {
      operations.push(`create:${sessionId}`);
    });
    executeSessionCommandMock.mockImplementation(
      async (_sessionId: string, request: MockExecuteRequest) => {
        operations.push(
          `exec:${request.command}:${request.runAsync === true ? "async" : "sync"}`,
        );
        attempt += 1;
        if (attempt === 1) {
          throw new Error("Expected a stream of command data");
        }

        return {
          cmdId: "cmd-async-2",
        };
      },
    );

    const sandbox = await connectSandbox();
    const result = await sandbox.execDetached("bun run dev", "/workspace");

    expect(result).toEqual({ commandId: "cmd-async-2" });
    expect(operations).toEqual([
      "exec:cd '/workspace' && bun run dev:async",
      "delete:session-1",
      "create:session-1",
      "exec:cd '/workspace' && bun run dev:async",
    ]);
  });
});

describe("DaytonaSandbox blank sandbox creation", () => {
  test("does not inject a custom image when none is configured", async () => {
    const { DaytonaSandbox } = await sandboxModulePromise;

    await DaytonaSandbox.create({
      apiKey: "daytona-key",
      name: "blank-sandbox",
      sessionId: "session-1",
    });

    expect(createSandboxMock).toHaveBeenCalledTimes(1);
    const [params] = createSandboxMock.mock.calls[0] ?? [];
    const createParams = params as {
      language?: string;
      name?: string;
      public?: boolean;
      snapshot?: string;
      image?: string;
    };

    expect(createParams).toMatchObject({
      language: "typescript",
      name: "blank-sandbox",
      public: true,
    });
    expect(createParams.snapshot).toBeUndefined();
    expect(createParams.image).toBeUndefined();
  });
});
