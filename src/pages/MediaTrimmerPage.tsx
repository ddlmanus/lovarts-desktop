import { useCallback, useMemo, useState } from "react";
import { Keyboard, Scissors, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/opencut-classic/components/ui/resizable";
import { AssetsPanel } from "@/opencut-classic/components/editor/panels/assets";
import { TabBar } from "@/opencut-classic/components/editor/panels/assets/tabbar";
import { PropertiesPanel } from "@/opencut-classic/components/editor/panels/properties";
import { ExportButton } from "@/opencut-classic/components/editor/export-button";
import { Button } from "@/opencut-classic/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/opencut-classic/components/ui/dropdown-menu";
import { ShortcutsDialog } from "@/opencut-classic/actions/components/shortcuts-dialog";
import { EditorProvider } from "@/opencut-classic/components/providers/editor-provider";
import { MigrationDialog } from "@/opencut-classic/project/components/migration-dialog";
import { usePanelStore } from "@/opencut-classic/editor/panel-store";
import { useEditor } from "@/opencut-classic/editor/use-editor";
import { usePasteMedia } from "@/opencut-classic/media/use-paste-media";
import { PreviewPanel } from "@/opencut-classic/preview/components";
import {
  createPreviewOverlayControl,
  isPreviewOverlayVisible,
  mergePreviewOverlaySources,
} from "@/opencut-classic/preview/overlays";
import { usePreviewStore } from "@/opencut-classic/preview/preview-store";
import { getGuidePreviewOverlaySource } from "@/opencut-classic/guides";
import {
  bookmarkNotesPreviewOverlay,
  getBookmarkPreviewOverlaySource,
} from "@/opencut-classic/timeline/bookmarks";
import { Timeline } from "@/opencut-classic/timeline/components";

const LOVARTS_OPENCUT_PROJECT_ID = "lovarts_opencut_project_id";
const FALLBACK_PROJECT_ID = "lovarts-main";

export function MediaTrimmerPage() {
  const [projectId, setProjectId] = useState(() => {
    return (
      localStorage.getItem(LOVARTS_OPENCUT_PROJECT_ID) || FALLBACK_PROJECT_ID
    );
  });

  const handleProjectIdChange = useCallback((nextProjectId: string) => {
    localStorage.setItem(LOVARTS_OPENCUT_PROJECT_ID, nextProjectId);
    setProjectId(nextProjectId);
  }, []);

  return (
    <div className="opencut-editor h-full w-full overflow-hidden bg-background text-foreground">
      <EditorProvider
        projectId={projectId}
        onProjectIdChange={handleProjectIdChange}
      >
        <div className="flex h-full w-full flex-col overflow-hidden bg-background">
          <DegradedRendererBanner />
          <LovartsOpenCutHeader onProjectIdChange={handleProjectIdChange} />
          <div className="min-h-0 min-w-0 flex-1">
            <OpenCutEditorLayout />
          </div>
          <MigrationDialog />
          <SonnerToaster
            theme="dark"
            richColors
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "border-border bg-card text-card-foreground",
              },
            }}
          />
        </div>
      </EditorProvider>
    </div>
  );
}

function LovartsOpenCutHeader({
  onProjectIdChange,
}: {
  onProjectIdChange: (projectId: string) => void;
}) {
  return (
    <header className="lovarts-cut-header flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ProjectMenu onProjectIdChange={onProjectIdChange} />
        <TabBar className="min-w-0 flex-1" />
      </div>
      <nav className="flex shrink-0 items-center gap-2">
        <ExportButton />
      </nav>
    </header>
  );
}

