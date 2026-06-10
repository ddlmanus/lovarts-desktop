import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useTransition,
} from "react";
import { flushSync } from "react-dom";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  usePlaygroundStore,
  persistPlaygroundSession,
  hydratePlaygroundSession,
  getModelWorkspace,
  type PlaygroundWorkspace,
} from "@/stores/playgroundStore";
import { useModelsStore } from "@/stores/modelsStore";
import { useApiKeyStore } from "@/stores/apiKeyStore";
import { apiClient } from "@/api/client";
import { useTemplateStore } from "@/stores/templateStore";
import { usePredictionInputsStore } from "@/stores/predictionInputsStore";
import { usePageActive } from "@/hooks/usePageActive";
import { getDefaultValues, normalizePayloadArrays } from "@/lib/schemaToForm";
import {
  applyDiscount,
  getModelDiscountRate,
  type PriceDisplay,
} from "@/lib/pricing";
import { DynamicForm } from "@/components/playground/DynamicForm";
import { ModelSelector } from "@/components/playground/ModelSelector";
import { BatchControls } from "@/components/playground/BatchControls";
// TemplatesPanel removed from top bar (sidebar entry remains)
import { FeaturedModelsPanel } from "@/components/playground/FeaturedModelsPanel";
import { TemplatesPanel } from "@/components/playground/TemplatesPanel";
import { MyGenerationsPanel } from "@/components/playground/MyGenerationsPanel";
import {
  RotateCcw,
  Loader2,
  Plus,
  X,
  Save,
  Sparkles,
  Compass,
  Layers,
  ChevronDown,
  Clock,
  Image as ImageIcon,
  Video,
  User,
  Music2,
  Box,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/useToast";
import {
  TemplateDialog,
  type TemplateFormData,
} from "@/components/templates/TemplateDialog";
import type { HistoryItem } from "@/types/prediction";
import type { Model } from "@/types/model";

type RightPanelTab = "result" | "featured" | "templates";

/** Format raw model name/id for display. e.g. "google/nano-banana-pro/text-to-image" → "Google / Nano Banana Pro" */

const isCapacitorNative = () => {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
};

const DEFAULT_MODEL_IDS: Partial<Record<PlaygroundWorkspace, string[]>> = {
  image: [
    "openai/gpt-image-2/text-to-image",
    "openai/gpt-image-2",
    "openai/gpt-image-2/edit",
  ],
  video: [
    "bytedance/seedance-v2.0/text-to-video",
    "bytedance/seedance-2.0/text-to-video",
    "bytedance/seedance-v2/text-to-video",
    "bytedance/seedance-v2.0/image-to-video",
  ],
};

function getDefaultModelRank(model: Model, workspace: PlaygroundWorkspace) {
  const id = model.model_id.toLowerCase();

  if (workspace === "image") {
    if (id.includes("openai/gpt-image-2/text-to-image")) return 0;
    if (id.includes("openai/gpt-image-2") && id.includes("text-to-image"))
      return 1;
    if (id.includes("openai/gpt-image-2") && !id.includes("/edit")) return 2;
    if (id.includes("openai/gpt-image-2")) return 3;
    if (id.includes("gpt-image-2")) return 4;
  }

  if (workspace === "video") {
    const isSeedance = id.includes("seedance");
    const isV2 =
      id.includes("v2.0") ||
      id.includes("v2-0") ||
      id.includes("2.0") ||
      id.includes("2-0");
    if (isSeedance && isV2 && id.includes("text-to-video")) return 0;
    if (isSeedance && isV2) return 1;
    if (isSeedance && id.includes("text-to-video")) return 2;
    if (isSeedance) return 3;
  }

  return Number.POSITIVE_INFINITY;
}

function getPreferredWorkspaceModel(
  models: Model[],
  workspace: PlaygroundWorkspace,
) {
  const defaultIds = DEFAULT_MODEL_IDS[workspace] ?? [];
  for (const id of defaultIds) {
    const exact = models.find(
      (model) => model.model_id.toLowerCase() === id.toLowerCase(),
    );
    if (exact) return exact;
  }

  const ranked = models
    .map((model) => ({ model, rank: getDefaultModelRank(model, workspace) }))
    .filter((item) => Number.isFinite(item.rank))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (b.model.sort_order ?? 0) - (a.model.sort_order ?? 0),
    );
  return ranked[0]?.model ?? models[0] ?? null;
}

interface PlaygroundPageProps {
  workspace?: PlaygroundWorkspace;
  routeBase?:
    | "/playground"
    | "/image"
    | "/video"
    | "/avatar"
    | "/audio"
    | "/3d";
}

