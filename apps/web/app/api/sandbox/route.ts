import { connectSandbox, type SandboxState } from "@open-harness/sandbox";
import {
  requireAuthenticatedUser,
  requireOwnedSession,
  type SessionRecord,
} from "@/app/api/sessions/_lib/session-context";
import { getGitHubAccount } from "@/lib/db/accounts";
import { updateSession } from "@/lib/db/sessions";
import { getUserDaytonaCredentials } from "@/lib/daytona/api-key";
import { ensureNamedDaytonaSnapshotForImage } from "@/lib/daytona/snapshots";
import { parseGitHubUrl } from "@/lib/github/client";
import { getUserGitHubToken } from "@/lib/github/user-token";
import {
  DEFAULT_DAYTONA_AUTO_STOP_MINUTES,
  DEFAULT_DAYTONA_WORKING_DIRECTORY,
  DEFAULT_SANDBOX_BASE_SNAPSHOT_ID,
  getDefaultDaytonaBlankLaunchSource,
  DEFAULT_SANDBOX_PORTS,
  DEFAULT_SANDBOX_TIMEOUT_MS,
} from "@/lib/sandbox/config";
import { connectUserSandbox } from "@/lib/sandbox/connect-user-sandbox";
import {
  buildActiveLifecycleUpdate,
  getNextLifecycleVersion,
} from "@/lib/sandbox/lifecycle";
import { kickSandboxLifecycleWorkflow } from "@/lib/sandbox/lifecycle-kick";
import {
  getVercelCliSandboxSetup,
  syncVercelCliAuthToSandbox,
} from "@/lib/sandbox/vercel-cli-auth";
import { installGlobalSkills } from "@/lib/skills/global-skill-installer";
import {
  canOperateOnSandbox,
  clearSandboxState,
  getDaytonaImage,
  getDaytonaSnapshot,
  getSessionSandboxName,
  hasResumableSandboxState,
} from "@/lib/sandbox/utils";
import { getServerSession } from "@/lib/session/get-server-session";
// import { buildDevelopmentDotenvFromVercelProject } from "@/lib/vercel/projects";
// import { getUserVercelToken } from "@/lib/vercel/token";

interface CreateSandboxRequest {
  repoUrl?: string;
  branch?: string;
  isNewBranch?: boolean;
  sessionId?: string;
  sandboxType?: "vercel" | "daytona";
}

// async function syncVercelProjectEnvVarsToSandbox(params: {
//   userId: string;
//   sessionRecord: SessionRecord;
//   sandbox: Awaited<ReturnType<typeof connectSandbox>>;
// }): Promise<void> {
//   if (!params.sessionRecord.vercelProjectId) {
//     return;
//   }
//
//   const token = await getUserVercelToken(params.userId);
//   if (!token) {
//     return;
//   }
//
//   const dotenvContent = await buildDevelopmentDotenvFromVercelProject({
//     token,
//     projectIdOrName: params.sessionRecord.vercelProjectId,
//     teamId: params.sessionRecord.vercelTeamId,
//   });
//   if (!dotenvContent) {
//     return;
//   }
//
//   await params.sandbox.writeFile(
//     `${params.sandbox.workingDirectory}/.env.local`,
//     dotenvContent,
//     "utf-8",
//   );
// }

async function syncVercelCliAuthForSandbox(params: {
  userId: string;
  sessionRecord: SessionRecord;
  sandbox: Awaited<ReturnType<typeof connectSandbox>>;
}): Promise<void> {
  const setup = await getVercelCliSandboxSetup({
    userId: params.userId,
    sessionRecord: params.sessionRecord,
  });

  await syncVercelCliAuthToSandbox({
    sandbox: params.sandbox,
    setup,
  });
}

async function installSessionGlobalSkills(params: {
  sessionRecord: SessionRecord;
  sandbox: Awaited<ReturnType<typeof connectSandbox>>;
}): Promise<void> {
  const globalSkillRefs = params.sessionRecord.globalSkillRefs ?? [];
  if (globalSkillRefs.length === 0) {
    return;
  }

  await installGlobalSkills({
    sandbox: params.sandbox,
    globalSkillRefs,
  });
}

