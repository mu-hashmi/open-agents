import { describe, expect, test } from "bun:test";
import { isSandboxUnavailableError } from "./utils";

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
