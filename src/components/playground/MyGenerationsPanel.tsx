import type { GenerationHistoryItem, HistoryItem } from "@/types/prediction";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  extractOutputUrl,
  is3DUrl,
  isAudioUrl,
  isImageUrl,
  isVideoUrl,
} from "@/lib/mediaUtils";
import { cn } from "@/lib/utils";
import { queueCanvasImport } from "@/workflow/lib/pendingCanvasImport";
import { AudioPlayer } from "@/components/shared/AudioPlayer";
import { Model3DViewer } from "@/components/shared/Model3DViewer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  Box,
  Download,
  FileText,
  Import as ImportIcon,
  Loader2,
  Maximize2,
  RefreshCw,
  Trash2,
} from "lucide-react";

type GenerationCard = {
  id: string;
  model: string;
  status: string;
  createdAt: number;
  outputs: (string | Record<string, unknown>)[];
  thumbnailUrl: string | null;
  thumbnailType: "image" | "video" | "audio" | "3d" | null;
  error?: string | null;
  source: "local" | "remote";
  predictionId?: string | null;
};

type GenerationPreview = {
  url: string;
  type: "image" | "video" | "3d";
  model: string;
  createdAt: number;
};

interface MyGenerationsPanelProps {
  localHistory: GenerationHistoryItem[];
  remoteHistory: HistoryItem[];
  isLoading?: boolean;
  preferRemoteHistory?: boolean;
  onRefresh?: () => void;
  onShowExamples?: () => void;
  onDelete?: (item: GenerationCard) => void | Promise<void>;
}

function getFirstMedia(
  outputs: (string | Record<string, unknown>)[] | undefined,
  model?: string,
) {
  for (const output of outputs || []) {
    const url = extractOutputUrl(output);
    if (!url) continue;
    if (isImageUrl(url)) return { url, type: "image" as const };
    if (isVideoUrl(url)) return { url, type: "video" as const };
    if (is3DUrl(url)) return { url, type: "3d" as const };
    if (
      isAudioUrl(url) ||
      outputLooksLikeAudio(output) ||
      modelLooksLikeAudio(model)
    ) {
      return { url, type: "audio" as const };
    }
  }
  return null;
}

function outputLooksLikeAudio(output: string | Record<string, unknown>) {
  if (typeof output === "string") return isAudioUrl(output);
  const keys = Object.keys(output).map((key) => key.toLowerCase());
  if (keys.some((key) => key.includes("audio") || key.includes("sound"))) {
    return true;
  }
  const contentType = String(
    output.content_type ?? output.contentType ?? output.mime_type ?? "",
  ).toLowerCase();
  return contentType.startsWith("audio/");
}

function modelLooksLikeAudio(model: string | undefined) {
  if (!model) return false;
  return /audio|music|speech|voice|tts|sound/i.test(model);
}

function formatDate(value: number) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
  });
}

function getFileNameFromUrl(url: string, model?: string) {
  try {
    const { pathname } = new URL(url);
    const name = decodeURIComponent(pathname.split("/").pop() || "");
    if (name) return name;
  } catch {
    // Fall through to a generated name for non-standard URLs.
  }
  const suffix = model ? model.split("/").pop() : "generation";
  return `${suffix || "generation"}.png`;
}

function toLocalCard(item: GenerationHistoryItem): GenerationCard {
  const model = item.modelId || item.prediction.model;
  const media = getFirstMedia(item.outputs, model);
  return {
    id: item.id,
    model,
    status: item.status || item.prediction.status,
    createdAt: item.addedAt,
    outputs: item.outputs,
    thumbnailUrl: item.thumbnailUrl || media?.url || null,
    thumbnailType: item.thumbnailType || media?.type || null,
    error: item.error || item.prediction.error || null,
    source: "local",
    predictionId: item.prediction.id || null,
  };
}

function toRemoteCard(item: HistoryItem): GenerationCard {
  const media = getFirstMedia(item.outputs, item.model);
  const createdAt = new Date(item.created_at).getTime();
  return {
    id: item.id,
    model: item.model,
    status: item.status,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    outputs: item.outputs || [],
    thumbnailUrl: media?.url || null,
    thumbnailType: media?.type || null,
    source: "remote",
    predictionId: item.id,
  };
}

function isRunningStatus(status: string | undefined | null) {
  return (
    status === "created" ||
    status === "pending" ||
    status === "processing" ||
    status === "queued" ||
    status === "running" ||
    status === "starting"
  );
}

function isOutputlessPlaceholder(item: GenerationCard) {
  return !item.thumbnailUrl && item.outputs.length === 0;
}

