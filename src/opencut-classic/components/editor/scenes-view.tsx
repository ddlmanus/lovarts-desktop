"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/opencut-classic/components/ui/sheet";
import { Button } from "@/opencut-classic/components/ui/button";
import { Check, ListCheck, Trash2 } from "lucide-react";
import { cn } from "@/opencut-classic/utils/ui";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/opencut-classic/components/ui/dialog";
import {
  canDeleteScene,
  getMainScene,
} from "@/opencut-classic/timeline/scenes";
import { toast } from "sonner";
import { useEditor } from "@/opencut-classic/editor/use-editor";
import { useTranslation } from "react-i18next";

export function ScenesView({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const scenes = editor.scenes.getScenes();
  const currentScene = editor.scenes.getActiveScene();
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set());

  const handleSceneSwitch = async (sceneId: string) => {
    if (isSelectMode) {
      toggleSceneSelection({ sceneId });
      return;
    }

    try {
      await editor.scenes.switchToScene({ sceneId });
    } catch (error) {
      console.error("Failed to switch scene:", error);
    }
  };

  const toggleSceneSelection = ({ sceneId }: { sceneId: string }) => {
    setSelectedScenes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sceneId)) {
        newSet.delete(sceneId);
      } else {
        newSet.add(sceneId);
      }
      return newSet;
    });
  };

  const handleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedScenes(new Set());
  };

  const handleDeleteSelected = async () => {
    for (const sceneId of selectedScenes) {
      const scene = scenes.find((scene) => scene.id === sceneId);
      if (!scene) {
        continue;
      }

      const { canDelete, reason } = canDeleteScene({ scene });
      if (!canDelete) {
        toast.error(
          reason || t("freeTools.mediaTrimmer.editor.failedDeleteScene"),
        );
        continue;
      }

      try {
        await editor.scenes.deleteScene({ sceneId });
      } catch (error) {
        console.error("Failed to delete scene:", error);
      }
    }
    setSelectedScenes(new Set());
    setIsSelectMode(false);
  };

  const isMainSceneSelected = (() => {
    const mainScene = getMainScene({ scenes });
    return Boolean(mainScene?.id && selectedScenes.has(mainScene.id));
  })();

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        className={cn(
          "w-[24rem] border-l border-border bg-background text-foreground sm:max-w-[24rem]",
          "[--accent:0_0%_18%] [--accent-foreground:0_0%_96%]",
          "[--background:var(--playground-sidebar)] [--border:var(--playground-border)]",
          "[--card:var(--playground-surface)] [--card-foreground:var(--playground-sidebar-foreground)]",
          "[--foreground:var(--playground-sidebar-foreground)] [--input:0_0%_16%]",
          "[--muted:0_0%_16%] [--muted-foreground:220_8%_65%]",
          "[--popover:var(--playground-surface)] [--popover-foreground:var(--playground-sidebar-foreground)]",
          "[--primary:var(--playground-accent)] [--primary-foreground:0_0%_5%]",
          "[--ring:var(--playground-accent)] [--secondary:0_0%_16%]",
          "[--secondary-border:0_0%_20%] [--secondary-foreground:0_0%_95%]",
        )}
      >
        <SheetHeader>
          <SheetTitle>
            {isSelectMode
              ? t("freeTools.mediaTrimmer.editor.selectScenesCount", {
                  count: selectedScenes.size,
                })
              : t("freeTools.mediaTrimmer.editor.scenes")}
          </SheetTitle>
          <SheetDescription>
            {isSelectMode
              ? t("freeTools.mediaTrimmer.editor.selectScenesToDelete")
              : t("freeTools.mediaTrimmer.editor.switchScenesDescription")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex items-center gap-2">
            <Button
              className="rounded-md"
              variant={isSelectMode ? "default" : "outline"}
              size="sm"
              onClick={handleSelectMode}
            >
              <ListCheck />
              {isSelectMode
                ? t("common.cancel")
                : t("freeTools.mediaTrimmer.editor.select")}
            </Button>
            {isSelectMode && (
              <DeleteDialog
                count={selectedScenes.size}
                onDelete={handleDeleteSelected}
                disabled={isMainSceneSelected}
                trigger={
                  <Button
                    className="rounded-md"
                    variant="destructive"
                    disabled={isMainSceneSelected}
                    size="sm"
                  >
                    <Trash2 />
                    {t("freeTools.mediaTrimmer.editor.deleteScenesButton", {
                      count: selectedScenes.size,
                    })}
                  </Button>
                }
              />
            )}
          </div>
          {scenes.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              {t("freeTools.mediaTrimmer.editor.noScenesAvailable")}
            </div>
          ) : (
            <div className="space-y-2">
              {scenes.map((scene) => (
                <Button
                  key={scene.id}
                  variant="outline"
                  className={cn(
                    "w-full justify-between font-normal",
                    currentScene?.id === scene.id &&
                      !isSelectMode &&
                      "border-primary bg-accent/40 !text-primary",
                    isSelectMode &&
                      selectedScenes.has(scene.id) &&
                      "bg-accent border-foreground/30",
                  )}
                  onClick={() => handleSceneSwitch(scene.id)}
                >
                  <span>{getDisplaySceneName({ name: scene.name, t })}</span>
                  <div className="flex items-center gap-2">
                    {((isSelectMode && selectedScenes.has(scene.id)) ||
                      (!isSelectMode && currentScene?.id === scene.id)) && (
                      <Check className="size-4" />
                    )}
                  </div>
                </Button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DeleteDialog({
  count,
  onDelete,
  disabled,
  trigger,
}: {
  count: number;
  onDelete: () => void;
  disabled?: boolean;
  trigger: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const handleDelete = () => {
    onDelete();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("freeTools.mediaTrimmer.editor.deleteScenesTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("freeTools.mediaTrimmer.editor.deleteScenesDescription", {
              count,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={disabled}
          >
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getDisplaySceneName({
  name,
  t,
}: {
  name: string;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return name === "Main scene"
    ? t("freeTools.mediaTrimmer.editor.mainScene")
    : name;
}
