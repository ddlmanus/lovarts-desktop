import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageResetContext } from "@/components/layout/PageResetContext";
import { MyGenerationsPanel } from "@/components/playground/MyGenerationsPanel";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/api/client";
import { useApiKeyStore } from "@/stores/apiKeyStore";
import { useModelsStore } from "@/stores/modelsStore";
import { usePlaygroundStore } from "@/stores/playgroundStore";
import { detectAssetType, useAssetsStore } from "@/stores/assetsStore";
import { applyDiscount, getModelDiscountRate } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { HistoryItem } from "@/types/prediction";
import {
  ArrowLeft,
  ChevronDown,
  Eraser,
  FolderOpen,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";

type TargetResolution = "720p" | "1080p" | "2k" | "4k";

const FLASHVSR_MODEL_ID = "wavespeed-ai/flashvsr";

function extractOutputUrl(
  output: string | Record<string, unknown> | undefined,
) {
  if (!output) return null;
  if (typeof output === "string") return output;
  for (const key of [
    "url",
    "download_url",
    "video",
    "video_url",
    "output",
    "file_url",
  ]) {
    const value = output[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function formatPrice(value?: number) {
  if (typeof value !== "number") return null;
  return value < 0.01 ? value.toFixed(4) : value.toFixed(3);
}

function formatBalance(value: number | null) {
  if (typeof value !== "number") return null;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

const savedFlashVsrPredictionIds = new Set<string>();

function autoSaveFlashVsrOutputs(
  outputs: (string | Record<string, unknown>)[],
  predictionId: string | undefined,
) {
  if (!predictionId || savedFlashVsrPredictionIds.has(predictionId)) return;

  const { settings, saveAsset, hasAssetForPrediction } =
    useAssetsStore.getState();
  if (!settings.autoSaveAssets || hasAssetForPrediction(predictionId)) return;

  const saveable = outputs
    .map((output, index) => ({
      index,
      url: typeof output === "string" ? output : extractOutputUrl(output),
    }))
    .filter((item): item is { index: number; url: string } => {
      if (!item.url || item.url.startsWith("local-asset://")) return false;
      return !!detectAssetType(item.url);
    });

  if (!saveable.length) return;
  savedFlashVsrPredictionIds.add(predictionId);

  void (async () => {
    for (const item of saveable) {
      try {
        const type = detectAssetType(item.url);
        if (!type) continue;
        await saveAsset(item.url, type, {
          modelId: FLASHVSR_MODEL_ID,
          predictionId,
          originalUrl: item.url,
          resultIndex: item.index,
          source: "free-tool",
        });
      } catch (err) {
        console.error("[flashvsr] auto-save asset failed:", err);
      }
    }
  })();
}

export function VideoEnhancerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { resetPage } = useContext(PageResetContext);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const { apiKey, isValidated } = useApiKeyStore();
  const { models, fetchModels } = useModelsStore();
  const {
    tabs,
    activeTabId,
    startExternalGeneration,
    completeExternalGeneration,
    failExternalGeneration,
  } = usePlaygroundStore(
    ({
      tabs,
      activeTabId,
      startExternalGeneration,
      completeExternalGeneration,
      failExternalGeneration,
    }) => ({
      tabs,
      activeTabId,
      startExternalGeneration,
      completeExternalGeneration,
      failExternalGeneration,
    }),
  );

  const [videoUrl, setVideoUrl] = useState("");
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [targetResolution, setTargetResolution] =
    useState<TargetResolution>("1080p");
  const [remoteHistory, setRemoteHistory] = useState<HistoryItem[]>([]);
  const [isRemoteHistoryLoading, setIsRemoteHistoryLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    const { isLoaded, loadAssets, loadSettings } = useAssetsStore.getState();
    void loadSettings();
    if (!isLoaded) void loadAssets();
  }, []);

  useEffect(() => {
    return () => {
      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const flashVsrModel = useMemo(
    () => models.find((model) => model.model_id === FLASHVSR_MODEL_ID),
    [models],
  );
  const price = useMemo(() => {
    if (typeof flashVsrModel?.base_price !== "number") return null;
    return applyDiscount(
      flashVsrModel.base_price,
      getModelDiscountRate(flashVsrModel),
    );
  }, [flashVsrModel]);
  const displayPrice = formatPrice(price?.discountedPrice);

  const videoHistoryTab = useMemo(() => {
    const videoTabs = tabs.filter((tab) => tab.workspace === "video");
    return (
      videoTabs.find((tab) => tab.id === activeTabId) ?? videoTabs[0] ?? null
    );
  }, [activeTabId, tabs]);

  const fetchMyGenerations = useCallback(async () => {
    if (!isValidated) return;
    setIsRemoteHistoryLoading(true);
    try {
      const response = await apiClient.getHistory(1, 100);
      setRemoteHistory(
        (response.items || []).filter((item) => {
          const model = models.find((m) => m.model_id === item.model);
          if (model) return /video/i.test(model.type || model.model_id || "");
          const id = item.model.toLowerCase();
          return (
            id.includes("video") ||
            id.includes("flashvsr") ||
            id.includes("upscaler") ||
            id.includes("enhance")
          );
        }),
      );
    } catch (err) {
      console.warn("[flashvsr] failed to load generation history", err);
    } finally {
      setIsRemoteHistoryLoading(false);
    }
  }, [isValidated, models]);

  useEffect(() => {
    if (!isValidated) return;
    void fetchMyGenerations();
  }, [fetchMyGenerations, isValidated]);

  const isBusy = isUploading || isGenerating;
  const displayBalance = formatBalance(balance);

  const fetchBalance = useCallback(async () => {
    if (!apiKey || !isValidated) {
      setBalance(null);
      return;
    }

    setIsBalanceLoading(true);
    try {
      const currentBalance = await apiClient.getBalance();
      setBalance(currentBalance);
    } catch (err) {
      console.warn("[flashvsr] failed to load account balance", err);
      setBalance(null);
    } finally {
      setIsBalanceLoading(false);
    }
  }, [apiKey, isValidated]);

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  const handleBack = useCallback(() => {
    if (isBusy) return;
    resetPage(location.pathname);
    navigate("/free-tools");
  }, [isBusy, location.pathname, navigate, resetPage]);

  const clearInput = useCallback(() => {
    if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    setVideoUrl("");
    setUploadProgress(0);
    setError(null);
  }, [localPreview]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/")) {
        setError(t("freeTools.videoEnhancer.invalidFile"));
        return;
      }

      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
      setLocalPreview(URL.createObjectURL(file));
      setError(null);
      setUploadProgress(0);
      setIsUploading(true);

      try {
        const uploadedUrl = await apiClient.uploadFile(
          file,
          undefined,
          (progress) => setUploadProgress(progress),
        );
        setVideoUrl(uploadedUrl);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("freeTools.videoEnhancer.uploadFailed"),
        );
      } finally {
        setIsUploading(false);
      }
    },
    [localPreview, t],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void uploadFile(file);
    },
    [uploadFile],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void uploadFile(file);
    },
    [uploadFile],
  );

  const handleGenerate = useCallback(async () => {
    const source = videoUrl.trim();
    if (!source) {
      setError(t("freeTools.videoEnhancer.videoRequired"));
      return;
    }
    if (!apiKey || !isValidated) {
      setError(t("freeTools.videoEnhancer.apiKeyRequired"));
      return;
    }

    setError(null);
    setIsGenerating(true);
    let pendingId: string | null = null;

    try {
      const input = {
        video: source,
        target_resolution: targetResolution,
      };
      const formValuesForHistory = {
        ...input,
        _tool: "flashvsr",
      };

      pendingId = `flashvsr-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      startExternalGeneration({
        id: pendingId,
        workspace: "video",
        modelId: FLASHVSR_MODEL_ID,
        formValues: formValuesForHistory,
      });

      const prediction = await apiClient.run(FLASHVSR_MODEL_ID, input, {
        pollInterval: 2500,
        timeout: 60 * 60 * 1000,
      });
      const outputs = prediction.outputs ?? [];
      completeExternalGeneration({
        pendingId,
        modelId: FLASHVSR_MODEL_ID,
        prediction,
        outputs,
        formValues: formValuesForHistory,
      });
      autoSaveFlashVsrOutputs(outputs, prediction.id);
      void fetchBalance();
      void fetchMyGenerations();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("freeTools.videoEnhancer.generateFailed");
      setError(message);
      if (pendingId) failExternalGeneration({ pendingId, error: message });
    } finally {
      setIsGenerating(false);
    }
  }, [
    apiKey,
    completeExternalGeneration,
    failExternalGeneration,
    fetchBalance,
    fetchMyGenerations,
    isValidated,
    startExternalGeneration,
    t,
    targetResolution,
    videoUrl,
  ]);

  return (
    <div className="flex h-full min-h-0 bg-[#151515] pt-12 md:pt-0">
      <aside className="flex w-full shrink-0 flex-col border-b border-white/[0.06] bg-[#1e1e1e] md:h-full md:w-[320px] md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={isBusy}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-white/70 transition-colors hover:bg-white/[0.15] hover:text-white disabled:opacity-40"
            title={t("common.back", "Back")}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="flex-1 text-right text-base font-semibold text-white">
            {t("freeTools.videoEnhancer.flashTitle")}
          </h2>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          <div className="space-y-2">
            <span className="text-xs font-medium text-white/78">
              {t("freeTools.videoEnhancer.video")}{" "}
              <span className="text-red-400">*</span>
            </span>
            <div
              className={cn(
                "relative rounded-sm border border-dashed border-white/[0.12] bg-[#151515] p-2 transition-colors",
                isDragging && "border-primary/70 bg-primary/5",
              )}
              onDragEnter={(event) => {
                event.preventDefault();
                dragCounterRef.current += 1;
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                dragCounterRef.current -= 1;
                if (dragCounterRef.current <= 0) setIsDragging(false);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="relative flex items-center gap-2">
                <Input
                  value={videoUrl}
                  disabled={isBusy}
                  onChange={(event) => {
                    setVideoUrl(event.target.value);
                    if (!event.target.value.trim()) setLocalPreview(null);
                  }}
                  placeholder="https://example.com/video.mp4"
                  className="h-9 rounded-sm border-white/[0.08] bg-[#101010] pr-[42px] text-xs text-white placeholder:text-white/35"
                />
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                  title={t("freeTools.videoEnhancer.uploadFromDevice")}
                >
                  <FolderOpen className="h-4 w-4" />
                </button>
              </div>

              {localPreview ? (
                <div className="group relative mt-2 overflow-hidden rounded-md border border-white/[0.08] bg-black">
                  <video
                    src={localPreview}
                    className="max-h-40 w-full object-contain"
                    controls
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <button
                    type="button"
                    onClick={clearInput}
                    disabled={isBusy}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white/80 opacity-0 backdrop-blur transition-opacity hover:bg-black/70 hover:text-white group-hover:opacity-100 disabled:opacity-40"
                    title={t("common.clear", "Clear")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1.5 block w-full truncate pl-1 text-left text-xs text-white/45 transition-colors hover:text-white/70 disabled:opacity-40"
                >
                  {t("freeTools.videoEnhancer.dropHint")}
                </button>
              )}

              {isUploading && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-[#d4ff00]"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-xs font-medium text-white/78">
              {t("freeTools.videoEnhancer.settings")}
            </span>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#d1d5db]">
                {t("freeTools.videoEnhancer.targetResolution")}
              </label>
              <Select
                value={targetResolution}
                disabled={isBusy}
                onValueChange={(value) =>
                  setTargetResolution(value as TargetResolution)
                }
              >
                <SelectTrigger className="h-10 rounded-md border-white/[0.06] bg-[#141414] text-xs text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720P</SelectItem>
                  <SelectItem value="1080p">1080P</SelectItem>
                  <SelectItem value="2k">2K</SelectItem>
                  <SelectItem value="4k">4K</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-white/[0.06] bg-[#1e1e1e] p-4">
          <div className="flex overflow-hidden rounded-lg shadow-sm">
            <button
              type="button"
              onClick={clearInput}
              disabled={isBusy || (!videoUrl && !localPreview)}
              className="flex h-10 w-10 shrink-0 items-center justify-center border-r border-black/15 bg-[#d4ff00] text-black transition-colors hover:bg-[#c4e600] disabled:cursor-not-allowed disabled:opacity-50"
              title={t("common.clear", "Clear")}
            >
              <Eraser className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isBusy || !videoUrl.trim()}
              className="flex h-10 flex-1 items-center justify-center gap-2 bg-[#d4ff00] px-4 text-sm font-semibold text-black transition-colors hover:bg-[#c4e600] disabled:cursor-not-allowed disabled:bg-[#d4ff00]/50"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>{t("freeTools.videoEnhancer.generate")}</span>
              {displayPrice && (
                <span className="font-bold">${displayPrice}</span>
              )}
            </button>
            <button
              type="button"
              disabled
              className="flex h-10 w-11 items-center justify-center bg-[#c4e600] text-black opacity-90"
              title={t("freeTools.videoEnhancer.moreOptions")}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#9ca3af]">
              {t("freeTools.videoEnhancer.balance")}
            </span>
            <span className="font-medium text-white/80">
              {isBalanceLoading
                ? t("common.loading", "Loading...")
                : displayBalance
                  ? `$${displayBalance}`
                  : "-"}
            </span>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden bg-[#151515]">
        {error && (
          <div className="absolute left-[340px] right-6 top-16 z-10 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 md:left-[344px]">
            {error}
          </div>
        )}
        <MyGenerationsPanel
          localHistory={videoHistoryTab?.generationHistory ?? []}
          remoteHistory={remoteHistory}
          isLoading={isRemoteHistoryLoading}
          onRefresh={fetchMyGenerations}
        />
      </main>
    </div>
  );
}
