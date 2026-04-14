"use client";

import { Loader2, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDaytonaApiKeyStatus } from "@/hooks/use-daytona-api-key-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Manage the user's Daytona BYOK connection from Settings.
 */
export function DaytonaConnectionCard() {
  const {
    hasApiKey,
    loading,
    refresh: refreshStatus,
  } = useDaytonaApiKeyStatus();
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!hasApiKey) {
      setApiKey("");
    }
  }, [hasApiKey]);

  async function handleSave() {
    setIsSaving(true);
    try {
      const response = await fetch("/api/settings/daytona", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save Daytona API key");
      }

      setApiKey("");
      await refreshStatus();
      toast.success("Daytona API key saved");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save API key";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const response = await fetch("/api/settings/daytona", {
        method: "DELETE",
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to remove Daytona API key");
      }

      await refreshStatus();
      toast.success("Daytona API key removed");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove API key";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border/50 bg-muted/10">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Server className="h-5 w-5" />
          <span className="text-sm font-medium">Daytona</span>
        </div>
        <span className="text-xs text-muted-foreground">BYOK</span>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          Use your own Daytona account to create persistent cloud sandboxes.
        </p>

        <div className="rounded-md border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          {loading
            ? "Checking Daytona connection..."
            : hasApiKey
              ? "API key configured"
              : "No API key configured"}
        </div>

        <Input
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            hasApiKey
              ? "Paste a new Daytona API key to replace the current one"
              : "Paste your Daytona API key"
          }
          autoComplete="off"
          spellCheck={false}
        />

        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading || isSaving || apiKey.trim().length === 0}
          >
            {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Save API Key
          </Button>
          {hasApiKey ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleDelete()}
              disabled={loading || isDeleting || isSaving}
            >
              {isDeleting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
