"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useDaytonaSnapshots } from "@/hooks/use-daytona-snapshots";
import { cn } from "@/lib/utils";
import { SANDBOX_OPTIONS, type SandboxType } from "./sandbox-selector-compact";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export type DaytonaLaunchMode = "blank" | "snapshot" | "image";

interface SessionStarterLaunchControlsProps {
  sandboxType: SandboxType;
  controlsDisabled: boolean;
  isSubmitDisabled: boolean;
  isLoading?: boolean;
  hasDaytonaApiKey: boolean;
  buttonLabel: string;
  onSubmit: () => void;
  onSandboxTypeChange: (sandboxType: SandboxType) => void;
  daytonaLaunchMode: DaytonaLaunchMode;
  onDaytonaLaunchModeChange: (mode: DaytonaLaunchMode) => void;
  daytonaSnapshot: string;
  onDaytonaSnapshotChange: (value: string) => void;
  daytonaImage: string;
  onDaytonaImageChange: (value: string) => void;
}

export function SessionStarterLaunchControls({
  sandboxType,
  controlsDisabled,
  isSubmitDisabled,
  isLoading,
  hasDaytonaApiKey,
  buttonLabel,
  onSubmit,
  onSandboxTypeChange,
  daytonaLaunchMode,
  onDaytonaLaunchModeChange,
  daytonaSnapshot,
  onDaytonaSnapshotChange,
  daytonaImage,
  onDaytonaImageChange,
}: SessionStarterLaunchControlsProps) {
  const {
    snapshots,
    loading: snapshotsLoading,
    error: snapshotsError,
  } = useDaytonaSnapshots({
    enabled: sandboxType === "daytona" && hasDaytonaApiKey,
  });
  const selectableSnapshots = useMemo(
    () => snapshots.filter((snapshot) => snapshot.state === "active"),
    [snapshots],
  );
  const hasSelectableSnapshots = selectableSnapshots.length > 0;
  const snapshotRequired =
    sandboxType === "daytona" &&
    daytonaLaunchMode === "snapshot" &&
    daytonaSnapshot.trim().length === 0;
  const imageRequired =
    sandboxType === "daytona" &&
    daytonaLaunchMode === "image" &&
    daytonaImage.trim().length === 0;

  useEffect(() => {
    if (
      daytonaLaunchMode !== "snapshot" ||
      !daytonaSnapshot ||
      snapshotsLoading ||
      snapshotsError
    ) {
      return;
    }

    if (
      !selectableSnapshots.some((snapshot) => snapshot.name === daytonaSnapshot)
    ) {
      onDaytonaSnapshotChange("");
    }
  }, [
    daytonaLaunchMode,
    daytonaSnapshot,
    onDaytonaSnapshotChange,
    selectableSnapshots,
    snapshotsError,
    snapshotsLoading,
  ]);

  return (
    <div className="space-y-3">
      {sandboxType === "daytona" ? (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Daytona launch source</p>
              <p className="text-xs text-muted-foreground">
                Start from a blank sandbox, a saved Daytona snapshot, or a
                Docker image reference.
              </p>
            </div>

            <div className="flex rounded-lg bg-muted/70 p-1 dark:bg-white/[0.04]">
              <button
                type="button"
                onClick={() => onDaytonaLaunchModeChange("blank")}
                disabled={controlsDisabled}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all",
                  daytonaLaunchMode === "blank"
                    ? "border border-border/70 bg-background text-foreground shadow-sm dark:border-transparent dark:bg-white/10 dark:text-neutral-100"
                    : "text-muted-foreground hover:text-foreground dark:text-neutral-400 dark:hover:text-neutral-300",
                )}
              >
                Blank sandbox
              </button>
              <button
                type="button"
                onClick={() => onDaytonaLaunchModeChange("snapshot")}
                disabled={controlsDisabled}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all",
                  daytonaLaunchMode === "snapshot"
                    ? "border border-border/70 bg-background text-foreground shadow-sm dark:border-transparent dark:bg-white/10 dark:text-neutral-100"
                    : "text-muted-foreground hover:text-foreground dark:text-neutral-400 dark:hover:text-neutral-300",
                )}
              >
                From snapshot
              </button>
              <button
                type="button"
                onClick={() => onDaytonaLaunchModeChange("image")}
                disabled={controlsDisabled}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all",
                  daytonaLaunchMode === "image"
                    ? "border border-border/70 bg-background text-foreground shadow-sm dark:border-transparent dark:bg-white/10 dark:text-neutral-100"
                    : "text-muted-foreground hover:text-foreground dark:text-neutral-400 dark:hover:text-neutral-300",
                )}
              >
                From image
              </button>
            </div>

            {daytonaLaunchMode === "snapshot" ? (
              <div className="space-y-2">
                <Select
                  value={daytonaSnapshot || undefined}
                  onValueChange={onDaytonaSnapshotChange}
                  disabled={
                    controlsDisabled ||
                    snapshotsLoading ||
                    !hasSelectableSnapshots
                  }
                >
                  <SelectTrigger
                    aria-label="Daytona snapshot"
                    className="w-full"
                  >
                    <SelectValue
                      placeholder={
                        snapshotsLoading
                          ? "Loading snapshots..."
                          : hasSelectableSnapshots
                            ? "Select a snapshot"
                            : "No active snapshots available"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {snapshots.map((snapshot) => (
                      <SelectItem
                        key={snapshot.id}
                        value={snapshot.name}
                        disabled={snapshot.state !== "active"}
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{snapshot.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {snapshot.imageName ?? "Custom image"} ·{" "}
                            {snapshot.state}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {snapshotsLoading
                    ? "Loading your Daytona snapshots."
                    : snapshotsError
                      ? snapshotsError
                      : !snapshots.length
                        ? "No Daytona snapshots found for this account."
                        : !hasSelectableSnapshots
                          ? "Only active Daytona snapshots can be used to start a sandbox."
                          : "Only this session will use the snapshot. If you start from a repository, Open Agents will still clone it after the snapshot boots."}
                </p>
                {snapshotRequired ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Select a Daytona snapshot to continue.
                  </p>
                ) : null}
              </div>
            ) : daytonaLaunchMode === "image" ? (
              <div className="space-y-2">
                <Input
                  value={daytonaImage}
                  onChange={(event) => onDaytonaImageChange(event.target.value)}
                  disabled={controlsDisabled}
                  placeholder="debian:12.9"
                  aria-label="Daytona image reference"
                />
                <p className="text-xs text-muted-foreground">
                  Daytona will pull or build this image for just this session.
                  If you start from a repository, Open Agents will clone it
                  after the image boots.
                </p>
                {imageRequired ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Enter a Docker image reference to continue.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Uses Daytona&apos;s default image for this session only.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          value={sandboxType}
          onValueChange={(value) => onSandboxTypeChange(value as SandboxType)}
          disabled={controlsDisabled}
        >
          <SelectTrigger
            aria-label="Sandbox backend"
            className="w-full shrink-0 sm:w-[190px]"
          >
            <SelectValue placeholder="Select a sandbox" />
          </SelectTrigger>
          <SelectContent align="start">
            {SANDBOX_OPTIONS.map((option) => (
              <SelectItem
                key={option.id}
                value={option.id}
                disabled={option.id === "daytona" && !hasDaytonaApiKey}
              >
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitDisabled}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            isSubmitDisabled
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isLoading ? "Creating session…" : buttonLabel}
        </button>
      </div>

      {sandboxType === "daytona" && !hasDaytonaApiKey ? (
        <p className="text-center text-xs text-amber-600 dark:text-amber-400">
          Add a Daytona API key in{" "}
          <Link
            href="/settings/connections"
            className="underline decoration-current/40 underline-offset-2"
          >
            Connections
          </Link>{" "}
          to start a Daytona session.
        </p>
      ) : null}
    </div>
  );
}
