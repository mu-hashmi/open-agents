"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/swr";

export interface DaytonaSnapshotSummary {
  id: string;
  name: string;
  imageName: string | null;
  state: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastUsedAt: string | null;
}

interface DaytonaSnapshotsResponse {
  snapshots: DaytonaSnapshotSummary[];
}

export function useDaytonaSnapshots(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { data, error, isLoading, mutate } = useSWR<DaytonaSnapshotsResponse>(
    enabled ? "/api/settings/daytona/snapshots" : null,
    fetcher,
  );

  return {
    snapshots: data?.snapshots ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refreshSnapshots: mutate,
  };
}