function GenerationCardView({
  item,
  onPreview,
  onOpenInCanvas,
  onDelete,
  isDeleting,
}: {
  item: GenerationCard;
  onPreview: (preview: GenerationPreview) => void;
  onOpenInCanvas: (item: GenerationCard, url: string) => void;
  onDelete?: (item: GenerationCard) => void | Promise<void>;
  isDeleting?: boolean;
}) {
  const isRunning = isRunningStatus(item.status);
  const isFailed = item.status === "failed";
  const firstUrl = item.thumbnailUrl || extractOutputUrl(item.outputs[0]);
  const canPreview =
    !!item.thumbnailUrl &&
    (item.thumbnailType === "image" ||
      item.thumbnailType === "video" ||
      item.thumbnailType === "3d") &&
    !isRunning &&
    !isFailed;

  const handlePreview = () => {
    if (!canPreview || !item.thumbnailUrl || !item.thumbnailType) return;
    onPreview({
      url: item.thumbnailUrl,
      type: item.thumbnailType,
      model: item.model,
      createdAt: item.createdAt,
    });
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#1e1e1e] transition-colors hover:border-white/15">
      <div
        className={cn(
          "relative flex min-h-[220px] flex-1 flex-col items-center justify-center bg-[#151515]",
          canPreview && "cursor-zoom-in",
        )}
        onClick={handlePreview}
        role={canPreview ? "button" : undefined}
        tabIndex={canPreview ? 0 : undefined}
        onKeyDown={(event) => {
          if (!canPreview) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handlePreview();
          }
        }}
      >
        {isRunning ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/20">
              <Loader2 className="h-6 w-6 animate-spin" />
            </span>
            <p className="text-sm font-semibold text-white">生成中...</p>
          </div>
        ) : isFailed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm font-semibold text-white">生成失败</p>
            {item.error && (
              <p className="line-clamp-2 text-xs text-[#9ca3af]">
                {item.error}
              </p>
            )}
          </div>
        ) : item.thumbnailUrl && item.thumbnailType === "image" ? (
          <div className="relative flex max-h-[calc(100vh-200px)] w-full items-center justify-center">
            <img
              src={item.thumbnailUrl}
              alt={item.model}
              className="relative z-10 mx-auto h-auto max-h-[calc(100vh-200px)] w-auto max-w-full rounded-sm object-contain"
              loading="lazy"
            />
          </div>
        ) : item.thumbnailUrl && item.thumbnailType === "video" ? (
          <div className="relative flex max-h-[calc(100vh-200px)] w-full items-center justify-center">
            <video
              src={item.thumbnailUrl}
              className="mx-auto h-auto max-h-[calc(100vh-200px)] w-auto max-w-full object-contain"
              controls
              loop
              onClick={(event) => {
                event.preventDefault();
                handlePreview();
              }}
              preload="metadata"
              playsInline
            />
          </div>
        ) : item.thumbnailUrl && item.thumbnailType === "audio" ? (
          <div className="flex w-full items-center justify-center px-5">
            <div
              className="w-full max-w-2xl rounded-full border border-white/[0.08] bg-[#252a32] px-4 py-3"
              onClick={(event) => event.stopPropagation()}
            >
              <AudioPlayer
                src={item.thumbnailUrl}
                compact
                className="text-white"
              />
            </div>
          </div>
        ) : item.thumbnailUrl && item.thumbnailType === "3d" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_20%,#2c2c30_0%,#171717_48%,#0b0b0b_100%)] px-6 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white shadow-lg">
              <Box className="h-7 w-7" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">
                点击查看 3D 模型
              </p>
              <p className="mt-1 text-xs text-[#8f96a3]">可旋转、缩放预览</p>
            </div>
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-xs font-medium text-white/80">
              <Maximize2 className="h-3 w-3" />
              预览
            </span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <FileText className="h-10 w-10 text-[#7b8190]" />
          </div>
        )}

        {(isRunning || isFailed) && (
          <span
            className={cn(
              "absolute right-3 top-3 z-20 rounded-full px-2.5 py-1 text-xs font-semibold",
              isRunning ? "bg-blue-500 text-white" : "bg-red-500 text-white",
            )}
          >
            {isRunning ? "生成中" : "失败"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-white/[0.06] px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {item.model}
          </p>
          <p className="mt-0.5 truncate text-xs text-[#9ca3af]">
            {formatDate(item.createdAt)} ·{" "}
            {item.source === "local" ? "当前会话" : "历史记录"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-80 transition-opacity group-hover:opacity-100">
          {firstUrl && !isRunning && !isFailed && (
            <>
              <a
                href={firstUrl}
                download
                onClick={(event) => event.stopPropagation()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#9ca3af] hover:bg-white/8 hover:text-white"
                title="下载"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
              {item.thumbnailType !== "audio" &&
                item.thumbnailType !== "3d" && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenInCanvas(item, firstUrl);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#9ca3af] hover:bg-white/8 hover:text-white"
                    title="导入画布"
                  >
                    <ImportIcon className="h-3.5 w-3.5" />
                  </button>
                )}
            </>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onDelete(item);
              }}
              disabled={isDeleting}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#9ca3af] hover:bg-red-500/15 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
              title="删除"
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function MyGenerationsPanel({
  localHistory,
  remoteHistory,
  isLoading,
  preferRemoteHistory = false,
  onRefresh,
  onShowExamples,
  onDelete,
}: MyGenerationsPanelProps) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const remoteIds = new Set(remoteHistory.map((item) => item.id));
  const localCards = localHistory.map(toLocalCard).filter((item) => {
    if (isRunningStatus(item.status)) {
      return !(
        preferRemoteHistory &&
        item.predictionId &&
        remoteIds.has(item.predictionId)
      );
    }
    if (preferRemoteHistory) return false;
    return !(item.predictionId && remoteIds.has(item.predictionId));
  });
  const localIds = new Set(localCards.map((item) => item.id));
  const localPredictionIds = new Set(
    localCards
      .map((item) => item.predictionId)
      .filter((id): id is string => Boolean(id)),
  );
  const localRunningModels = new Set(
    localCards
      .filter((item) => isRunningStatus(item.status))
      .map((item) => item.model),
  );
  const remoteCards = remoteHistory.map(toRemoteCard).filter((item) => {
    if (localIds.has(item.id)) return false;
    if (!preferRemoteHistory && localPredictionIds.has(item.id)) return false;
    if (!localRunningModels.has(item.model)) return true;
    return !isRunningStatus(item.status) && !isOutputlessPlaceholder(item);
  });
  const cards = [...localCards, ...remoteCards].sort((a, b) => {
    const runningDiff =
      Number(isRunningStatus(b.status)) - Number(isRunningStatus(a.status));
    if (runningDiff !== 0) return runningDiff;
    return b.createdAt - a.createdAt;
  });

  const handleDelete = async (item: GenerationCard) => {
    if (!onDelete || deletingId) return;
    const key = `${item.source}-${item.id}`;
    setDeletingId(key);
    try {
      await onDelete(item);
      if (
        preview?.url &&
        item.outputs.some((output) => extractOutputUrl(output) === preview.url)
      ) {
        setPreview(null);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenInCanvas = (item: GenerationCard, url: string) => {
    const mediaType =
      item.thumbnailType === "audio"
        ? "audio"
        : item.thumbnailType === "video" || isVideoUrl(url)
          ? "video"
          : "image";
    queueCanvasImport({
      url,
      mediaType,
      fileName: getFileNameFromUrl(url, item.model),
      label: item.model,
      source: "generation",
    });
    setPreview(null);
    navigate("/workflow");
  };

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.08] px-6">
          <div className="flex items-center gap-5">
            <button
              type="button"
              className="relative text-sm font-semibold text-white"
            >
              我的生成
              <span className="absolute -bottom-[15px] left-0 h-0.5 w-full rounded-full bg-white" />
            </button>
            <button
              type="button"
              onClick={onShowExamples}
              className="text-sm font-semibold text-[#8f96a3] transition-colors hover:text-white"
            >
              示例
            </button>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-white/8 hover:text-white disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {cards.length === 0 ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-[#1a1a1a] text-center">
              {isLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-[#9ca3af]" />
              ) : (
                <>
                  <FileText className="h-10 w-10 text-[#7b8190]" />
                  <p className="mt-3 text-sm font-semibold text-white">
                    暂无生成记录
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {cards.map((item) => (
                <GenerationCardView
                  key={`${item.source}-${item.id}`}
                  item={item}
                  onPreview={setPreview}
                  onOpenInCanvas={handleOpenInCanvas}
                  onDelete={onDelete ? handleDelete : undefined}
                  isDeleting={deletingId === `${item.source}-${item.id}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent
          hideCloseButton
          className="flex h-[92vh] w-[94vw] max-w-none flex-col overflow-hidden border-white/[0.08] bg-[#0f0f0f] p-0 shadow-2xl"
        >
          <DialogTitle className="sr-only">查看生成结果</DialogTitle>
          <DialogDescription className="sr-only">
            {preview?.model ?? ""}
          </DialogDescription>

          {preview && (
            <>
              <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-4">
                {preview.type === "image" ? (
                  <img
                    src={preview.url}
                    alt={preview.model}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : preview.type === "video" ? (
                  <video
                    src={preview.url}
                    className="max-h-full max-w-full object-contain"
                    controls
                    autoPlay
                    loop
                    playsInline
                  />
                ) : (
                  <Model3DViewer
                    src={preview.url}
                    rounded={false}
                    className="h-full w-full"
                  />
                )}
              </div>

              <div className="flex shrink-0 items-center gap-3 border-t border-white/[0.08] bg-[#151515] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {preview.model}
                  </p>
                  <p className="mt-0.5 text-xs text-[#9ca3af]">
                    {formatDate(preview.createdAt)}
                  </p>
                </div>
                <a
                  href={preview.url}
                  download
                  className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-[#d1d5db] hover:bg-white/8 hover:text-white"
                >
                  <Download className="h-4 w-4" />
                  下载
                </a>
                {preview.type !== "3d" && (
                  <button
                    type="button"
                    onClick={() =>
                      handleOpenInCanvas(
                        {
                          id: preview.url,
                          model: preview.model,
                          status: "completed",
                          createdAt: preview.createdAt,
                          outputs: [preview.url],
                          thumbnailUrl: preview.url,
                          thumbnailType: preview.type,
                          source: "local",
                        },
                        preview.url,
                      )
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-[#d1d5db] hover:bg-white/8 hover:text-white"
                  >
                    <ImportIcon className="h-4 w-4" />
                    打开
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-[#d1d5db] hover:bg-white/8 hover:text-white"
                >
                  关闭
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
