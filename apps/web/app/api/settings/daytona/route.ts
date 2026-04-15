import { Daytona } from "@daytona/sdk";
import {
  deleteUserDaytonaApiKey,
  deleteUserDaytonaApiUrl,
  getUserDaytonaApiUrl,
  hasUserDaytonaApiKey,
  setUserDaytonaApiKey,
  setUserDaytonaApiUrl,
} from "@/lib/daytona/api-key";
import { getServerSession } from "@/lib/session/get-server-session";

interface UpdateDaytonaRequest {
  apiKey?: string;
  apiUrl?: string;
}

function getValidationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Invalid Daytona API key";
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [hasApiKey, apiUrl] = await Promise.all([
    hasUserDaytonaApiKey(session.user.id),
    getUserDaytonaApiUrl(session.user.id),
  ]);

  return Response.json({ hasApiKey, apiUrl: apiUrl ?? null });
}

export async function PUT(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: UpdateDaytonaRequest;
  try {
    body = (await req.json()) as UpdateDaytonaRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return Response.json({ error: "API key is required" }, { status: 400 });
  }

  const apiUrl = body.apiUrl?.trim() || undefined;

  try {
    const daytona = new Daytona({
      apiKey,
      ...(apiUrl ? { apiUrl } : {}),
    });
    await daytona.list(undefined, 1, 1);
  } catch (error) {
    return Response.json(
      { error: getValidationErrorMessage(error) },
      { status: 400 },
    );
  }

  await setUserDaytonaApiKey(session.user.id, apiKey);

  if (apiUrl) {
    await setUserDaytonaApiUrl(session.user.id, apiUrl);
  } else {
    await deleteUserDaytonaApiUrl(session.user.id);
  }

  return Response.json({ hasApiKey: true, apiUrl: apiUrl ?? null });
}

export async function DELETE() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  await Promise.all([
    deleteUserDaytonaApiKey(session.user.id),
    deleteUserDaytonaApiUrl(session.user.id),
  ]);

  return Response.json({ hasApiKey: false, apiUrl: null });
}
