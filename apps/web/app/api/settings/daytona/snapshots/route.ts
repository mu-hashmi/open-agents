import { Daytona } from "@daytona/sdk";
import { getUserDaytonaApiKey } from "@/lib/daytona/api-key";
import { getServerSession } from "@/lib/session/get-server-session";

const SNAPSHOT_PAGE_SIZE = 100;

interface SnapshotResponseItem {
  id: string;
  name: string;
  imageName: string | null;
  state: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastUsedAt: string | null;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function getSnapshotSortTimestamp(snapshot: SnapshotResponseItem): number {
  const timestamp =
    snapshot.lastUsedAt ?? snapshot.updatedAt ?? snapshot.createdAt;

  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const apiKey = await getUserDaytonaApiKey(session.user.id);
  if (!apiKey) {
    return Response.json(
      {
        error:
          "Configure a Daytona API key in Settings -> Connections before listing snapshots.",
      },
      { status: 400 },
    );
  }

  try {
    const daytona = new Daytona({ apiKey });
    const snapshots: SnapshotResponseItem[] = [];

    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await daytona.snapshot.list(page, SNAPSHOT_PAGE_SIZE);
      totalPages = response.totalPages;

      snapshots.push(
        ...response.items.map((snapshot) => ({
          id: snapshot.id,
          name: snapshot.name,
          imageName: snapshot.imageName ?? null,
          state: snapshot.state,
          createdAt: toIsoString(snapshot.createdAt),
          updatedAt: toIsoString(snapshot.updatedAt),
          lastUsedAt: toIsoString(snapshot.lastUsedAt),
        })),
      );

      page += 1;
    }

    snapshots.sort(
      (left, right) =>
        getSnapshotSortTimestamp(right) - getSnapshotSortTimestamp(left),
    );

    return Response.json({ snapshots });
  } catch (error) {
    console.error("Failed to list Daytona snapshots:", error);
    return Response.json(
      { error: "Failed to list Daytona snapshots" },
      { status: 500 },
    );
  }
}
