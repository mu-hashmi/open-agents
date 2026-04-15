"use client";

import { ChevronDown, Loader2, Server } from "lucide-react";
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
    apiUrl: savedApiUrl,
    loading,
    refresh: refreshStatus,
  } = useDaytonaApiKeyStatus();
  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!hasApiKey) {
      setApiKey("");
      setApiUrl("");
    }
  }, [hasApiKey]);

  useEffect(() => {
    if (savedApiUrl) {
      setShowAdvanced(true);
    }
  }, [savedApiUrl]);

  async function handleSave() {
    setIsSaving(true);
    try {
      const response = await fetch("/api/settings/daytona", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          ...(apiUrl.trim() ? { apiUrl: apiUrl.trim() } : {}),
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save Daytona connection");
      }

      setApiKey("");
      setApiUrl("");
      await refreshStatus();
      toast.success("Daytona connection saved");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save connection";
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
        throw new Error(data.error ?? "Failed to remove Daytona connection");
      }

      await refreshStatus();
      toast.success("Daytona connection removed");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove connection";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }

  function getStatusLabel(): string {
    if (loading) {
      return "Checking Daytona connection...";
    }

    if (!hasApiKey) {
      return "No API key configured";
    }

    if (savedApiUrl) {
      return `Connected to ${savedApiUrl}`;
    }

    return "Connected to Daytona Cloud";
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
          Use your own Daytona account or self-hosted instance to create
          persistent cloud sandboxes.
        </p>

        <div className="rounded-md border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          {getStatusLabel()}
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

        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <ChevronDown
            className={`size-3 transition-transform ${showAdvanced ? "" : "-rotate-90"}`}
          />
          Self-hosted / custom API URL
        </button>

        {showAdvanced ? (
          <Input
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            placeholder={
              savedApiUrl ?? "https://your-daytona-instance.example.com/api"
            }
            autoComplete="off"
            spellCheck={false}
          />
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading || isSaving || apiKey.trim().length === 0}
          >
            {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Save
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