function ProjectMenu({
  onProjectIdChange,
}: {
  onProjectIdChange: (projectId: string) => void;
}) {
  const { t } = useTranslation();
  const [openDialog, setOpenDialog] = useState<"shortcuts" | null>(null);
  const editor = useEditor();
  const activeProject = useEditor((e) => e.project.getActiveOrNull());

  const handleNewProject = async () => {
    try {
      await editor.project.prepareExit();
      const projectId = await editor.project.createNewProject({
        name: t("freeTools.mediaTrimmer.editor.defaultProjectName"),
      });
      onProjectIdChange(projectId);
    } catch (error) {
      sonnerToast.error(
        t("freeTools.mediaTrimmer.editor.failedCreateProject"),
        {
          description:
            error instanceof Error
              ? error.message
              : t("freeTools.mediaTrimmer.editor.tryAgain"),
        },
      );
    }
  };

  const handleSaveNow = async () => {
    try {
      await editor.project.saveCurrentProject();
      sonnerToast.success(t("freeTools.mediaTrimmer.editor.projectSaved"));
    } catch (error) {
      sonnerToast.error(t("freeTools.mediaTrimmer.editor.failedSaveProject"), {
        description:
          error instanceof Error
            ? error.message
            : t("freeTools.mediaTrimmer.editor.tryAgain"),
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-[4px] p-1"
            aria-label={t("freeTools.mediaTrimmer.editor.projectMenu")}
          >
            <Scissors className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="z-[100] w-44">
          <DropdownMenuItem onClick={handleNewProject}>
            {t("freeTools.mediaTrimmer.editor.newProject")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSaveNow} disabled={!activeProject}>
            {t("freeTools.mediaTrimmer.editor.saveProject")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setOpenDialog("shortcuts")}
            icon={<Keyboard className="size-4" />}
          >
            {t("freeTools.mediaTrimmer.editor.shortcuts")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShortcutsDialog
        isOpen={openDialog === "shortcuts"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "shortcuts" : null)}
      />
    </>
  );
}

function DegradedRendererBanner() {
  const { t } = useTranslation();
  const isDegraded = useEditor((e) => e.renderer.isDegraded);
  const [dismissed, setDismissed] = useState(false);
  if (!isDegraded || dismissed) return null;

  return (
    <div className="flex h-9 shrink-0 items-center justify-center gap-2 border-b border-border bg-accent text-xs text-muted-foreground">
      <span>{t("freeTools.mediaTrimmer.editor.gpuFallback")}</span>
      <Button
        variant="text"
        size="icon"
        className="h-6 w-6 p-0 [&_svg]:size-3.5"
        onClick={() => setDismissed(true)}
        aria-label={t("freeTools.mediaTrimmer.editor.dismiss")}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

function OpenCutEditorLayout() {
  usePasteMedia();
  const { panels, setPanel } = usePanelStore();
  const activeScene = useEditor((editor) =>
    editor.scenes.getActiveSceneOrNull(),
  );
  const currentTime = useEditor((editor) => editor.playback.getCurrentTime());
  const activeGuide = usePreviewStore((state) => state.activeGuide);
  const overlays = usePreviewStore((state) => state.overlays);
  const setOverlayVisibility = usePreviewStore(
    (state) => state.setOverlayVisibility,
  );
  const showBookmarkNotes = isPreviewOverlayVisible({
    overlay: bookmarkNotesPreviewOverlay,
    overlays,
  });

  const overlaySource = useMemo(
    () =>
      mergePreviewOverlaySources({
        sources: [
          getGuidePreviewOverlaySource({
            guideId: activeGuide,
          }),
          activeScene
            ? getBookmarkPreviewOverlaySource({
                bookmarks: activeScene.bookmarks,
                time: currentTime,
                isVisible: showBookmarkNotes,
              })
            : {
                definitions: [bookmarkNotesPreviewOverlay],
                instances: [],
              },
        ],
      }),
    [activeGuide, activeScene, currentTime, showBookmarkNotes],
  );

  const overlayControls = useMemo(
    () =>
      overlaySource.definitions.map((overlay) =>
        createPreviewOverlayControl({ overlay, overlays }),
      ),
    [overlaySource.definitions, overlays],
  );

  return (
    <ResizablePanelGroup
      direction="vertical"
      className="size-full gap-px bg-background"
      onLayout={(sizes) => {
        setPanel({
          panel: "mainContent",
          size: sizes[0] ?? panels.mainContent,
        });
        setPanel({
          panel: "timeline",
          size: sizes[1] ?? panels.timeline,
        });
      }}
    >
      <ResizablePanel
        defaultSize={panels.mainContent}
        minSize={30}
        maxSize={85}
        className="min-h-0"
      >
        <ResizablePanelGroup
          direction="horizontal"
          className="size-full gap-px px-1.5 pt-1.5"
          onLayout={(sizes) => {
            setPanel({ panel: "tools", size: sizes[0] ?? panels.tools });
            setPanel({ panel: "preview", size: sizes[1] ?? panels.preview });
            setPanel({
              panel: "properties",
              size: sizes[2] ?? panels.properties,
            });
          }}
        >
          <ResizablePanel
            defaultSize={panels.tools}
            minSize={15}
            maxSize={34}
            className="min-w-0"
          >
            <AssetsPanel />
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            defaultSize={panels.preview}
            minSize={30}
            className="min-h-0 min-w-0 flex-1"
          >
            <PreviewPanel
              overlayControls={overlayControls}
              overlayInstances={overlaySource.instances}
              onOverlayVisibilityChange={setOverlayVisibility}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            defaultSize={panels.properties}
            minSize={15}
            maxSize={34}
            className="min-w-0"
          >
            <PropertiesPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel
        defaultSize={panels.timeline}
        minSize={15}
        maxSize={70}
        className="min-h-0 px-1.5 pb-1.5"
      >
        <Timeline />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
