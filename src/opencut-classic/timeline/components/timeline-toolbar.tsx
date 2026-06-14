import { useEditor } from "@/opencut-classic/editor/use-editor";
import type { EditorCore } from "@/opencut-classic/core";
import { useTranslation } from "react-i18next";
import { useElementSelection } from "@/opencut-classic/timeline/hooks/element/use-element-selection";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/opencut-classic/components/ui/tooltip";
import { Button } from "@/opencut-classic/components/ui/button";
import {
  SplitButton,
  SplitButtonLeft,
  SplitButtonRight,
  SplitButtonSeparator,
} from "@/opencut-classic/components/ui/split-button";
import { Slider } from "@/opencut-classic/components/ui/slider";
import { TIMELINE_ZOOM_BUTTON_FACTOR } from "./interaction";
import { TIMELINE_ZOOM_MAX } from "@/opencut-classic/timeline/scale";
import {
  sliderToZoom,
  zoomToSlider,
} from "@/opencut-classic/timeline/zoom-utils";
import { ScenesView } from "@/opencut-classic/components/editor/scenes-view";
import {
  type TActionWithOptionalArgs,
  invokeAction,
} from "@/opencut-classic/actions";
import {
  canToggleSourceAudio,
  isSourceAudioSeparated,
} from "@/opencut-classic/timeline/audio-separation";
import { hasMediaId } from "@/opencut-classic/timeline";
import type { VideoElement } from "@/opencut-classic/timeline";
import { cn } from "@/opencut-classic/utils/ui";
import { useTimelineStore } from "@/opencut-classic/timeline/timeline-store";
import { processMediaAssets } from "@/opencut-classic/media/processing";
import { buildElementFromMedia } from "@/opencut-classic/timeline/element-utils";
import {
  mediaTimeFromSeconds,
  mediaTimeToSeconds,
  subMediaTime,
  type MediaTime,
} from "@/opencut-classic/wasm";
import { getSourceTimeAtClipTime } from "@/opencut-classic/retime";
import { ScrollArea } from "@/opencut-classic/components/ui/scroll-area";
import {
  Bookmark02Icon,
  Delete02Icon,
  SnowIcon,
  ScissorIcon,
  MagnetIcon,
  SearchAddIcon,
  SearchMinusIcon,
  Copy01Icon,
  AlignLeftIcon,
  AlignRightIcon,
  Link02Icon,
  Layers01Icon,
  Chart03Icon,
  Unlink02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { OcRippleIcon } from "@/opencut-classic/components/icons";
import { GraphEditorPopover } from "./graph-editor/popover";
import { PopoverTrigger } from "@/opencut-classic/components/ui/popover";
import { useGraphEditorController } from "./graph-editor/use-controller";
import { toast } from "sonner";

export function TimelineToolbar({
  zoomLevel,
  minZoom,
  setZoomLevel,
}: {
  zoomLevel: number;
  minZoom: number;
  setZoomLevel: ({ zoom }: { zoom: number }) => void;
}) {
  const handleZoom = ({ direction }: { direction: "in" | "out" }) => {
    const newZoomLevel =
      direction === "in"
        ? Math.min(TIMELINE_ZOOM_MAX, zoomLevel * TIMELINE_ZOOM_BUTTON_FACTOR)
        : Math.max(minZoom, zoomLevel / TIMELINE_ZOOM_BUTTON_FACTOR);
    setZoomLevel({ zoom: newZoomLevel });
  };

  return (
    <ScrollArea className="scrollbar-hidden">
      <div className="flex h-9 items-center justify-between border-b px-2 py-1">
        <ToolbarLeftSection />

        <SceneSelector />

        <ToolbarRightSection
          zoomLevel={zoomLevel}
          minZoom={minZoom}
          onZoomChange={(zoom) => setZoomLevel({ zoom })}
          onZoom={handleZoom}
        />
      </div>
    </ScrollArea>
  );
}

function ToolbarLeftSection() {
  const { t } = useTranslation();
  const editor = useEditor();
  const mediaAssets = useEditor((currentEditor) =>
    currentEditor.media.getAssets(),
  );
  const { selectedElements } = useElementSelection();
  const graphEditor = useGraphEditorController();
  const isCurrentlyBookmarked = useEditor((e) =>
    e.scenes.isBookmarked({ time: e.playback.getCurrentTime() }),
  );
  const selectedElement =
    selectedElements.length === 1
      ? (editor.timeline.getElementsWithTracks({
          elements: selectedElements,
        })[0] ?? null)
      : null;
  const selectedMediaAsset = (() => {
    if (!selectedElement) {
      return null;
    }

    const { element } = selectedElement;
    if (!hasMediaId(element)) {
      return null;
    }

    return mediaAssets.find((asset) => asset.id === element.mediaId) ?? null;
  })();
  const canToggleSelectedSourceAudio =
    !!selectedElement &&
    canToggleSourceAudio(selectedElement.element, selectedMediaAsset);
  const sourceAudioLabel =
    selectedElement?.element.type === "video"
      ? isSourceAudioSeparated({ element: selectedElement.element })
        ? t("freeTools.mediaTrimmer.editor.recoverAudio")
        : t("freeTools.mediaTrimmer.editor.extractAudio")
      : t("freeTools.mediaTrimmer.editor.extractAudio");
  const isSelectedSourceAudioSeparated =
    selectedElement?.element.type === "video" &&
    isSourceAudioSeparated({
      element: selectedElement.element,
    });
  const canFreezeFrame =
    selectedElement?.element.type === "video" &&
    selectedMediaAsset?.type === "video" &&
    editor.playback.getCurrentTime() > selectedElement.element.startTime &&
    editor.playback.getCurrentTime() <
      selectedElement.element.startTime + selectedElement.element.duration;

  const handleAction = ({
    action,
    event,
  }: {
    action: TActionWithOptionalArgs;
    event: React.MouseEvent;
  }) => {
    event.stopPropagation();
    invokeAction(action);
  };
  const handleFreezeFrame = ({ event }: { event: React.MouseEvent }) => {
    event.stopPropagation();
    if (
      selectedElement?.element.type !== "video" ||
      selectedMediaAsset?.type !== "video"
    ) {
      toast.error(t("freeTools.mediaTrimmer.editor.toolbar.freezeFrameSelect"));
      return;
    }

    toast.promise(
      insertFreezeFrame({
        editor,
        mediaFile: selectedMediaAsset.file,
        element: selectedElement.element,
        timelineTime: editor.playback.getCurrentTime(),
      }),
      {
        loading: t("freeTools.mediaTrimmer.editor.toolbar.freezeFrameRunning"),
        success: t("freeTools.mediaTrimmer.editor.toolbar.freezeFrameDone"),
        error: (error) =>
          error instanceof Error
            ? error.message
            : t("freeTools.mediaTrimmer.editor.toolbar.freezeFrameFailed"),
      },
    );
  };

  return (
    <div className="flex items-center gap-1">
      <TooltipProvider delayDuration={500}>
        <ToolbarButton
          icon={<HugeiconsIcon icon={ScissorIcon} />}
          tooltip={t("freeTools.mediaTrimmer.editor.toolbar.splitElement")}
          onClick={({ event }) => handleAction({ action: "split", event })}
        />

        <ToolbarButton
          icon={<HugeiconsIcon icon={AlignLeftIcon} />}
          tooltip={t("freeTools.mediaTrimmer.editor.toolbar.splitLeft")}
          onClick={({ event }) => handleAction({ action: "split-left", event })}
        />

        <ToolbarButton
          icon={<HugeiconsIcon icon={AlignRightIcon} />}
          tooltip={t("freeTools.mediaTrimmer.editor.toolbar.splitRight")}
          onClick={({ event }) =>
            handleAction({ action: "split-right", event })
          }
        />

        <ToolbarButton
          icon={
            <HugeiconsIcon
              icon={isSelectedSourceAudioSeparated ? Unlink02Icon : Link02Icon}
            />
          }
          tooltip={sourceAudioLabel}
          disabled={!canToggleSelectedSourceAudio}
          onClick={({ event }) =>
            handleAction({ action: "toggle-source-audio", event })
          }
        />

        <ToolbarButton
          icon={<HugeiconsIcon icon={Copy01Icon} />}
          tooltip={t("freeTools.mediaTrimmer.editor.toolbar.duplicateElement")}
          onClick={({ event }) =>
            handleAction({ action: "duplicate-selected", event })
          }
        />

        <ToolbarButton
          icon={<HugeiconsIcon icon={SnowIcon} />}
          tooltip={t("freeTools.mediaTrimmer.editor.toolbar.freezeFrame")}
          disabled={!canFreezeFrame}
          onClick={handleFreezeFrame}
        />

        <ToolbarButton
          icon={<HugeiconsIcon icon={Delete02Icon} />}
          tooltip={t("freeTools.mediaTrimmer.editor.toolbar.deleteElement")}
          onClick={({ event }) =>
            handleAction({ action: "delete-selected", event })
          }
        />

        <div className="bg-border mx-1 h-6 w-px" />

        <Tooltip>
          <ToolbarButton
            icon={<HugeiconsIcon icon={Bookmark02Icon} />}
            isActive={isCurrentlyBookmarked}
            tooltip={
              isCurrentlyBookmarked
                ? t("freeTools.mediaTrimmer.editor.toolbar.removeBookmark")
                : t("freeTools.mediaTrimmer.editor.toolbar.addBookmark")
            }
            onClick={({ event }) =>
              handleAction({ action: "toggle-bookmark", event })
            }
          />
        </Tooltip>

        <GraphEditorPopover
          open={graphEditor.open}
          onOpenChange={graphEditor.onOpenChange}
          value={
            graphEditor.state.status === "ready"
              ? graphEditor.state.cubicBezier
              : null
          }
          message={graphEditor.state.message}
          componentOptions={graphEditor.state.componentOptions}
          activeComponentKey={graphEditor.state.activeComponentKey}
          onActiveComponentKeyChange={graphEditor.onActiveComponentKeyChange}
          onPreviewValue={graphEditor.onPreviewValue}
          onCommitValue={graphEditor.onCommitValue}
          onCancelPreview={graphEditor.onCancelPreview}
        >
          <ToolbarButton
            icon={<HugeiconsIcon icon={Chart03Icon} />}
            tooltip={graphEditor.tooltip}
            disabled={!graphEditor.canOpen}
            buttonWrapper={(button) =>
              graphEditor.canOpen ? (
                <PopoverTrigger asChild>{button}</PopoverTrigger>
              ) : (
                button
              )
            }
          />
        </GraphEditorPopover>
      </TooltipProvider>
    </div>
  );
}

function SceneSelector() {
  const { t } = useTranslation();
  const editor = useEditor();
  const currentScene = editor.scenes.getActiveScene();
  const sceneName =
    currentScene?.isMain && currentScene.name === "Main scene"
      ? t("freeTools.mediaTrimmer.editor.mainScene")
      : currentScene?.name || t("freeTools.mediaTrimmer.editor.noScene");

  return (
    <div>
      <SplitButton className="border-foreground/10 border">
        <SplitButtonLeft>{sceneName}</SplitButtonLeft>
        <SplitButtonSeparator />
        <ScenesView>
          <SplitButtonRight onClick={() => {}}>
            <HugeiconsIcon icon={Layers01Icon} className="size-4" />
          </SplitButtonRight>
        </ScenesView>
      </SplitButton>
    </div>
  );
}

function ToolbarRightSection({
  zoomLevel,
  minZoom,
  onZoomChange,
  onZoom,
}: {
  zoomLevel: number;
  minZoom: number;
  onZoomChange: (zoom: number) => void;
  onZoom: (options: { direction: "in" | "out" }) => void;
}) {
  const { t } = useTranslation();
  const snappingEnabled = useTimelineStore((s) => s.snappingEnabled);
  const rippleEditingEnabled = useTimelineStore((s) => s.rippleEditingEnabled);
  const toggleSnapping = useTimelineStore((s) => s.toggleSnapping);
  const toggleRippleEditing = useTimelineStore((s) => s.toggleRippleEditing);

  return (
    <div className="flex items-center gap-1">
      <TooltipProvider delayDuration={500}>
        <ToolbarButton
          icon={<HugeiconsIcon icon={MagnetIcon} />}
          isActive={snappingEnabled}
          tooltip={t("freeTools.mediaTrimmer.editor.toolbar.autoSnapping")}
          onClick={() => toggleSnapping()}
        />

        <ToolbarButton
          icon={<OcRippleIcon size={24} className="scale-110" />}
          isActive={rippleEditingEnabled}
          tooltip={t("freeTools.mediaTrimmer.editor.toolbar.rippleEditing")}
          onClick={() => toggleRippleEditing()}
        />
      </TooltipProvider>

      <div className="bg-border mx-1 h-6 w-px" />

      <div className="flex items-center gap-1">
        <Button
          variant="text"
          size="icon"
          onClick={() => onZoom({ direction: "out" })}
        >
          <HugeiconsIcon icon={SearchMinusIcon} />
        </Button>
        <Slider
          className="w-28"
          value={[zoomToSlider({ zoomLevel, minZoom })]}
          onValueChange={(values) =>
            onZoomChange(sliderToZoom({ sliderPosition: values[0], minZoom }))
          }
          min={0}
          max={1}
          step={0.005}
        />
        <Button
          variant="text"
          size="icon"
          onClick={() => onZoom({ direction: "in" })}
        >
          <HugeiconsIcon icon={SearchAddIcon} />
        </Button>
      </div>
    </div>
  );
}

async function waitForVideoEvent({
  video,
  eventName,
}: {
  video: HTMLVideoElement;
  eventName: "loadedmetadata" | "seeked";
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, handleEvent);
      video.removeEventListener("error", handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("无法读取当前视频帧"));
    };
    video.addEventListener(eventName, handleEvent, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

async function canvasToPngFile({
  canvas,
  name,
}: {
  canvas: HTMLCanvasElement;
  name: string;
}): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png", 0.95),
  );
  if (!blob) {
    throw new Error("冻结帧生成失败");
  }
  return new File([blob], name, { type: "image/png" });
}

