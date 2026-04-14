"use client";

import { Cpu, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type DaytonaResources = {
  cpu: number;
  memory: number;
  disk: number;
};

function toStringResources(resources: DaytonaResources) {
  return {
    cpu: String(resources.cpu),
    memory: String(resources.memory),
    disk: String(resources.disk),
  };
}

/**
 * Small inline control for Daytona hot-resize operations.
 */
export function SandboxResizeControls(props: {
  sessionId: string;
  resources: DaytonaResources | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [savedResources, setSavedResources] = useState<DaytonaResources | null>(
    props.resources,
  );
  const [draft, setDraft] = useState(() =>
    props.resources
      ? toStringResources(props.resources)
      : { cpu: "", memory: "", disk: "" },
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSavedResources(props.resources);
    setDraft(
      props.resources
        ? toStringResources(props.resources)
        : { cpu: "", memory: "", disk: "" },
    );
  }, [props.resources]);

  const parsedDraft = useMemo(() => {
    const cpu = Number(draft.cpu);
    const memory = Number(draft.memory);
    const disk = Number(draft.disk);

    if (
      !Number.isInteger(cpu) ||
      !Number.isInteger(memory) ||
      !Number.isInteger(disk) ||
      cpu <= 0 ||
      memory <= 0 ||
      disk <= 0
    ) {
      return null;
    }

    return { cpu, memory, disk };
  }, [draft]);

  const isDirty =
    savedResources !== null &&
    parsedDraft !== null &&
    (parsedDraft.cpu !== savedResources.cpu ||
      parsedDraft.memory !== savedResources.memory ||
      parsedDraft.disk !== savedResources.disk);

  if (!savedResources) {
    return null;
  }

  async function handleSave() {
    if (!parsedDraft) {
      setError("CPU, memory, and disk must be positive integers.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/sandbox/resize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: props.sessionId,
          cpu: parsedDraft.cpu,
          memory: parsedDraft.memory,
          disk: parsedDraft.disk,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        resources?: DaytonaResources | null;
      } | null;

      if (!response.ok) {
        const message =
          data?.error ??
          response.statusText ??
          `Failed to resize sandbox (${response.status})`;

        throw new Error(
          message.length > 0 ? message : "Failed to resize sandbox",
        );
      }

      if (!data) {
        throw new Error("Sandbox resize returned an empty response");
      }

      const nextResources = data.resources ?? parsedDraft;
      setSavedResources(nextResources);
      setDraft(toStringResources(nextResources));
      setOpen(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to resize sandbox",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="hidden h-7 gap-2 px-2 sm:inline-flex"
          disabled={props.disabled}
        >
          <Cpu className="size-3.5" />
          <span className="text-[11px] text-muted-foreground">
            {savedResources.cpu} CPU / {savedResources.memory}G /{" "}
            {savedResources.disk}G
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Resize Daytona Sandbox</p>
          <p className="text-xs text-muted-foreground">
            CPU and memory are hot-resizable. Disk changes require a stop/start
            cycle.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="sandbox-resize-cpu">CPU</Label>
            <Input
              id="sandbox-resize-cpu"
              inputMode="numeric"
              value={draft.cpu}
              onChange={(event) =>
                setDraft((current) => ({ ...current, cpu: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sandbox-resize-memory">Memory (GiB)</Label>
            <Input
              id="sandbox-resize-memory"
              inputMode="numeric"
              value={draft.memory}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  memory: event.target.value,
                }))
              }
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sandbox-resize-disk">Disk (GiB)</Label>
            <Input
              id="sandbox-resize-disk"
              inputMode="numeric"
              value={draft.disk}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  disk: event.target.value,
                }))
              }
            />
          </div>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={props.disabled || isSaving || !isDirty || !parsedDraft}
          >
            {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
