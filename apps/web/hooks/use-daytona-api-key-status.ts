"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/swr";

interface DaytonaApiKeyStatusResponse {
  hasApiKey: boolean;
  apiUrl: string | null;
}

/**
 * Fetch whether the current user has configured a Daytona API key and optional custom API URL.
 */
export function useDaytonaApiKeyStatus(enabled: boolean = true) {
  const { data, error, isLoading, mutate } =
    useSWR<DaytonaApiKeyStatusResponse>(
      enabled ? "/api/settings/daytona" : null,
      fetcher,
    );

  return {
    hasApiKey: data?.hasApiKey ?? false,
    apiUrl: data?.apiUrl ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: mutate,
  };
}
