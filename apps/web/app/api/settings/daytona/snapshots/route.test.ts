import { beforeEach, describe, expect, mock, test } from "bun:test";

let currentSession: { user: { id: string } } | null = {
  user: { id: "user-1" },
};
let currentDaytonaApiKey: string | null = "daytona-key";
const daytonaConfigs: Array<Record<string, unknown>> = [];
const snapshotListCalls: Array<{ page?: number; limit?: number }> = [];
let snapshotPages = new Map<
  number,
  {
    items: Array<{
      id: string;
      name: string;
      imageName?: string | null;
      state: string;
      createdAt?: Date;
      updatedAt?: Date;
      lastUsedAt?: Date;
    }>;
    total: number;
    page: number;
    totalPages: number;
  }
>();

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => currentSession,
}));

mock.module("@/lib/daytona/api-key", () => ({
  getUserDaytonaApiKey: async () => currentDaytonaApiKey,
  hasUserDaytonaApiKey: async () => currentDaytonaApiKey !== null,
  getUserDaytonaCredentials: async () =>
    currentDaytonaApiKey
      ? { apiKey: currentDaytonaApiKey, apiUrl: undefined }
      : null,
}));

mock.module("@daytona/sdk", () => ({
  Daytona: class Daytona {
    snapshot = {
      list: async (page?: number, limit?: number) => {
        snapshotListCalls.push({ page, limit });
        return (
          snapshotPages.get(page ?? 1) ?? {
            items: [],
            total: 0,
            page: page ?? 1,
            totalPages: 1,
          }
        );
      },
    };

    constructor(config: Record<string, unknown>) {
      daytonaConfigs.push(config);
    }
  },
}));

const routeModulePromise = import("./route");

describe("/api/settings/daytona/snapshots", () => {
  beforeEach(() => {
    currentSession = { user: { id: "user-1" } };
    currentDaytonaApiKey = "daytona-key";
    daytonaConfigs.length = 0;
    snapshotListCalls.length = 0;
    snapshotPages = new Map([
      [
        1,
        {
          items: [
            {
              id: "snapshot-1",
              name: "base-a",
              imageName: "debian:12.9",
              state: "active",
              createdAt: new Date("2026-04-01T00:00:00.000Z"),
              updatedAt: new Date("2026-04-02T00:00:00.000Z"),
            },
            {
              id: "snapshot-2",
              name: "base-b",
              imageName: "ghcr.io/acme/devbox:latest",
              state: "inactive",
              createdAt: new Date("2026-04-03T00:00:00.000Z"),
              updatedAt: new Date("2026-04-04T00:00:00.000Z"),
            },
          ],
          total: 3,
          page: 1,
          totalPages: 2,
        },
      ],
      [
        2,
        {
          items: [
            {
              id: "snapshot-3",
              name: "base-c",
              imageName: "ubuntu:24.04",
              state: "active",
              createdAt: new Date("2026-04-05T00:00:00.000Z"),
              updatedAt: new Date("2026-04-06T00:00:00.000Z"),
              lastUsedAt: new Date("2026-04-07T00:00:00.000Z"),
            },
          ],
          total: 3,
          page: 2,
          totalPages: 2,
        },
      ],
    ]);
  });

  test("returns 401 when not authenticated", async () => {
    const { GET } = await routeModulePromise;
    currentSession = null;

    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("Not authenticated");
  });

  test("returns 400 when no Daytona API key is configured", async () => {
    const { GET } = await routeModulePromise;
    currentDaytonaApiKey = null;

    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Configure a Daytona API key in Settings -> Connections before listing snapshots.",
    );
  });

  test("lists and sorts Daytona snapshots across pages", async () => {
    const { GET } = await routeModulePromise;

    const response = await GET();
    const body = (await response.json()) as {
      snapshots: Array<{
        id: string;
        name: string;
        imageName: string | null;
        state: string;
        createdAt: string | null;
        updatedAt: string | null;
        lastUsedAt: string | null;
      }>;
    };

    expect(response.status).toBe(200);
    expect(daytonaConfigs).toEqual([{ apiKey: "daytona-key" }]);
    expect(snapshotListCalls).toEqual([
      { page: 1, limit: 100 },
      { page: 2, limit: 100 },
    ]);
    expect(body.snapshots.map((snapshot) => snapshot.name)).toEqual([
      "base-c",
      "base-b",
      "base-a",
    ]);
    expect(body.snapshots[0]).toMatchObject({
      id: "snapshot-3",
      imageName: "ubuntu:24.04",
      state: "active",
      lastUsedAt: "2026-04-07T00:00:00.000Z",
    });
  });
});
