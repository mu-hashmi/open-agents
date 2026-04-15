"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CodeEditorInstallDialogProps {
  dependencyName: string;
  installError: string | null;
  installing: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function CodeEditorInstallDialog({
  dependencyName,
  installError,
  installing,
  onConfirm,
  onOpenChange,
  open,
}: CodeEditorInstallDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (installing && !nextOpen) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent showCloseButton={!installing}>
        <DialogHeader>
          <DialogTitle className="text-balance">
            Install code editor dependency?
          </DialogTitle>
          <DialogDescription className="text-pretty">
            This sandbox does not include `{dependencyName}`, which powers the
            built-in editor. Install it in this sandbox now and then open the
            editor?
          </DialogDescription>
        </DialogHeader>
        {installError ? (
          <p className="text-sm text-pretty text-destructive">{installError}</p>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={installing}
            onClick={() => onOpenChange(false)}
          >
            Not now
          </Button>
          <Button disabled={installing} onClick={onConfirm}>
            {installing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Installing...
              </>
            ) : (
              "Install & Open Editor"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
