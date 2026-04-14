import type { SandboxState } from "@open-harness/sandbox";
import {
  requireAuthenticatedUser,
  requireOwnedSessionWithSandboxGuard,
} from "@/app/api/sessions/_lib/session-context";
import { updateSession } from "@/lib/db/sessions";
import { connectUserSandbox } from "@/lib/sandbox/connect-user-sandbox";
import {
  buildActiveLifecycleUpdate,
  getNextLifecycleVersion,
} from "@/lib/sandbox/lifecycle";
import { canOperateOnSandbox } from "@/lib/sandbox/utils";

interface ResizeSandboxRequest {
  sessionId?: string;
  cpu?: number;
  memory?: number;
  disk?: number;
}

interface ResizeResources {
  cpu?: number;
  memory?: number;
  disk?: number;
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value > 0
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildChangedResources(
  requested: ResizeResources,
  current: ResizeResources | null | undefined,
): ResizeResources {
  if (!current) {
    return requested;
  }

  return {
    ...(requested.cpu !== undefined && requested.cpu !== current.cpu
      ? { cpu: requested.cpu }
      : {}),
    ...(requested.memory !== undefined && requested.memory !== current.memory
      ? { memory: requested.memory }
      : {}),
    ...(requested.disk !== undefined && requested.disk !== current.disk
      ? { disk: requested.disk }
      : {}),
  };
}

function isDaytonaValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "DaytonaValidationError" ||
      error.message.toLowerCase().includes("validation"))
  );
}

export async function POST(req: Request) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: ResizeSandboxRequest;
  try {
    body = (await req.json()) as ResizeSandboxRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const requestedResources = {
    ...(isPositiveInteger(body.cpu) ? { cpu: body.cpu } : {}),
    ...(isPositiveInteger(body.memory) ? { memory: body.memory } : {}),
    ...(isPositiveInteger(body.disk) ? { disk: body.disk } : {}),
  };

  if (Object.keys(requestedResources).length === 0) {
    return Response.json(
      { error: "At least one resource value is required" },
      { status: 400 },
    );
  }

  const sessionContext = await requireOwnedSessionWithSandboxGuard({
    userId: authResult.userId,
    sessionId: body.sessionId,
    sandboxGuard: canOperateOnSandbox,
    sandboxErrorMessage: "Sandbox not initialized",
  });
  if (!sessionContext.ok) {
    return sessionContext.response;
  }

  const { sessionRecord } = sessionContext;
  const sandboxState = sessionRecord.sandboxState;
  if (!sandboxState || sandboxState.type !== "daytona") {
    return Response.json(
      { error: "Sandbox resize is only supported for Daytona sandboxes" },
      { status: 400 },
    );
  }

  const resources = buildChangedResources(
    requestedResources,
    sandboxState.resources,
  );
  if (Object.keys(resources).length === 0) {
    return Response.json({
      success: true,
      sandboxState,
      resources: sandboxState.resources ?? null,
    });
  }

  const sandbox = await connectUserSandbox({
    userId: authResult.userId,
    state: sandboxState,
  });

  if (!sandbox.resize) {
    return Response.json(
      { error: "Sandbox resize is not supported for this sandbox" },
      { status: 400 },
    );
  }

  try {
    await sandbox.resize(resources);
  } catch (error) {
    if (isDaytonaValidationError(error)) {
      return Response.json({ error: getErrorMessage(error) }, { status: 400 });
    }

    throw error;
  }

  const nextState = sandbox.getState?.() as SandboxState | undefined;
  if (nextState) {
    await updateSession(body.sessionId, {
      sandboxState: nextState,
      lifecycleVersion: getNextLifecycleVersion(sessionRecord.lifecycleVersion),
      ...buildActiveLifecycleUpdate(nextState),
    });
  }

  return Response.json({
    success: true,
    sandboxState: nextState ?? sandboxState,
    resources:
      nextState && nextState.type === "daytona"
        ? (nextState.resources ?? null)
        : null,
  });
}