function decodeModelIdFromPath(pathname: string, basePath: string) {
  const prefix = `${basePath}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const raw = pathname.slice(prefix.length);
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function PlaygroundPage({
  workspace = "image",
  routeBase = "/playground",
}: PlaygroundPageProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const isActive = usePageActive(routeBase);
  const modelId = useMemo(() => {
    if (routeBase === "/playground") {
      return (
        decodeModelIdFromPath(location.pathname, "/playground") ??
        decodeModelIdFromPath(location.pathname, "/image")
      );
    }
    return decodeModelIdFromPath(location.pathname, routeBase);
  }, [location.pathname, routeBase]);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { models, fetchModels } = useModelsStore();
  const {
    apiKey,
    isLoading: isLoadingApiKey,
    isValidated,
    loadApiKey,
    hasAttemptedLoad,
  } = useApiKeyStore();
  const {
    tabs,
    activeTabId,
    createTab,
    closeTab,
    setActiveTab,
    getActiveTab,
    setSelectedModel,
    setFormValue,
    setFormValues,
    setFormFields,
    resetForm,
    runPrediction,
    runBatch,
    abortRun,
    clearBatchResults,
    setUploading,
    reorderTab,
    consumePendingFormValues,
    validateForm,
  } = usePlaygroundStore();
  const { templates, loadTemplates, createTemplate, migrateFromLocalStorage } =
    useTemplateStore();
  const {
    save: savePredictionInputs,
    load: loadPredictionInputs,
    isLoaded: inputsLoaded,
  } = usePredictionInputsStore();

  const filteredModels = useMemo(
    () => models.filter((model) => getModelWorkspace(model) === workspace),
    [models, workspace],
  );
  const workspaceTabs = useMemo(
    () => tabs.filter((tab) => tab.workspace === workspace),
    [tabs, workspace],
  );
  const activeTab = useMemo(
    () =>
      workspaceTabs.find((tab) => tab.id === activeTabId) ??
      workspaceTabs[0] ??
      null,
    [workspaceTabs, activeTabId],
  );
  const [remoteGenerationHistory, setRemoteGenerationHistory] = useState<
    HistoryItem[]
  >([]);
  const [isRemoteHistoryLoading, setIsRemoteHistoryLoading] = useState(false);
  const filterHistoryForWorkspace = useCallback(
    (items: HistoryItem[]) => {
      return items.filter((item) => {
        const model = models.find((m) => m.model_id === item.model);
        if (model) return getModelWorkspace(model) === workspace;
        const id = item.model.toLowerCase();
        if (workspace === "video")
          return (
            id.includes("video") ||
            id.includes("to-video") ||
            id.includes("i2v") ||
            id.includes("t2v")
          );
        if (workspace === "avatar")
          return id.includes("avatar") || id.includes("digital-human");
        if (workspace === "audio")
          return (
            id.includes("audio") ||
            id.includes("music") ||
            id.includes("speech")
          );
        if (workspace === "3d") return id.includes("3d") || id.includes("tripo");
        return (
          id.includes("image") ||
          id.includes("text-to-image") ||
          id.includes("edit")
        );
      });
    },
    [models, workspace],
  );

  const fetchMyGenerations = useCallback(async () => {
    if (!isValidated) return;
    setIsRemoteHistoryLoading(true);
    try {
      const response = await apiClient.getHistory(1, 100);
      setRemoteGenerationHistory(
        filterHistoryForWorkspace(response.items || []),
      );
    } catch (error) {
      console.warn("[PlaygroundPage] Failed to load generation history", error);
    } finally {
      setIsRemoteHistoryLoading(false);
    }
  }, [filterHistoryForWorkspace, isValidated]);
  const workspaceTitle =
    workspace === "video"
      ? t("nav.video", "视频生成器")
      : workspace === "avatar"
        ? "数字人生成器"
        : workspace === "audio"
          ? "音频生成器"
          : workspace === "3d"
            ? "3D 生成器"
            : t("nav.image", "图像生成器");
  const WorkspaceIcon =
    workspace === "video"
      ? Video
      : workspace === "avatar"
        ? User
        : workspace === "audio"
          ? Music2
          : workspace === "3d"
            ? Box
            : ImageIcon;

  const templateLoadedRef = useRef<string | null>(null);
  const initialTabCreatedRef = useRef(false);

  useEffect(() => {
    if (activeTabId && activeTab?.id === activeTabId) return;
    if (workspaceTabs.length > 0) {
      setActiveTab(workspaceTabs[0].id);
    }
  }, [workspaceTabs, activeTabId, activeTab, setActiveTab]);

  // Dynamic pricing state
  const [calculatedPrice, setCalculatedPrice] = useState<PriceDisplay | null>(
    null,
  );
  const [calculatedPriceKey, setCalculatedPriceKey] = useState<string | null>(
    null,
  );
  const [isPricingLoading, setIsPricingLoading] = useState(false);
  const pricingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pricingModelRef = useRef<string | null>(null);
  const currentPricingKey = useMemo(
    () =>
      JSON.stringify({
        modelId: activeTab?.selectedModel?.model_id ?? null,
        values: activeTab?.formValues ?? null,
      }),
    [activeTab?.selectedModel?.model_id, activeTab?.formValues],
  );

  // Mobile view state: 'config' or 'output'
  const [mobileView, setMobileView] = useState<"config" | "output">("config");

  // Resizable left panel
  const [leftPanelWidth, setLeftPanelWidth] = useState(360);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const startX = e.clientX;
      const startWidth = leftPanelWidth;
      const onMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const delta = ev.clientX - startX;
        const newWidth = Math.max(220, Math.min(500, startWidth + delta));
        setLeftPanelWidth(newWidth);
      };
      const onUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [leftPanelWidth],
  );

  // Right panel tab state
  const isMobile = isCapacitorNative();
  // Persist rightPanelTab across navigation using sessionStorage
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>(() => {
    const saved = sessionStorage.getItem(
      "pg_rightPanelTab",
    ) as RightPanelTab | null;
    return saved === "featured" || saved === "templates" ? saved : "result";
  });
  const [, startTransition] = useTransition();
  const switchTab = useCallback((tab: RightPanelTab) => {
    startTransition(() => {
      setRightPanelTab(tab);
      sessionStorage.setItem("pg_rightPanelTab", tab);
    });
  }, []);

  // Top search bar state — removed: search is now inline per tab

  // Workspace sessions dropdown state — removed, now using browser-style tabs

  // Tab scroll ref for overflow detection
  const pgTabScrollRef = useRef<HTMLDivElement>(null);

  // Tab list dropdown state
  const [tabListOpen, setTabListOpen] = useState(false);
  const tabListRef = useRef<HTMLDivElement>(null);

  // Tab drag-to-reorder state
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    tabId: string;
    side: "left" | "right";
  } | null>(null);

  // Close tab list dropdown on click outside
  useEffect(() => {
    if (!tabListOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        tabListRef.current &&
        !tabListRef.current.contains(e.target as Node)
      ) {
        setTabListOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [tabListOpen]);

  // Tab drag handlers
  const handleTabDragStart = useCallback(
    (e: React.DragEvent, tabId: string) => {
      setDragTabId(tabId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tabId);
    },
    [],
  );

  const handleTabDragOver = useCallback(
    (e: React.DragEvent, tabId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!dragTabId || tabId === dragTabId) {
        setDropIndicator(null);
        return;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const side = e.clientX - rect.left < rect.width / 2 ? "left" : "right";
      setDropIndicator({ tabId, side });
    },
    [dragTabId],
  );

  const handleTabDrop = useCallback(
    (e: React.DragEvent, targetTabId: string) => {
      e.preventDefault();
      if (!dragTabId || dragTabId === targetTabId) {
        setDragTabId(null);
        setDropIndicator(null);
        return;
      }
      const fromIdx = tabs.findIndex((t) => t.id === dragTabId);
      const toIdx = tabs.findIndex((t) => t.id === targetTabId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const side = dropIndicator?.side ?? "right";
        const insertIdx =
          fromIdx < toIdx
            ? side === "left"
              ? toIdx - 1
              : toIdx
            : side === "left"
              ? toIdx
              : toIdx + 1;
        reorderTab(fromIdx, Math.max(0, insertIdx));
      }
      setDragTabId(null);
      setDropIndicator(null);
    },
    [dragTabId, dropIndicator, tabs, reorderTab],
  );

  const handleTabDragEnd = useCallback(() => {
    setDragTabId(null);
    setDropIndicator(null);
  }, []);

  // Template dialog states
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);

  // Migrate templates and load on mount (runs once since page is persistent)
  useEffect(() => {
    const init = async () => {
      await migrateFromLocalStorage();
      await loadTemplates({ templateType: "playground" });
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate playground session from Electron persistent storage on first mount
  useEffect(() => {
    hydratePlaygroundSession();
  }, []);

  // Persist playground tabs (debounced) so they restore on next visit
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsub = usePlaygroundStore.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(persistPlaygroundSession, 300);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);

  // Load API key and fetch models on mount
  useEffect(() => {
    loadApiKey();
    if (!inputsLoaded) loadPredictionInputs();
  }, [loadApiKey, inputsLoaded, loadPredictionInputs]);

  useEffect(() => {
    if (isValidated) {
      fetchModels();
    }
  }, [isValidated, fetchModels]);

  useEffect(() => {
    if (!isActive || !isValidated) return;
    void fetchMyGenerations();
  }, [fetchMyGenerations, isActive, isValidated]);

  // Save prediction inputs to local storage when prediction completes
  const lastSavedPredictionRef = useRef<string | null>(null);
  useEffect(() => {
    const prediction = activeTab?.currentPrediction;
    const model = activeTab?.selectedModel;
    const formValues = activeTab?.formValues;
    const outputs = activeTab?.outputs;
    const isRunning = activeTab?.isRunning;
    if (
      prediction?.id &&
      !isRunning &&
      outputs &&
      outputs.length > 0 &&
      model &&
      formValues &&
      Object.keys(formValues).length > 0 &&
      lastSavedPredictionRef.current !== prediction.id
    ) {
      savePredictionInputs(
        prediction.id,
        model.model_id,
        model.name,
        formValues,
      );
      lastSavedPredictionRef.current = prediction.id;
    }
  }, [
    activeTab?.currentPrediction,
    activeTab?.selectedModel,
    activeTab?.formValues,
    activeTab?.outputs,
    activeTab?.isRunning,
    savePredictionInputs,
  ]);

  // Calculate dynamic pricing with debounce — deferred start
  useEffect(() => {
    if (!activeTab?.selectedModel || !apiKey) {
      setCalculatedPrice(null);
      setCalculatedPriceKey(null);
      setIsPricingLoading(false);
      pricingModelRef.current = null;
      return;
    }

    if (pricingTimeoutRef.current) {
      clearTimeout(pricingTimeoutRef.current);
    }

    const selectedModel = activeTab.selectedModel;
    const selectedModelId = selectedModel.model_id;
    const modelChanged = pricingModelRef.current !== selectedModelId;
    pricingModelRef.current = selectedModelId;

    setCalculatedPrice(null);
    setCalculatedPriceKey(currentPricingKey);
    setIsPricingLoading(true);
    const requestPricingKey = currentPricingKey;

    let cancelled = false;
    const delay = modelChanged ? 0 : 500;

    pricingTimeoutRef.current = setTimeout(async () => {
      setIsPricingLoading(true);
      try {
        const defaults = getDefaultValues(activeTab.formFields);
        const mergedValues = { ...defaults, ...activeTab.formValues };
        const cleanedInput: Record<string, unknown> = {};
        const integerFields = new Set(
          activeTab.formFields
            .filter((f) => f.schemaType === "integer")
            .map((f) => f.name),
        );

        for (const [key, value] of Object.entries(mergedValues)) {
          if (
            value !== "" &&
            value !== undefined &&
            value !== null &&
            !(Array.isArray(value) && value.length === 0)
          ) {
            cleanedInput[key] =
              integerFields.has(key) && typeof value === "number"
                ? Math.round(value)
                : value;
          }
        }

        const price = await apiClient.calculatePricing(
          selectedModelId,
          normalizePayloadArrays(cleanedInput, activeTab.formFields),
        );
        if (cancelled) return;

        const discountRate =
          price.discountRate ?? getModelDiscountRate(selectedModel);
        setCalculatedPrice({
          price: price.price,
          discountedPrice:
            price.discountedPrice !== price.price
              ? price.discountedPrice
              : applyDiscount(price.price, discountRate).discountedPrice,
          discountRate,
        });
        setCalculatedPriceKey(requestPricingKey);
      } catch {
        if (cancelled) return;
        setCalculatedPrice(null);
        setCalculatedPriceKey(requestPricingKey);
      } finally {
        if (cancelled) return;
        setIsPricingLoading(false);
      }
    }, delay);

    return () => {
      cancelled = true;
      if (pricingTimeoutRef.current) {
        clearTimeout(pricingTimeoutRef.current);
      }
    };
  }, [
    activeTab?.selectedModel,
    activeTab?.formValues,
    apiKey,
    currentPricingKey,
  ]);

  // Load template from URL query param
  useEffect(() => {
    const templateId = searchParams.get("template");
    if (
      templateId &&
      templates.length > 0 &&
      activeTab &&
      templateLoadedRef.current !== templateId
    ) {
      const template = templates.find((t) => t.id === templateId);
      if (template && template.playgroundData) {
        setFormValues(template.playgroundData.values);
        templateLoadedRef.current = templateId;
        toast({
          title: t("playground.templateLoaded"),
          description: t("playground.loadedTemplate", { name: template.name }),
        });
        // Clear the query param after loading
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, templates, activeTab, setFormValues, setSearchParams, t]);

  const handleSaveTemplate = async (data: TemplateFormData) => {
    if (!activeTab?.selectedModel) return;

    try {
      const template = await createTemplate({
        name: data.name,
        description: data.description || null,
        tags: data.tags,
        thumbnail: data.thumbnail || null,
        type: "custom",
        templateType: "playground",
        playgroundData: {
          modelId: activeTab.selectedModel.model_id,
          modelName: activeTab.selectedModel.name,
          values: activeTab.formValues,
        },
      });
      const savedName = template.name;
      if (savedName !== data.name) {
        toast({
          title: t("playground.templateSaved"),
          description: t("templates.autoRenamed", {
            original: data.name,
            renamed: savedName,
          }),
        });
      } else {
        toast({
          title: t("playground.templateSaved"),
          description: t("playground.savedAs", { name: savedName }),
        });
      }
    } catch (err) {
      toast({
        title: t("common.error"),
        description: err instanceof Error ? err.message : t("common.error"),
        variant: "destructive",
      });
    }
  };

  // Create the first tab with the URL model, or the workspace default model.
  useEffect(() => {
    if (
      filteredModels.length > 0 &&
      workspaceTabs.length === 0 &&
      !initialTabCreatedRef.current
    ) {
      const model = modelId
        ? filteredModels.find((m) => m.model_id === modelId) ||
          getPreferredWorkspaceModel(filteredModels, workspace)
        : getPreferredWorkspaceModel(filteredModels, workspace);
      if (!model) return;

      initialTabCreatedRef.current = true;
      createTab(model, undefined, undefined, null, workspace);
      if (!modelId || model.model_id !== modelId) {
        navigate(`${routeBase}/${encodeURIComponent(model.model_id)}`, {
          replace: true,
        });
      }
    }
  }, [
    modelId,
    filteredModels,
    workspaceTabs.length,
    createTab,
    workspace,
    navigate,
    routeBase,
  ]);

  // Set model from URL only when the active tab has no model (e.g. initial load or new empty tab).
  // Do NOT overwrite when the tab already has a model, so tab switching never wipes form values
  // (otherwise URL can lag and we'd set the wrong model on the newly active tab and reset its form).
  useEffect(() => {
    if (
      !modelId ||
      filteredModels.length === 0 ||
      !activeTab ||
      activeTab.selectedModel != null
    )
      return;
    const model = filteredModels.find((m) => m.model_id === modelId);
    if (model) setSelectedModel(model);
  }, [modelId, filteredModels, activeTab, setSelectedModel]);

  // If an older persisted tab has no selected model, fill it with the workspace default.
  useEffect(() => {
    if (modelId || filteredModels.length === 0 || !activeTab) return;
    if (activeTab.selectedModel) return;
    const model = getPreferredWorkspaceModel(filteredModels, workspace);
    if (!model) return;
    setSelectedModel(model);
    navigate(`${routeBase}/${encodeURIComponent(model.model_id)}`, {
      replace: true,
    });
  }, [
    modelId,
    filteredModels,
    activeTab,
    workspace,
    setSelectedModel,
    navigate,
    routeBase,
  ]);

  const handleModelChange = (modelId: string) => {
    const model = filteredModels.find((m) => m.model_id === modelId);
    if (model) {
      if (activeTab) {
        setSelectedModel(model);
      } else {
        createTab(model, undefined, undefined, null, workspace);
      }
      navigate(`${routeBase}/${encodeURIComponent(modelId)}`, { replace: true });
      if (rightPanelTab !== "result") {
        setRightPanelTab("result");
        sessionStorage.setItem("pg_rightPanelTab", "result");
      }
    }
  };

  // Bind activeTabId into the onChange callback so that async operations
  // (e.g. file uploads) update the correct tab even if the user switches tabs
  // while the upload is in progress.
  const handleFormValueChange = useCallback(
    (key: string, value: unknown) => {
      setFormValue(key, value, activeTabId ?? undefined);
    },
    [setFormValue, activeTabId],
  );

  const buildPricingInput = useCallback(() => {
    if (!activeTab) return null;
    const defaults = getDefaultValues(activeTab.formFields);
    const mergedValues = { ...defaults, ...activeTab.formValues };
    const cleanedInput: Record<string, unknown> = {};
    const integerFields = new Set(
      activeTab.formFields
        .filter((field) => field.schemaType === "integer")
        .map((field) => field.name),
    );

    for (const [key, value] of Object.entries(mergedValues)) {
      if (
        value !== "" &&
        value !== undefined &&
        value !== null &&
        !(Array.isArray(value) && value.length === 0)
      ) {
        cleanedInput[key] =
          integerFields.has(key) && typeof value === "number"
            ? Math.round(value)
            : value;
      }
    }

    return normalizePayloadArrays(cleanedInput, activeTab.formFields);
  }, [activeTab]);

  const ensureSufficientBalanceForRun = useCallback(async () => {
    if (!activeTab?.selectedModel) return false;
    if (!validateForm()) return false;

    const pricingInput = buildPricingInput();
    if (!pricingInput) return false;

    const repeatCount =
      activeTab.batchConfig.enabled && activeTab.batchConfig.repeatCount > 1
        ? activeTab.batchConfig.repeatCount
        : 1;

    setIsPricingLoading(true);
    try {
      const price = await apiClient.calculatePricing(
        activeTab.selectedModel.model_id,
        pricingInput,
      );
      const discountRate =
        price.discountRate ?? getModelDiscountRate(activeTab.selectedModel);
      const nextPrice = {
        price: price.price,
        discountedPrice:
          price.discountedPrice !== price.price
            ? price.discountedPrice
            : applyDiscount(price.price, discountRate).discountedPrice,
        discountRate,
      };
      setCalculatedPrice(nextPrice);
      setCalculatedPriceKey(currentPricingKey);

      const requiredBalance = nextPrice.discountedPrice * repeatCount;
      const balance = await apiClient.getBalance();
      if (balance + 0.0001 < requiredBalance) {
        toast({
          title: "余额不足",
          description: `当前余额 ¥${balance.toFixed(4)}，本次预计需要 ¥${requiredBalance.toFixed(4)}，请充值后再运行。`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    } catch (error) {
      toast({
        title: "无法校验余额",
        description:
          error instanceof Error
            ? error.message
            : "运行前余额校验失败，请稍后重试。",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsPricingLoading(false);
    }
  }, [activeTab, buildPricingInput, currentPricingKey, validateForm]);

  const handleSetDefaults = useCallback(
    (defaults: Record<string, unknown>) => {
      const pending = consumePendingFormValues();
      if (pending) {
        setFormValues({ ...defaults, ...pending });
      } else {
        setFormValues(defaults);
      }
    },
    [setFormValues, consumePendingFormValues],
  );

  // When a tab is created with pendingFormValues (e.g. from History "Open in Playground")
  // and DynamicForm does NOT call onSetDefaults (same model, schema cached),
  // apply pending values merged with schema defaults so all fields are populated.
  useEffect(() => {
    const tab = getActiveTab();
    if (!tab?.pendingFormValues) return;
    const pending = consumePendingFormValues();
    if (pending) {
      // Read formFields from the store (may have been set by DynamicForm's effect)
      const currentTab = getActiveTab();
      const fields = currentTab?.formFields ?? [];
      const defaults = fields.length > 0 ? getDefaultValues(fields) : {};
      setFormValues({ ...defaults, ...currentTab?.formValues, ...pending });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // When a tab is created with pre-loaded outputs (e.g. from History/Assets "Customize"),
  // auto-switch to the Result tab so the user sees the output immediately.
  useEffect(() => {
    if (
      activeTab?.outputs &&
      activeTab.outputs.length > 0 &&
      rightPanelTab !== "result"
    ) {
      setRightPanelTab("result");
      sessionStorage.setItem("pg_rightPanelTab", "result");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  const handleRun = useCallback(async () => {
    if (!activeTab) return;
    const canRun = await ensureSufficientBalanceForRun();
    if (!canRun) return;

    // Switch to output view on mobile when running
    setMobileView("output");
    // Auto-switch to Result tab so user sees the output
    switchTab("result");

    const { batchConfig } = activeTab;
    if (batchConfig.enabled && batchConfig.repeatCount > 1) {
      await runBatch();
    } else {
      await runPrediction();
    }
    void fetchMyGenerations();
  }, [
    activeTab,
    ensureSufficientBalanceForRun,
    switchTab,
    runBatch,
    runPrediction,
    fetchMyGenerations,
  ]);

  // Ctrl+Enter / Cmd+Enter to run; Ctrl+W / Cmd+W to close active tab
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (activeTab?.selectedModel && !activeTab.isRunning) {
          handleRun();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, activeTab, activeTabId, handleRun, closeTab]);

  const handleReset = () => {
    resetForm();
    clearBatchResults();
  };

  const handleNewTab = () => {
    const currentModel = activeTab?.selectedModel;
    createTab(currentModel || undefined, undefined, undefined, null, workspace);
    // Stay on result panel, not featured
    setRightPanelTab("result");
    sessionStorage.setItem("pg_rightPanelTab", "result");
    if (currentModel) {
      navigate(`${routeBase}/${encodeURIComponent(currentModel.model_id)}`);
    } else {
      navigate(routeBase);
    }
    // Scroll to show the newest tab
    requestAnimationFrame(() => {
      if (pgTabScrollRef.current) {
        pgTabScrollRef.current.scrollLeft = pgTabScrollRef.current.scrollWidth;
      }
    });
  };

  // Explore: select a featured model → open in new tab
  const handleExploreSelectFeatured = useCallback(
    (primaryVariant: string) => {
      const model = filteredModels.find((m) => m.model_id === primaryVariant);
      if (model) {
        createTab(model, undefined, undefined, null, workspace);
        navigate(`${routeBase}/${encodeURIComponent(primaryVariant)}`);
        setRightPanelTab("result");
        sessionStorage.setItem("pg_rightPanelTab", "result");
      }
    },
    [filteredModels, createTab, navigate, routeBase, workspace],
  );

  // Templates panel: use a template
  const handleUseTemplateFromPanel = useCallback(
    (
      template: import("@/types/template").Template,
      mode?: "new" | "replace",
    ) => {
      if (template.playgroundData) {
        // Determine effective mode:
        // - explicit "replace" from overlay button
        // - explicit "new" from overlay button
        // - no mode (card click): default to "new" unless no active tab exists
        // - special case: if active tab has no model selected, auto-replace (fill empty tab)
        let effectiveMode: "new" | "replace";
        if (mode) {
          effectiveMode = mode;
        } else {
          effectiveMode = "new";
        }
        // Auto-replace empty tab (no model selected) even when mode is "new"
        if (effectiveMode === "new" && activeTab && !activeTab.selectedModel) {
          effectiveMode = "replace";
        }

        const shouldCreateNewTab = effectiveMode === "new" || !activeTab;

        flushSync(() => {
          if (shouldCreateNewTab) {
            const model = template.playgroundData!.modelId
              ? filteredModels.find(
                  (m) => m.model_id === template.playgroundData!.modelId,
                )
              : undefined;
            createTab(model, undefined, undefined, null, workspace);
          } else {
            // Replace current tab
            if (
              template.playgroundData!.modelId &&
              activeTab!.selectedModel?.model_id !==
                template.playgroundData!.modelId
            ) {
              const model = filteredModels.find(
                (m) => m.model_id === template.playgroundData!.modelId,
              );
              if (model) setSelectedModel(model);
            }
            setFormValues(template.playgroundData!.values);
          }
          setRightPanelTab("result");
          sessionStorage.setItem("pg_rightPanelTab", "result");
        });

        if (template.playgroundData.modelId) {
          navigate(`${routeBase}/${encodeURIComponent(template.playgroundData.modelId)}`, {
            replace: true,
          });
        }

        // For new tab: set form values after tab is active
        if (shouldCreateNewTab) {
          setTimeout(() => {
            setFormValues(template.playgroundData!.values);
          }, 0);
        }
      }
    },
    [
      activeTab,
      filteredModels,
      setSelectedModel,
      setFormValues,
      createTab,
      navigate,
      routeBase,
      t,
      workspace,
    ],
  );

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  const handleTabClick = (tabId: string) => {
    if (tabId === activeTabId && rightPanelTab === "result") return;
    // Batch zustand + React state updates into a single synchronous commit to prevent flicker
    flushSync(() => {
      if (rightPanelTab !== "result") {
        setRightPanelTab("result");
        sessionStorage.setItem("pg_rightPanelTab", "result");
      }
      setActiveTab(tabId);
    });
    // Sync URL without triggering React Router re-render
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || tab.workspace !== workspace) return;
    const newUrl = tab?.selectedModel
      ? `${routeBase}/${encodeURIComponent(tab.selectedModel.model_id)}`
      : routeBase;
    window.history.replaceState(null, "", newUrl);
  };

  // Block render only while the API key is being read from disk.
  // Once we have the key (or confirmed there's none), show the UI immediately.
  // Models come from localStorage cache instantly, so no need to wait for network.
  if (isLoadingApiKey || !hasAttemptedLoad) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activePrice =
    calculatedPriceKey === currentPricingKey ? calculatedPrice : null;

  return (
    <div className="playground-dark flex h-full flex-col md:pt-0">
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile Tab Switcher */}
        <div className="md:hidden flex border-b border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] backdrop-blur">
          <button
            onClick={() => setMobileView("config")}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-colors",
              mobileView === "config"
                ? "text-white border-b-2 border-[hsl(var(--playground-accent))] bg-[hsl(var(--playground-panel))]"
                : "text-muted-foreground",
            )}
          >
            Input
          </button>
          <button
            onClick={() => setMobileView("output")}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-colors",
              mobileView === "output"
                ? "text-white border-b-2 border-[hsl(var(--playground-accent))] bg-[hsl(var(--playground-panel))]"
                : "text-muted-foreground",
            )}
          >
            Output
          </button>
        </div>

        <div
          ref={containerRef}
          className="flex flex-1 flex-col overflow-hidden md:flex-row animate-in fade-in duration-300 fill-mode-both"
          style={{ animationDelay: "80ms" }}
        >
          {/* Left Panel - Configuration (always visible) */}
          <div
            className={cn(
              "w-full md:w-auto flex flex-col min-h-0 border-b md:overflow-hidden md:border-r md:border-b-0 md:shrink-0 md:grow-0 bg-[hsl(var(--playground-surface))] border-[hsl(var(--playground-border))]",
              mobileView === "config"
                ? "flex flex-1 md:flex-initial"
                : "hidden md:flex",
            )}
            style={{ flexBasis: `${leftPanelWidth}px` }}
          >
            {/* Page Title */}
            <div className="px-4 py-3 pt-14 md:pt-3 border-b border-[hsl(var(--playground-border))] shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
              <div className="flex items-center">
                <h1 className="flex items-center gap-2 text-base font-semibold leading-none text-white">
                  <WorkspaceIcon className="h-4 w-4 text-[hsl(var(--playground-accent))]" />
                  {workspaceTitle}
                </h1>
              </div>
            </div>

            {/* Model Selector */}
            <div className="px-3 pb-1 shrink-0">
              <ModelSelector
                models={filteredModels}
                value={activeTab?.selectedModel?.model_id}
                onChange={handleModelChange}
              />
            </div>

            {/* Parameters */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
              {activeTab?.selectedModel ? (
                <DynamicForm
                  model={activeTab.selectedModel}
                  values={activeTab.formValues}
                  validationErrors={activeTab.validationErrors}
                  onChange={handleFormValueChange}
                  onSetDefaults={handleSetDefaults}
                  collapsible
                  onFieldsChange={setFormFields}
                  onUploadingChange={setUploading}
                  scrollable={false}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-4 px-6 text-center">
                  <div className="rounded-2xl bg-[hsl(var(--playground-tab-active))] p-4">
                    <Sparkles className="h-8 w-8 text-[hsl(var(--playground-accent))]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {t("playground.selectModelPrompt")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t(
                        "playground.emptyStateHint",
                        "Pick a featured model or browse all models to get started",
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => switchTab("featured")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                    >
                      <Compass className="h-3.5 w-3.5" />
                      {t(
                        "playground.rightPanel.featuredModels",
                        "Featured Models",
                      )}
                    </button>
                    <button
                      onClick={() => navigate("/models")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(var(--playground-border))] text-xs font-medium text-muted-foreground hover:text-white hover:bg-white/6 transition-colors"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      {t("playground.rightPanel.models", "All Models")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom: Run + actions on same row */}
            <div className="border-t border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] px-3 py-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <BatchControls
                    disabled={!activeTab?.selectedModel}
                    isRunning={activeTab?.isRunning ?? false}
                    isUploading={(activeTab?.uploadingCount ?? 0) > 0}
                    onRun={handleRun}
                    onAbort={abortRun}
                    runLabel={t("playground.run")}
                    runningLabel={
                      activeTab?.batchState?.isRunning
                        ? `${t("playground.abort", "Abort")} (${activeTab.batchState.queue.length})`
                        : t("playground.abort", "Abort")
                    }
                    price={
                      activePrice != null
                        ? activePrice
                        : isPricingLoading
                          ? "..."
                          : undefined
                    }
                  />
                </div>
                <button
                  onClick={handleReset}
                  disabled={!activeTab || activeTab.isRunning}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-[hsl(var(--playground-border))] text-muted-foreground hover:text-white hover:bg-white/6 transition-colors disabled:opacity-40"
                  title={t("playground.resetForm")}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setShowSaveTemplateDialog(true)}
                  disabled={!activeTab?.selectedModel}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-[hsl(var(--playground-border))] text-muted-foreground hover:text-white hover:bg-white/6 transition-colors disabled:opacity-40"
                  title={t("playground.saveAsTemplate")}
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={handleResizeStart}
            className="hidden md:flex w-1 cursor-col-resize items-center justify-center hover:bg-white/6 active:bg-white/10 transition-colors group shrink-0 bg-[hsl(var(--playground-canvas))]"
          >
            <div className="w-px h-8 bg-[hsl(var(--playground-border))] group-hover:bg-[hsl(var(--playground-accent))] transition-colors" />
          </div>

          {/* Right Panel - always visible */}
          <div
            className={cn(
              "flex-1 flex flex-col min-w-0 overflow-hidden bg-[hsl(var(--playground-canvas))]",
              mobileView === "output" ? "flex" : "hidden md:flex",
            )}
          >
            {/* Content Tabs - browser-style tab bar */}
            <div className="flex items-center border-b border-[hsl(var(--playground-border))] pl-0 pr-2 gap-1 h-10 shrink-0 bg-[hsl(var(--playground-surface))]">
              {/* Tab list dropdown button */}
              <div ref={tabListRef} className="relative shrink-0">
                <button
                  onClick={() => setTabListOpen(!tabListOpen)}
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-md transition-colors shrink-0",
                    tabListOpen
                      ? "bg-[hsl(var(--playground-tab-active))] text-white"
                      : "text-muted-foreground hover:text-white hover:bg-white/6",
                  )}
                  title={t("playground.tabs.allTabs", "All Tabs")}
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      tabListOpen && "rotate-180",
                    )}
                  />
                </button>
                {tabListOpen && (
                  <div className="absolute z-50 mt-1 left-0 min-w-[320px] max-h-[400px] overflow-y-auto rounded-xl border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] shadow-xl animate-in fade-in-0 zoom-in-95">
                    <div className="p-1.5">
                      {workspaceTabs.length === 0 ? (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          {t("playground.noTabs", "No open tabs")}
                        </div>
                      ) : (
                        workspaceTabs.map((tab) => (
                          <div
                            key={tab.id}
                            title={
                              tab.selectedModel?.model_id ||
                              t("playground.tabs.newTab")
                            }
                            onClick={() => {
                              handleTabClick(tab.id);
                              setTabListOpen(false);
                            }}
                            className={cn(
                              "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer",
                              "hover:bg-white/6 hover:text-white",
                              tab.id === activeTabId &&
                                "bg-[hsl(var(--playground-tab-active))] text-white font-medium",
                            )}
                          >
                            {tab.isRunning ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-primary" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium">
                                {tab.selectedModel?.model_id ||
                                  t("playground.tabs.newTab")}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                {tab.selectedModel?.type && (
                                  <span>{tab.selectedModel.type}</span>
                                )}
                                <span className="flex items-center gap-0.5">
                                  <Clock className="h-2.5 w-2.5" />
                                  {new Date(tab.createdAt).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </span>
                              </div>
                            </div>
                            {tab.id === activeTabId && (
                              <span className="text-[9px] bg-[hsl(var(--playground-accent))] text-black rounded px-1 py-0.5 font-medium shrink-0">
                                active
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCloseTab(e, tab.id);
                              }}
                              className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity shrink-0 text-muted-foreground hover:text-white"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="border-t border-[hsl(var(--playground-border))] p-1.5">
                      <button
                        onClick={() => {
                          handleNewTab();
                          setTabListOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground hover:text-white hover:bg-white/6 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t("playground.tabs.newTab", "New Tab")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Scrollable session tabs */}
              <div
                ref={pgTabScrollRef}
                className="flex-1 min-w-0 overflow-x-auto hide-scrollbar"
                onWheel={(e) => {
                  if (pgTabScrollRef.current && e.deltaY !== 0) {
                    e.preventDefault();
                    pgTabScrollRef.current.scrollLeft += e.deltaY;
                  }
                }}
              >
                <div className="flex items-center gap-1">
                  {workspaceTabs.map((tab) => {
                    const isActive =
                      tab.id === activeTabId && rightPanelTab === "result";
                    return (
                      <div
                        key={tab.id}
                        draggable
                        onDragStart={(e) => handleTabDragStart(e, tab.id)}
                        onDragOver={(e) => handleTabDragOver(e, tab.id)}
                        onDrop={(e) => handleTabDrop(e, tab.id)}
                        onDragEnd={handleTabDragEnd}
                        onClick={() => {
                          handleTabClick(tab.id);
                        }}
                        title={
                          tab.selectedModel?.model_id ||
                          t("playground.tabs.newTab")
                        }
                        className={cn(
                          "group relative flex h-8 items-center gap-1.5 px-3 text-xs transition-colors cursor-pointer select-none min-w-[80px] max-w-[240px] hover:bg-white/6",
                          dragTabId === tab.id && "opacity-40",
                          isActive
                            ? "bg-[hsl(var(--playground-tab-active))] text-white font-medium"
                            : "bg-transparent text-muted-foreground",
                        )}
                      >
                        {/* Drop indicator lines */}
                        {dropIndicator?.tabId === tab.id &&
                          dropIndicator.side === "left" && (
                            <div className="absolute -left-px top-1 bottom-1 w-0.5 rounded-full bg-[hsl(var(--playground-accent))]" />
                          )}
                        {dropIndicator?.tabId === tab.id &&
                          dropIndicator.side === "right" && (
                            <div className="absolute -right-px top-1 bottom-1 w-0.5 rounded-full bg-[hsl(var(--playground-accent))]" />
                          )}
                        {tab.isRunning && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                        )}
                        <span className="truncate flex-1">
                          {tab.selectedModel?.model_id ||
                            t("playground.tabs.newTab")}
                        </span>
                        <button
                          onClick={(e) => handleCloseTab(e, tab.id)}
                          className={cn(
                            "ml-1 rounded p-0.5 transition-opacity hover:bg-white/10 text-muted-foreground hover:text-white",
                            isActive
                              ? "opacity-70"
                              : "opacity-0 group-hover:opacity-100",
                          )}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                  {/* + button inside scroll area, right after last tab */}
                  <button
                    onClick={handleNewTab}
                    className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-white hover:bg-white/6 transition-colors shrink-0"
                    title={t("playground.tabs.newTab", "New Tab")}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right Panel Content — all panels stacked via absolute positioning, no hidden/show remount */}
            <div className="flex-1 overflow-hidden relative">
              {/* Featured panel */}
              {!isMobile && (
                <div
                  className="absolute inset-0 flex flex-col overflow-hidden transition-opacity duration-150"
                  style={{
                    opacity: rightPanelTab === "featured" ? 1 : 0,
                    pointerEvents:
                      rightPanelTab === "featured" ? "auto" : "none",
                    visibility:
                      rightPanelTab === "featured" ? "visible" : "hidden",
                  }}
                >
                  <FeaturedModelsPanel
                    onSelectFeatured={handleExploreSelectFeatured}
                    models={filteredModels}
                    workspace={workspace}
                  />
                </div>
              )}

              {/* Templates panel */}
              {!isMobile && (
                <div
                  className="absolute inset-0 flex flex-col overflow-hidden transition-opacity duration-150"
                  style={{
                    opacity: rightPanelTab === "templates" ? 1 : 0,
                    pointerEvents:
                      rightPanelTab === "templates" ? "auto" : "none",
                    visibility:
                      rightPanelTab === "templates" ? "visible" : "hidden",
                  }}
                >
                  <TemplatesPanel onUseTemplate={handleUseTemplateFromPanel} />
                </div>
              )}

              {/* Result panel */}
              <div
                className="absolute inset-0 flex flex-col overflow-hidden transition-opacity duration-150"
                style={{
                  opacity: rightPanelTab === "result" ? 1 : 0,
                  pointerEvents: rightPanelTab === "result" ? "auto" : "none",
                  visibility: rightPanelTab === "result" ? "visible" : "hidden",
                }}
              >
                <MyGenerationsPanel
                  localHistory={activeTab?.generationHistory ?? []}
                  remoteHistory={remoteGenerationHistory}
                  isLoading={isRemoteHistoryLoading}
                  onRefresh={fetchMyGenerations}
                  onShowExamples={() => switchTab("featured")}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Template Dialog */}
      <TemplateDialog
        open={showSaveTemplateDialog}
        onOpenChange={setShowSaveTemplateDialog}
        mode="create"
        onSave={handleSaveTemplate}
      />
    </div>
  );
}
