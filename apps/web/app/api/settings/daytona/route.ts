import { Daytona } from "@daytona/sdk";
import {
  deleteUserDaytonaApiKey,
  hasUserDaytonaApiKey,
  setUserDaytonaApiKey,
} from "@/lib/daytona/api-key";
import { getServerSession } from "@/lib/session/get-server-session";

interface UpdateDaytonaApiKeyRequest {
  apiKey?: string;
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

  const hasApiKey = await hasUserDaytonaApiKey(session.user.id);
  return Response.json({ hasApiKey });
}

export async function PUT(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: UpdateDaytonaApiKeyRequest;
  try {
    body = (await req.json()) as UpdateDaytonaApiKeyRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return Response.json({ error: "API key is required" }, { status: 400 });
  }

  try {
    const daytona = new Daytona({ apiKey });
    await daytona.list(undefined, 1, 1);
  } catch (error) {
    return Response.json(
      { error: getValidationErrorMessage(error) },
      { status: 400 },
    );
  }

  await setUserDaytonaApiKey(session.user.id, apiKey);
  return Response.json({ hasApiKey: true });
}

export async function DELETE() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  await deleteUserDaytonaApiKey(session.user.id);
  return Response.json({ hasApiKey: false });
}