async function insertFreezeFrame({
  editor,
  mediaFile,
  element,
  timelineTime,
}: {
  editor: EditorCore;
  mediaFile: File;
  element: VideoElement;
  timelineTime: MediaTime;
}): Promise<void> {
  const localTime = mediaTimeToSeconds({
    time: subMediaTime({ a: timelineTime, b: element.startTime }),
  });
  const sourceTime =
    mediaTimeToSeconds({ time: element.trimStart }) +
    getSourceTimeAtClipTime({
      clipTime: localTime,
      retime: element.retime,
    });
  const objectUrl = URL.createObjectURL(mediaFile);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;

  try {
    await waitForVideoEvent({ video, eventName: "loadedmetadata" });
    video.currentTime = Math.min(
      Math.max(0, sourceTime),
      Math.max(0, video.duration - 0.03),
    );
    await waitForVideoEvent({ video, eventName: "seeked" });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("当前环境无法生成冻结帧");
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const file = await canvasToPngFile({
      canvas,
      name: `${element.name || "freeze-frame"}.png`,
    });
    const processedAssets = await processMediaAssets({ files: [file] });
    const processedAsset = processedAssets[0];
    if (!processedAsset) {
      throw new Error("冻结帧导入失败");
    }

    const project = editor.project.getActive();
    const mediaAsset = await editor.media.addMediaAsset({
      projectId: project.id,
      asset: processedAsset,
    });
    if (!mediaAsset) {
      throw new Error("冻结帧保存失败");
    }

    editor.timeline.insertElement({
      placement: { mode: "auto", trackType: "video" },
      element: buildElementFromMedia({
        mediaId: mediaAsset.id,
        mediaType: mediaAsset.type,
        name: mediaAsset.name,
        duration: mediaTimeFromSeconds({ seconds: 2 }),
        startTime: timelineTime,
      }),
    });
  } finally {
    video.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

function ToolbarButton({
  icon,
  tooltip,
  onClick,
  disabled,
  isActive,
  buttonWrapper,
}: {
  icon: React.ReactNode;
  tooltip: string;
  onClick?: ({ event }: { event: React.MouseEvent }) => void;
  disabled?: boolean;
  isActive?: boolean;
  buttonWrapper?: (button: React.ReactElement) => React.ReactElement;
}) {
  const button = (
    <Button
      variant={isActive ? "secondary" : "text"}
      size="icon"
      disabled={disabled}
      onClick={onClick ? (event) => onClick({ event }) : undefined}
      className={cn(
        "rounded-[4px]",
        disabled ? "cursor-not-allowed opacity-50" : "",
      )}
    >
      {icon}
    </Button>
  );
  const trigger = disabled ? (
    <span className="inline-flex">{button}</span>
  ) : buttonWrapper ? (
    buttonWrapper(button)
  ) : (
    button
  );

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
