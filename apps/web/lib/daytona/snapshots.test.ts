import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

function createNamedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

type MockSnapshot = {
  name: string;
  state: string;
};

const daytonaConfigs: Array<Record<string, unknown>> = [];
const snapshotGetMock = mock(async (_name: string): Promise<MockSnapshot> => {
  throw createNamedError("MockDaytonaNotFoundError", "not found");
});
const snapshotCreateMock = mock(
  async (_params: unknown, _options?: unknown): Promise<MockSnapshot> => ({
    name: "snapshot-created",
    state: "active",
  }),
);
const snapshotActivateMock = mock(
  async (snapshot: Record<string, unknown>): Promise<MockSnapshot> => ({
    ...(snapshot as MockSnapshot),
    state: "active",
  }),
);

mock.module("@daytona/sdk", () => ({
  Daytona: class Daytona {
    snapshot = {
      activate: snapshotActivateMock,
      create: snapshotCreateMock,
      get: snapshotGetMock,
    };

    constructor(config: Record<string, unknown>) {
      daytonaConfigs.push(config);
    }
  },
  DaytonaConflictError: function DaytonaConflictError() {},
  DaytonaNotFoundError: function DaytonaNotFoundError() {},
}));

const snapshotsModulePromise = import("./snapshots");

describe("Daytona image snapshots", () => {
  beforeEach(() => {
    daytonaConfigs.length = 0;
    snapshotGetMock.mockClear();
    snapshotCreateMock.mockClear();
    snapshotActivateMock.mockClear();

    snapshotGetMock.mockImplementation(async (_name: string): Promise<MockSnapshot> => {
      throw createNamedError("MockDaytonaNotFoundError", "not found");
    });
    snapshotCreateMock.mockImplementation(
      async (
        _params: unknown,
        _options?: unknown,
      ): Promise<MockSnapshot> => ({
        name: "snapshot-created",
        state: "active",
      }),
    );
    snapshotActivateMock.mockImplementation(
      async (
        snapshot: Record<string, unknown>,
      ): Promise<MockSnapshot> => ({
        ...(snapshot as MockSnapshot),
        state: "active",
      }),
    );
  });

  test("builds deterministic snapshot names from image refs", async () => {
    const { buildAutomaticDaytonaImageSnapshotName } =
      await snapshotsModulePromise;

    const first = buildAutomaticDaytonaImageSnapshotName(
      " mcr.microsoft.com/devcontainers/universal:2 ",
    );
    const second = buildAutomaticDaytonaImageSnapshotName(
      "MCR.MICROSOFT.COM/devcontainers/universal:2",
    );

    expect(first).toBe(second);
    expect(first).toMatch(
      /^open-agents:image:mcr\.microsoft\.com\/devcontainers\/universal:2:[a-f0-9]{12}$/,
    );
  });

  test("reuses existing active snapshots", async () => {
    const { ensureNamedDaytonaSnapshotForImage } = await snapshotsModulePromise;

    snapshotGetMock.mockImplementation(async (): Promise<MockSnapshot> => ({
      name: "open-agents:image:base:abc123def456",
      state: "active",
    }));

    const result = await ensureNamedDaytonaSnapshotForImage({
      apiKey: "daytona-key",
      image: "mcr.microsoft.com/devcontainers/universal:2",
    });

    expect(daytonaConfigs).toEqual([{ apiKey: "daytona-key" }]);
    expect(result).toEqual({
      created: false,
      snapshotName: "open-agents:image:base:abc123def456",
    });
    expect(snapshotCreateMock).not.toHaveBeenCalled();
    expect(snapshotActivateMock).not.toHaveBeenCalled();
  });

  test("activates existing inactive snapshots before reuse", async () => {
    const { ensureNamedDaytonaSnapshotForImage } = await snapshotsModulePromise;

    snapshotGetMock.mockImplementation(async (): Promise<MockSnapshot> => ({
      name: "open-agents:image:base:abc123def456",
      state: "inactive",
    }));

    const result = await ensureNamedDaytonaSnapshotForImage({
      apiKey: "daytona-key",
      image: "mcr.microsoft.com/devcontainers/universal:2",
    });

    expect(result).toEqual({
      created: false,
      snapshotName: "open-agents:image:base:abc123def456",
    });
    expect(snapshotActivateMock).toHaveBeenCalledTimes(1);
  });

  test("creates a named snapshot when the image has not been saved yet", async () => {
    const { ensureNamedDaytonaSnapshotForImage } = await snapshotsModulePromise;

    snapshotCreateMock.mockImplementation(
      async (params: unknown): Promise<MockSnapshot> => {
      return {
        name: (params as { name: string }).name,
        state: "active",
        } satisfies MockSnapshot;
      },
    );

    const result = await ensureNamedDaytonaSnapshotForImage({
      apiKey: "daytona-key",
      image: "mcr.microsoft.com/devcontainers/universal:2",
    });

    expect(result.created).toBe(true);
    expect(result.snapshotName).toMatch(
      /^open-agents:image:mcr\.microsoft\.com\/devcontainers\/universal:2:[a-f0-9]{12}$/,
    );
    expect(snapshotCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        image: {
          contextList: [],
          dockerfile: "FROM mcr.microsoft.com/devcontainers/universal:2\n",
        },
        name: result.snapshotName,
      }),
      { timeout: 0 },
    );
  });

  test("waits for a conflicting create to resolve to the shared snapshot", async () => {
    const { ensureNamedDaytonaSnapshotForImage } = await snapshotsModulePromise;

    let getCallCount = 0;
    snapshotGetMock.mockImplementation(
      async (name: string): Promise<MockSnapshot> => {
      getCallCount += 1;
      if (getCallCount === 1) {
        throw createNamedError("MockDaytonaNotFoundError", "not found");
      }

      return {
        name,
        state: "active",
        } satisfies MockSnapshot;
      },
    );
    snapshotCreateMock.mockImplementation(async () => {
      throw createNamedError("MockDaytonaConflictError", "already exists");
    });

    const result = await ensureNamedDaytonaSnapshotForImage({
      apiKey: "daytona-key",
      image: "mcr.microsoft.com/devcontainers/universal:2",
    });

    expect(result.created).toBe(false);
    expect(result.snapshotName).toMatch(
      /^open-agents:image:mcr\.microsoft\.com\/devcontainers\/universal:2:[a-f0-9]{12}$/,
    );
  });
});
