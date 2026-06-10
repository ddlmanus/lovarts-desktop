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

type OutputFormat = "jpeg" | "png" | "webp";
type ImageField = "target" | "reference";

const FACE_SWAP_MODEL_ID = "wavespeed-ai/image-face-swap";

function formatPrice(value?: number) {
  if (typeof value !== "number") return null;
  return value < 0.01 ? value.toFixed(4) : value.toFixed(3);
}

function extractOutputUrl(
  output: string | Record<string, unknown> | undefined,
) {
  if (!output) return null;
  if (typeof output === "string") return output;
  for (const key of [
    "url",
    "download_url",
    "image",
    "image_url",
    "output",
    "file_url",
  ]) {
    const value = output[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

const savedFaceSwapPredictionIds = new Set<string>();

function autoSaveFaceSwapOutputs(
  outputs: (string | Record<string, unknown>)[],
  predictionId: string | undefined,
) {
  if (!predictionId || savedFaceSwapPredictionIds.has(predictionId)) return;

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
  savedFaceSwapPredictionIds.add(predictionId);

  void (async () => {
    for (const item of saveable) {
      try {
        const type = detectAssetType(item.url);
        if (!type) continue;
        await saveAsset(item.url, type, {
          modelId: FACE_SWAP_MODEL_ID,
          predictionId,
          originalUrl: item.url,
          resultIndex: item.index,
          source: "free-tool",
        });
      } catch (err) {
        console.error("[face-swapper] auto-save asset failed:", err);
      }
    }
  })();
}

export function FaceSwapperPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { resetPage } = useContext(PageResetContext);

  const targetInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const targetDragCounterRef = useRef(0);
  const referenceDragCounterRef = useRef(0);

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

  const [targetUrl, setTargetUrl] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [targetPreview, setTargetPreview] = useState<string | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<
    Record<ImageField, number>
  >({ target: 0, reference: 0 });
  const [targetIndex, setTargetIndex] = useState(0);
  const [format, setFormat] = useState<OutputFormat>("jpeg");
  const [remoteHistory, setRemoteHistory] = useState<HistoryItem[]>([]);
  const [isRemoteHistoryLoading, setIsRemoteHistoryLoading] = useState(false);
  const [draggingField, setDraggingField] = useState<ImageField | null>(null);
  const [uploadingField, setUploadingField] = useState<ImageField | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
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
      if (targetPreview?.startsWith("blob:"))
        URL.revokeObjectURL(targetPreview);
      if (referencePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(referencePreview);
      }
    };
  }, [referencePreview, targetPreview]);

  const faceSwapModel = useMemo(
    () => models.find((model) => model.model_id === FACE_SWAP_MODEL_ID),
    [models],
  );
  const price = useMemo(() => {
    if (typeof faceSwapModel?.base_price !== "number") return null;
    return applyDiscount(
      faceSwapModel.base_price,
      getModelDiscountRate(faceSwapModel),
    );
  }, [faceSwapModel]);
  const displayPrice = formatPrice(price?.discountedPrice);
  const imageHistoryTab = useMemo(() => {
    const imageTabs = tabs.filter((tab) => tab.workspace === "image");
    return (
      imageTabs.find((tab) => tab.id === activeTabId) ?? imageTabs[0] ?? null
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
          if (model) return !/video|audio|3d|avatar/i.test(model.type || "");
          const id = item.model.toLowerCase();
          return (
            id.includes("image") ||
            id.includes("edit") ||
            id.includes("face-swap") ||
            id.includes("swap")
          );
        }),
      );
    } catch (err) {
      console.warn("[face-swapper] failed to load generation history", err);
    } finally {
      setIsRemoteHistoryLoading(false);
    }
  }, [isValidated, models]);

  useEffect(() => {
    if (!isValidated) return;
    void fetchMyGenerations();
  }, [fetchMyGenerations, isValidated]);

  const isBusy = isGenerating || uploadingField !== null;

  const handleBack = useCallback(() => {
    if (isBusy) return;
    resetPage(location.pathname);
    navigate("/free-tools");
  }, [isBusy, location.pathname, navigate, resetPage]);

  const clearInput = useCallback(() => {
    if (targetPreview?.startsWith("blob:")) URL.revokeObjectURL(targetPreview);
    if (referencePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(referencePreview);
    }
    setTargetPreview(null);
    setReferencePreview(null);
    setTargetUrl("");
    setReferenceUrl("");
    setUploadProgress({ target: 0, reference: 0 });
    setError(null);
  }, [referencePreview, targetPreview]);

  const uploadFile = useCallback(
    async (field: ImageField, file: File) => {
      if (!file.type.startsWith("image/")) {
        setError(t("freeTools.faceSwapper.invalidFile"));
        return;
      }

      const previewSetter =
        field === "target" ? setTargetPreview : setReferencePreview;
      const urlSetter = field === "target" ? setTargetUrl : setReferenceUrl;
      const currentPreview =
        field === "target" ? targetPreview : referencePreview;
      if (currentPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(currentPreview);
      }

      previewSetter(URL.createObjectURL(file));
      setError(null);
      setUploadProgress((prev) => ({ ...prev, [field]: 0 }));
      setUploadingField(field);

      try {
        const uploadedUrl = await apiClient.uploadFile(
          file,
          undefined,
          (progress) =>
            setUploadProgress((prev) => ({ ...prev, [field]: progress })),
        );
        urlSetter(uploadedUrl);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("freeTools.faceSwapper.uploadFailed"),
        );
      } finally {
        setUploadingField(null);
      }
    },
    [referencePreview, t, targetPreview],
  );

  const handleDrop = useCallback(
    (field: ImageField, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (field === "target") targetDragCounterRef.current = 0;
      else referenceDragCounterRef.current = 0;
      setDraggingField(null);
      const file = event.dataTransfer.files?.[0];
      if (file) void uploadFile(field, file);
    },
    [uploadFile],
  );

  const handleGenerate = useCallback(async () => {
    const target = targetUrl.trim();
    const reference = referenceUrl.trim();
    if (!target || !reference) {
      setError(t("freeTools.faceSwapper.imagesRequired"));
      return;
    }
    if (!apiKey || !isValidated) {
      setError(t("freeTools.faceSwapper.apiKeyRequired"));
      return;
    }

    setError(null);
    setIsGenerating(true);
    let pendingId: string | null = null;

    try {
      const input = {
        image: target,
        face_image: reference,
        target_index: Math.max(0, Math.round(targetIndex)),
        output_format: format,
      };
      const formValues = {
        ...input,
        _tool: "image-face-swap",
      };

      pendingId = `face-swap-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      startExternalGeneration({
        id: pendingId,
        workspace: "image",
        modelId: FACE_SWAP_MODEL_ID,
        formValues,
      });

      const prediction = await apiClient.run(FACE_SWAP_MODEL_ID, input, {
        pollInterval: 1200,
        timeout: 20 * 60 * 1000,
      });
      const outputs = prediction.outputs ?? [];
      completeExternalGeneration({
        pendingId,
        modelId: FACE_SWAP_MODEL_ID,
        prediction,
        outputs,
        formValues,
      });
      autoSaveFaceSwapOutputs(outputs, prediction.id);
      void fetchMyGenerations();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("freeTools.faceSwapper.generateFailed");
      setError(message);
      if (pendingId) failExternalGeneration({ pendingId, error: message });
    } finally {
      setIsGenerating(false);
    }
  }, [
    apiKey,
    completeExternalGeneration,
    failExternalGeneration,
    fetchMyGenerations,
    format,
    isValidated,
    referenceUrl,
    startExternalGeneration,
    t,
    targetIndex,
    targetUrl,
  ]);

  const renderImageInput = (field: ImageField) => {
    const isTarget = field === "target";
    const value = isTarget ? targetUrl : referenceUrl;
    const preview = isTarget ? targetPreview : referencePreview;
    const setValue = isTarget ? setTargetUrl : setReferenceUrl;
    const setPreview = isTarget ? setTargetPreview : setReferencePreview;
    const inputRef = isTarget ? targetInputRef : referenceInputRef;
    const dragCounterRef = isTarget
      ? targetDragCounterRef
      : referenceDragCounterRef;
    const label = isTarget
      ? t("freeTools.faceSwapper.targetImage")
      : t("freeTools.faceSwapper.referenceFace");

    return (
      <div className="space-y-2">
        <span className="text-xs font-medium text-white/78">
          {label} <span className="text-red-400">*</span>
        </span>
        <div
          className={cn(
            "relative rounded-sm border border-dashed border-white/[0.12] bg-[#151515] p-2 transition-colors",
            draggingField === field && "border-primary/70 bg-primary/5",
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            dragCounterRef.current += 1;
            setDraggingField(field);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragCounterRef.current -= 1;
            if (dragCounterRef.current <= 0) setDraggingField(null);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDrop={(event) => handleDrop(field, event)}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadFile(field, file);
            }}
          />
          <div className="relative flex items-center gap-2">
            <Input
              value={value}
              disabled={isBusy}
              onChange={(event) => {
                setValue(event.target.value);
                if (!event.target.value.trim()) setPreview(null);
              }}
              placeholder="https://example.com/image.png"
              className="h-9 rounded-sm border-white/[0.08] bg-[#101010] pr-[42px] text-xs text-white placeholder:text-white/35"
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => inputRef.current?.click()}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
              title={t("freeTools.faceSwapper.uploadFromDevice")}
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          </div>

          {preview ? (
            <div className="group relative mt-2 overflow-hidden rounded-md border border-white/[0.08] bg-black">
              <img
                src={preview}
                alt={label}
                className="max-h-40 w-full object-contain"
              />
              <button
                type="button"
                onClick={() => {
                  if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
                  setPreview(null);
                  setValue("");
                }}
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
              onClick={() => inputRef.current?.click()}
              className="mt-1.5 block w-full truncate pl-1 text-left text-xs text-white/45 transition-colors hover:text-white/70 disabled:opacity-40"
            >
              {t("freeTools.faceSwapper.dropHint")}
            </button>
          )}

          {uploadingField === field && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-[#d4ff00]"
                style={{ width: `${uploadProgress[field]}%` }}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

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
            {t("freeTools.faceSwapper.title")}
          </h2>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          {renderImageInput("target")}
          {renderImageInput("reference")}

          <div className="space-y-3">
            <span className="text-xs font-medium text-white/78">
              {t("freeTools.faceSwapper.settings")}
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#d1d5db]">
                  {t("freeTools.faceSwapper.targetFaceIndex")}
                </label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={targetIndex}
                  disabled={isBusy}
                  onChange={(event) =>
                    setTargetIndex(Number(event.target.value) || 0)
                  }
                  className="h-8 rounded-md border-white/[0.06] bg-[#141414] text-xs text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#d1d5db]">
                  {t("freeTools.faceSwapper.format")}
                </label>
                <Select
                  value={format}
                  disabled={isBusy}
                  onValueChange={(value) => setFormat(value as OutputFormat)}
                >
                  <SelectTrigger className="h-8 rounded-md border-white/[0.06] bg-[#141414] text-xs text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jpeg">JPEG</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="webp">WebP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-white/[0.06] bg-[#1e1e1e] p-4">
          <div className="flex overflow-hidden rounded-lg shadow-sm">
            <button
              type="button"
              onClick={clearInput}
              disabled={isBusy || (!targetUrl && !referenceUrl)}
              className="flex h-10 w-10 shrink-0 items-center justify-center border-r border-black/15 bg-[#d4ff00] text-black transition-colors hover:bg-[#c4e600] disabled:cursor-not-allowed disabled:opacity-50"
              title={t("common.clear", "Clear")}
            >
              <Eraser className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isBusy || !targetUrl.trim() || !referenceUrl.trim()}
              className="flex h-10 flex-1 items-center justify-center gap-2 bg-[#d4ff00] px-4 text-sm font-semibold text-black transition-colors hover:bg-[#c4e600] disabled:cursor-not-allowed disabled:bg-[#d4ff00]/50"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>{t("freeTools.faceSwapper.generate")}</span>
              {displayPrice && (
                <span className="font-bold">${displayPrice}</span>
              )}
            </button>
            <button
              type="button"
              disabled
              className="flex h-10 w-11 items-center justify-center bg-[#c4e600] text-black opacity-90"
              title={t("freeTools.faceSwapper.moreOptions")}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#9ca3af]">
              {t("freeTools.faceSwapper.credits")}
            </span>
            <span className="font-medium text-white/80">
              {displayPrice ? `$${displayPrice}` : "-"}
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
          localHistory={imageHistoryTab?.generationHistory ?? []}
          remoteHistory={remoteHistory}
          isLoading={isRemoteHistoryLoading}
          onRefresh={fetchMyGenerations}
        />
      </main>
    </div>
  );
}
