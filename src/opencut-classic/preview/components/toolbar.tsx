"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEditor } from "@/opencut-classic/editor/use-editor";
import { formatTimecode } from "opencut-wasm";
import { invokeAction } from "@/opencut-classic/actions";
import { EditableTimecode } from "@/opencut-classic/components/editable-timecode";
import { Button } from "@/opencut-classic/components/ui/button";
import {
  FullScreenIcon,
  PauseIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Separator } from "@/opencut-classic/components/ui/separator";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectSeparator,
} from "@/opencut-classic/components/ui/select";
import { PREVIEW_ZOOM_PRESETS } from "@/opencut-classic/preview/zoom";
import { usePreviewViewport } from "./preview-viewport";
import { GridPopover } from "./guide-popover";
import { usePreviewStore } from "@/opencut-classic/preview/preview-store";
import type { MediaTime } from "@/opencut-classic/wasm";

export function PreviewToolbar({
  onToggleFullscreen,
}: {
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pb-2 pt-3">
      <TimecodeDisplay />
      <PlayPauseButton />
      <div className="justify-self-end flex items-center gap-2.5">
        <ZoomSelect />
        <Separator orientation="vertical" className="h-4" />
        {/* v0.4.0 */}
        {/* <GridPopover>
					<Button
						variant={activeGuideDefinition ? "secondary" : "text"}
						size="icon"
					>
						{activeGuideDefinition ? (
							activeGuideDefinition.renderTriggerIcon()
						) : (
							<HugeiconsIcon icon={GridTableIcon} />
						)}
					</Button>
				</GridPopover> */}
        <Button variant="text" onClick={onToggleFullscreen}>
          <HugeiconsIcon icon={FullScreenIcon} />
        </Button>
      </div>
    </div>
  );
}

function TimecodeDisplay() {
  const editor = useEditor();
  const totalDuration = useEditor((e) => e.timeline.getTotalDuration());
  const fps = useEditor((e) => e.project.getActive().settings.fps);
  const [currentTime, setCurrentTime] = useState<MediaTime>(() =>
    editor.playback.getCurrentTime(),
  );

  useEffect(() => {
    const unsubscribeUpdate = editor.playback.onUpdate(setCurrentTime);
    const unsubscribeSeek = editor.playback.onSeek(setCurrentTime);
    return () => {
      unsubscribeUpdate();
      unsubscribeSeek();
    };
  }, [editor.playback]);

  return (
    <div className="flex items-center">
      <EditableTimecode
        time={currentTime}
        duration={totalDuration}
        format="HH:MM:SS:FF"
        fps={fps}
        onTimeChange={({ time }) => editor.playback.seek({ time })}
        className="text-center"
      />
      <span className="text-muted-foreground px-2 font-mono text-xs">/</span>
      <span className="text-muted-foreground font-mono text-xs">
        {formatTimecode({
          time: totalDuration,
          format: "HH:MM:SS:FF",
          rate: fps,
        })}
      </span>
    </div>
  );
}

function ZoomSelect() {
  const { t } = useTranslation();
  const { isAtFit, zoomPercent, fitToScreen, setViewportPercent } =
    usePreviewViewport();

  const fitLabel = t("freeTools.mediaTrimmer.editor.fit");
  const displayLabel = isAtFit ? fitLabel : `${zoomPercent}%`;

  const onValueChange = (value: string) => {
    if (value === "fit") {
      fitToScreen();
    } else {
      setViewportPercent({ percent: Number(value) });
    }
  };

  return (
    <Select
      value={isAtFit ? "fit" : String(zoomPercent)}
      onValueChange={onValueChange}
    >
      <SelectTrigger className="tabular-nums">{displayLabel}</SelectTrigger>
      <SelectContent>
        <SelectItem value="fit">{fitLabel}</SelectItem>
        <SelectSeparator />
        {PREVIEW_ZOOM_PRESETS.map((preset) => (
          <SelectItem key={preset} value={String(preset)}>
            {preset}%
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PlayPauseButton() {
  const isPlaying = useEditor((e) => e.playback.getIsPlaying());

  return (
    <Button
      variant="text"
      size="icon"
      onClick={() => invokeAction("toggle-play")}
    >
      <HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} />
    </Button>
  );
}
