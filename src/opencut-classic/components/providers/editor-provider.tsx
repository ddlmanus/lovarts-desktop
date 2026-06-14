"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { EditorCore } from "@/opencut-classic/core";
import { useEditor } from "@/opencut-classic/editor/use-editor";
import { useKeybindingsListener } from "@/opencut-classic/actions/use-keybindings";
import { useKeybindingsStore } from "@/opencut-classic/actions/keybindings-store";
import { useTimelineStore } from "@/opencut-classic/timeline/timeline-store";
import { useEditorActions } from "@/opencut-classic/actions/use-editor-actions";
import { loadFontAtlas } from "@/opencut-classic/fonts/google-fonts";
import {
  initializeGpuRenderer,
  isGpuAvailable,
} from "@/opencut-classic/services/renderer/gpu-renderer";

interface EditorProviderProps {
  projectId: string;
  onProjectIdChange?: (projectId: string) => void;
  children: React.ReactNode;
}

export function EditorProvider({
  projectId,
  onProjectIdChange,
  children,
}: EditorProviderProps) {
  const { t } = useTranslation();
  const activeProject = useEditor((e) => e.project.getActiveOrNull());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setLoadingProject } = useKeybindingsStore();

  useEffect(() => {
    setLoadingProject(isLoading);
  }, [isLoading, setLoadingProject]);

  useEffect(() => {
    let cancelled = false;
    const editor = EditorCore.getInstance();

    const loadProject = async () => {
      try {
        setIsLoading(true);
        await initializeGpuRenderer();
        editor.renderer.setDegraded(!isGpuAvailable());
        let activeProjectId = projectId;

        try {
          await editor.project.loadProject({ id: activeProjectId });
        } catch (err) {
          const isNotFound =
            err instanceof Error &&
            (err.message.includes("not found") ||
              err.message.includes("does not exist"));

          if (!isNotFound) {
            throw err;
          }

          activeProjectId = await editor.project.createNewProject({
            name: i18n.t("freeTools.mediaTrimmer.editor.defaultProjectName"),
          });
          onProjectIdChange?.(activeProjectId);
        }

        if (cancelled) return;

        setIsLoading(false);
        loadFontAtlas();
      } catch (err) {
        if (cancelled) return;

        const isNotFound =
          err instanceof Error &&
          (err.message.includes("not found") ||
            err.message.includes("does not exist"));

        if (isNotFound) {
          setError(t("freeTools.mediaTrimmer.editor.failedCreateProject"));
          setIsLoading(false);
        } else {
          const wasmPanic = (window as Window & { __wasmPanic?: string })
            .__wasmPanic;
          if (wasmPanic) {
            delete (window as Window & { __wasmPanic?: string }).__wasmPanic;
            setError(wasmPanic);
          } else {
            setError(
              err instanceof Error
                ? err.message
                : t("freeTools.mediaTrimmer.editor.failedLoadProject"),
            );
          }
          setIsLoading(false);
        }
      }
    };

    loadProject();

    return () => {
      cancelled = true;
    };
  }, [projectId, onProjectIdChange, t]);

  if (error) {
    return (
      <div className="bg-background flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-background flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-muted-foreground size-8 animate-spin" />
          <p className="text-muted-foreground text-sm">
            {t("freeTools.mediaTrimmer.editor.loadingProject")}
          </p>
        </div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="bg-background flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-muted-foreground size-8 animate-spin" />
          <p className="text-muted-foreground text-sm">
            {t("freeTools.mediaTrimmer.editor.exitingProject")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <EditorRuntimeBindings />
      {children}
    </>
  );
}

function EditorRuntimeBindings() {
  const editor = useEditor();
  const rippleEditingEnabled = useTimelineStore(
    (state) => state.rippleEditingEnabled,
  );

  useEffect(() => {
    editor.command.isRippleEnabled = rippleEditingEnabled;
  }, [editor, rippleEditingEnabled]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!editor.save.getIsDirty()) return;
      event.preventDefault();
      (event as unknown as { returnValue: string }).returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editor]);

  useEditorActions();
  useKeybindingsListener();
  return null;
}
