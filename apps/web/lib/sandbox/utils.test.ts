import { describe, expect, test } from "bun:test";
import {
  clearSandboxResumeState,
  clearSandboxState,
  clearUnavailableSandboxState,
  isSandboxUnavailableError,
} from "./utils";

describe("isSandboxUnavailableError", () => {
  test("treats broken Daytona command streams as unavailable", () => {
    expect(
      isSandboxUnavailableError(
        "failed to execute command: bad request: failed to write command: write |1: broken pipe",
      ),
    ).toBe(true);
    expect(isSandboxUnavailableError("Expected a stream of command data")).toBe(
      true,
    );
  });

  test("treats deleted Daytona sandboxes as unavailable", () => {
    expect(
      isSandboxUnavailableError(
        "Sandbox with ID or name e18e4425-e9b1-4f73-84de-36d194c53a88 not found",
      ),
    ).toBe(true);
  });
});

describe("clearSandboxState", () => {
  test("preserves daytona snapshots across lifecycle transitions", () => {
    expect(
      clearSandboxState({
        type: "daytona",
        sandboxName: "session_session-1",
        sessionId: "session-1",
        snapshot: "open-agents:image:base:abc123def456",
        workingDirectory: "/home/daytona/workspace",
        expiresAt: Date.now() + 60_000,
      }),
    ).toMatchObject({
      type: "daytona",
      sandboxName: "session_session-1",
      sessionId: "session-1",
      snapshot: "open-agents:image:base:abc123def456",
      workingDirectory: "/home/daytona/workspace",
    });
  });

  test("preserves daytona images when no snapshot is available", () => {
    expect(
      clearSandboxState({
        type: "daytona",
        sandboxName: "session_session-1",
        sessionId: "session-1",
        image: "ghcr.io/acme/devbox:latest",
        workingDirectory: "/home/daytona/workspace",
        expiresAt: Date.now() + 60_000,
      }),
    ).toMatchObject({
      type: "daytona",
      sandboxName: "session_session-1",
      sessionId: "session-1",
      image: "ghcr.io/acme/devbox:latest",
      workingDirectory: "/home/daytona/workspace",
    });
  });
});

describe("clearSandboxResumeState", () => {
  test("drops the stale Daytona handle but preserves launch metadata", () => {
    expect(
      clearSandboxResumeState({
        type: "daytona",
        sandboxName: "session_session-1",
        sessionId: "session-1",
        image: "ghcr.io/acme/devbox:latest",
        workingDirectory: "/home/daytona/workspace",
        resources: {
          cpu: 2,
          disk: 10,
          memory: 4,
        },
        expiresAt: Date.now() + 60_000,
      }),
    ).toEqual({
      type: "daytona",
      sessionId: "session-1",
      image: "ghcr.io/acme/devbox:latest",
      workingDirectory: "/home/daytona/workspace",
      resources: {
        cpu: 2,
        disk: 10,
        memory: 4,
      },
    });
  });
});

describe("clearUnavailableSandboxState", () => {
  test("drops the stale Daytona handle for deleted sandboxes", () => {
    expect(
      clearUnavailableSandboxState(
        {
          type: "daytona",
          sandboxName: "session_session-1",
          sessionId: "session-1",
          snapshot: "open-agents:image:base:abc123def456",
          workingDirectory: "/home/daytona/workspace",
          expiresAt: Date.now() + 60_000,
        },
        "Sandbox with ID or name e18e4425-e9b1-4f73-84de-36d194c53a88 not found",
      ),
    ).toEqual({
      type: "daytona",
      sessionId: "session-1",
      snapshot: "open-agents:image:base:abc123def456",
      workingDirectory: "/home/daytona/workspace",
    });
  });
});
