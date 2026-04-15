import { describe, expect, test } from "bun:test";
import { clearSandboxState, isSandboxUnavailableError } from "./utils";

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
