import type { GenerationHistoryItem, HistoryItem } from "@/types/prediction";
import { useState } from "react";
import { isImageUrl, isVideoUrl } from "@/lib/mediaUtils";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";

type GenerationCard = {
  id: string;
  model: string;
  status: string;
  createdAt: number;
  outputs: (string | Record<string, unknown>)[];
  thumbnailUrl: string | null;
  thumbnailType: "image" | "video" | null;
  error?: string | null;
  source: "local" | "remote";
};

type GenerationPreview = {
  url: string;
  type: "image" | "video";
  model: string;
  createdAt: number;
};

interface MyGenerationsPanelProps {
  localHistory: GenerationHistoryItem[];
  remoteHistory: HistoryItem[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onShowExamples?: () => void;
}

function extractUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const value =
    record.url ||
    record.download_url ||
    record.file_url ||
    record.image_url ||
    record.video_url;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getFirstMedia(
  outputs: (string | Record<string, unknown>)[] | undefined,
) {
  for (const output of outputs || []) {
    const url = extractUrl(output);
    if (!url) continue;
    if (isImageUrl(url)) return { url, type: "image" as const };
    if (isVideoUrl(url)) return { url, type: "video" as const };
  }
  return null;
}

function formatDate(value: number) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
  });
}

function toLocalCard(item: GenerationHistoryItem): GenerationCard {
  const media = getFirstMedia(item.outputs);
  return {
    id: item.id,
    model: item.modelId || item.prediction.model,
    status: item.status || item.prediction.status,
    createdAt: item.addedAt,
    outputs: item.outputs,
    thumbnailUrl: item.thumbnailUrl || media?.url || null,
    thumbnailType: item.thumbnailType || media?.type || null,
    error: item.error || item.prediction.error || null,
    source: "local",
  };
}

function toRemoteCard(item: HistoryItem): GenerationCard {
  const media = getFirstMedia(item.outputs);
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
  };
}

function GenerationCardView({
  item,
  onPreview,
}: {
  item: GenerationCard;
  onPreview: (preview: GenerationPreview) => void;
}) {
  const isRunning =
    item.status === "created" ||
    item.status === "pending" ||
    item.status === "processing";
  const isFailed = item.status === "failed";
  const firstUrl = item.thumbnailUrl || extractUrl(item.outputs[0]);
  const canPreview =
    !!item.thumbnailUrl &&
    (item.thumbnailType === "image" || item.thumbnailType === "video") &&
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
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <FileText className="h-10 w-10 text-[#7b8190]" />
          </div>
        )}

        <span
          className={cn(
            "absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold",
            isRunning
              ? "bg-blue-500 text-white"
              : isFailed
                ? "bg-red-500 text-white"
                : "bg-emerald-500 text-white",
          )}
        >
          {isRunning ? "生成中" : isFailed ? "失败" : "已完成"}
        </span>
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
        {firstUrl && !isRunning && !isFailed && (
          <div className="flex shrink-0 items-center gap-1 opacity-80 transition-opacity group-hover:opacity-100">
            <a
              href={firstUrl}
              download
              onClick={(event) => event.stopPropagation()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#9ca3af] hover:bg-white/8 hover:text-white"
              title="下载"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                window.open(firstUrl, "_blank", "noopener,noreferrer");
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#9ca3af] hover:bg-white/8 hover:text-white"
              title="打开"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function MyGenerationsPanel({
  localHistory,
  remoteHistory,
  isLoading,
  onRefresh,
  onShowExamples,
}: MyGenerationsPanelProps) {
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const localCards = localHistory.map(toLocalCard);
  const localIds = new Set(localCards.map((item) => item.id));
  const remoteCards = remoteHistory
    .map(toRemoteCard)
    .filter((item) => !localIds.has(item.id));
  const cards = [...localCards, ...remoteCards].sort(
    (a, b) => b.createdAt - a.createdAt,
  );

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
                ) : (
                  <video
                    src={preview.url}
                    className="max-h-full max-w-full object-contain"
                    controls
                    autoPlay
                    loop
                    playsInline
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
                <button
                  type="button"
                  onClick={() =>
                    window.open(preview.url, "_blank", "noopener,noreferrer")
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-[#d1d5db] hover:bg-white/8 hover:text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                  打开
                </button>
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