export async function POST(req: Request) {
  let body: CreateSandboxRequest;
  try {
    body = (await req.json()) as CreateSandboxRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    body.sandboxType &&
    body.sandboxType !== "vercel" &&
    body.sandboxType !== "daytona"
  ) {
    return Response.json({ error: "Invalid sandbox type" }, { status: 400 });
  }

  const {
    repoUrl,
    branch = "main",
    isNewBranch = false,
    sessionId,
    sandboxType = "vercel",
  } = body;

  // Get session for auth
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [githubToken, daytonaCredentials] = await Promise.all([
    getUserGitHubToken(session.user.id),
    sandboxType === "daytona"
      ? getUserDaytonaCredentials(session.user.id)
      : Promise.resolve(null),
  ]);
  const daytonaApiKey = daytonaCredentials?.apiKey ?? null;
  const daytonaApiUrl = daytonaCredentials?.apiUrl;

  if (repoUrl) {
    const parsedRepo = parseGitHubUrl(repoUrl);
    if (!parsedRepo) {
      return Response.json(
        { error: "Invalid GitHub repository URL" },
        { status: 400 },
      );
    }

    if (!githubToken) {
      return Response.json(
        { error: "Connect GitHub to access repositories" },
        { status: 403 },
      );
    }
  }

  // Validate session ownership
  let sessionRecord: SessionRecord | undefined;
  if (sessionId) {
    const sessionContext = await requireOwnedSession({
      userId: session.user.id,
      sessionId,
    });
    if (!sessionContext.ok) {
      return sessionContext.response;
    }

    sessionRecord = sessionContext.sessionRecord;
  }
  const pendingDaytonaState =
    sessionRecord?.sandboxState?.type === "daytona"
      ? sessionRecord.sandboxState
      : null;
  const pendingDaytonaImage = getDaytonaImage(pendingDaytonaState);
  const pendingDaytonaSnapshot = getDaytonaSnapshot(pendingDaytonaState);
  const defaultDaytonaLaunchSource =
    sandboxType === "daytona" && !pendingDaytonaSnapshot && !pendingDaytonaImage
      ? getDefaultDaytonaBlankLaunchSource()
      : {};
  let effectiveDaytonaSnapshot =
    pendingDaytonaSnapshot ?? defaultDaytonaLaunchSource.snapshot;
  let effectiveDaytonaImage = effectiveDaytonaSnapshot
    ? undefined
    : (pendingDaytonaImage ?? defaultDaytonaLaunchSource.image);

  const sandboxName = sessionId ? getSessionSandboxName(sessionId) : undefined;
  const githubAccount = await getGitHubAccount(session.user.id);
  const githubNoreplyEmail =
    githubAccount?.externalUserId && githubAccount.username
      ? `${githubAccount.externalUserId}+${githubAccount.username}@users.noreply.github.com`
      : undefined;

  const gitUser = {
    name: session.user.name ?? githubAccount?.username ?? session.user.username,
    email:
      githubNoreplyEmail ??
      session.user.email ??
      `${session.user.username}@users.noreply.github.com`,
  };

  // ============================================
  // CREATE OR RESUME: Create a named persistent sandbox for this session.
  // ============================================
  const startTime = Date.now();

  const source = repoUrl
    ? {
        repo: repoUrl,
        branch: isNewBranch ? undefined : branch,
        newBranch: isNewBranch ? branch : undefined,
      }
    : undefined;

  if (sandboxType === "daytona" && !daytonaApiKey) {
    return Response.json(
      {
        error:
          "Daytona API key not configured. Go to Settings -> Connections to add it.",
      },
      { status: 400 },
    );
  }

  if (
    sandboxType === "daytona" &&
    daytonaApiKey &&
    pendingDaytonaImage &&
    !pendingDaytonaSnapshot &&
    !pendingDaytonaState?.sandboxId &&
    !pendingDaytonaState?.sandboxName
  ) {
    const { snapshotName } = await ensureNamedDaytonaSnapshotForImage({
      apiKey: daytonaApiKey,
      apiUrl: daytonaApiUrl,
      image: pendingDaytonaImage,
    });
    effectiveDaytonaSnapshot = snapshotName;
    effectiveDaytonaImage = undefined;
  }

  const sandbox =
    sandboxType === "daytona"
      ? await connectSandbox({
          state: {
            type: "daytona",
            ...(sandboxName ? { sandboxName } : {}),
            ...(effectiveDaytonaSnapshot
              ? { snapshot: effectiveDaytonaSnapshot }
              : {}),
            ...(effectiveDaytonaImage ? { image: effectiveDaytonaImage } : {}),
            source,
            sessionId:
              pendingDaytonaState?.sessionId ??
              `session-${sessionId ?? crypto.randomUUID()}`,
            workingDirectory:
              pendingDaytonaState?.workingDirectory ??
              DEFAULT_DAYTONA_WORKING_DIRECTORY,
          },
          options: {
            apiKey: daytonaApiKey ?? undefined,
            apiUrl: daytonaApiUrl,
            env: githubToken ? { GITHUB_TOKEN: githubToken } : undefined,
            githubToken: githubToken ?? undefined,
            gitUser,
            ports: DEFAULT_SANDBOX_PORTS,
            resume: !!sandboxName,
            createIfMissing: !!sandboxName,
            autoStopInterval: DEFAULT_DAYTONA_AUTO_STOP_MINUTES,
          },
        })
      : await connectSandbox({
          state: {
            type: "vercel",
            ...(sandboxName ? { sandboxName } : {}),
            source,
          },
          options: {
            githubToken: githubToken ?? undefined,
            gitUser,
            timeout: DEFAULT_SANDBOX_TIMEOUT_MS,
            ports: DEFAULT_SANDBOX_PORTS,
            baseSnapshotId: DEFAULT_SANDBOX_BASE_SNAPSHOT_ID,
            persistent: !!sandboxName,
            resume: !!sandboxName,
            createIfMissing: !!sandboxName,
          },
        });

  if (sessionId && sandbox.getState) {
    const nextState = sandbox.getState() as SandboxState;
    await updateSession(sessionId, {
      sandboxState: nextState,
      snapshotUrl: null,
      snapshotCreatedAt: null,
      lifecycleVersion: getNextLifecycleVersion(
        sessionRecord?.lifecycleVersion,
      ),
      ...buildActiveLifecycleUpdate(nextState),
    });

    if (sessionRecord) {
      // TODO: Re-enable this once we have a solid exfiltration defense strategy.
      // try {
      //   await syncVercelProjectEnvVarsToSandbox({
      //     userId: session.user.id,
      //     sessionRecord,
      //     sandbox,
      //   });
      // } catch (error) {
      //   console.error(
      //     `Failed to sync Vercel env vars for session ${sessionRecord.id}:`,
      //     error,
      //   );
      // }

      if (sandboxType === "vercel") {
        try {
          await syncVercelCliAuthForSandbox({
            userId: session.user.id,
            sessionRecord,
            sandbox,
          });
        } catch (error) {
          console.error(
            `Failed to prepare Vercel CLI auth for session ${sessionRecord.id}:`,
            error,
          );
        }
      }

      try {
        await installSessionGlobalSkills({
          sessionRecord,
          sandbox,
        });
      } catch (error) {
        console.error(
          `Failed to install global skills for session ${sessionRecord.id}:`,
          error,
        );
      }
    }

    kickSandboxLifecycleWorkflow({
      sessionId,
      reason: "sandbox-created",
    });
  }

  const readyMs = Date.now() - startTime;
  const resolvedTimeout =
    sandbox.timeout ??
    (sandboxType === "daytona"
      ? DEFAULT_DAYTONA_AUTO_STOP_MINUTES * 60_000
      : DEFAULT_SANDBOX_TIMEOUT_MS);

  return Response.json({
    createdAt: Date.now(),
    timeout: resolvedTimeout,
    currentBranch: sandbox.currentBranch ?? (repoUrl ? branch : undefined),
    mode: sandboxType,
    timing: { readyMs },
  });
}

export async function DELETE(req: Request) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("sessionId" in body) ||
    typeof (body as Record<string, unknown>).sessionId !== "string"
  ) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const { sessionId } = body as { sessionId: string };

  const sessionContext = await requireOwnedSession({
    userId: authResult.userId,
    sessionId,
  });
  if (!sessionContext.ok) {
    return sessionContext.response;
  }

  const { sessionRecord } = sessionContext;

  // If there's no sandbox to stop, return success (idempotent)
  if (!canOperateOnSandbox(sessionRecord.sandboxState)) {
    return Response.json({ success: true, alreadyStopped: true });
  }

  // Connect and stop using unified API
  const sandbox = await connectUserSandbox({
    userId: authResult.userId,
    state: sessionRecord.sandboxState,
  });
  await sandbox.stop();

  const clearedState = clearSandboxState(sessionRecord.sandboxState);
  await updateSession(sessionId, {
    sandboxState: clearedState,
    snapshotUrl: null,
    snapshotCreatedAt: null,
    lifecycleState:
      hasResumableSandboxState(clearedState) || !!sessionRecord.snapshotUrl
        ? "hibernated"
        : "provisioning",
    sandboxExpiresAt: null,
    hibernateAfter: null,
    lifecycleRunId: null,
    lifecycleError: null,
  });

  return Response.json({ success: true });
}
