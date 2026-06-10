import { create } from "zustand";
import { apiClient } from "@/api/client";
import type { Model } from "@/types/model";
import type {
  PredictionResult,
  GenerationHistoryItem,
} from "@/types/prediction";
import type { FormFieldConfig } from "@/lib/schemaToForm";
import { normalizePayloadArrays } from "@/lib/schemaToForm";
import type { BatchConfig, BatchState, BatchResult } from "@/types/batch";
import { DEFAULT_BATCH_CONFIG } from "@/types/batch";
import { persistentStorage } from "@/lib/storage";
import { isImageUrl, isVideoUrl } from "@/lib/mediaUtils";
import { useAssetsStore, detectAssetType } from "@/stores/assetsStore";

/* ── Store-level auto-save to My Assets ───────────────────────────────── */

/**
 * Track prediction IDs that are currently being auto-saved (or already saved)
 * from the store layer. Shared between autoSaveToAssets and OutputDisplay
 * to prevent duplicate saves when both fire concurrently.
 */
export const storeSavedPredictionIds = new Set<string>();

/**
 * Auto-save prediction outputs to My Assets from the store layer.
 * This runs immediately when a prediction completes, regardless of which
 * tab is currently active — fixing the bug where switching tabs during
 * generation caused the OutputDisplay useEffect to miss the save.
 * Fire-and-forget; errors are logged but never thrown.
 */
function autoSaveToAssets(
  outputs: (string | Record<string, unknown>)[],
  modelId: string,
  predictionId: string | undefined,
): void {
  if (!predictionId) return;
  if (storeSavedPredictionIds.has(predictionId)) return;

  const { settings, saveAsset, hasAssetForPrediction } =
    useAssetsStore.getState();
  if (!settings.autoSaveAssets) return;
  if (hasAssetForPrediction(predictionId)) return;

  // Mark immediately to prevent concurrent duplicate from OutputDisplay
  storeSavedPredictionIds.add(predictionId);

  const unsaved: { output: string; index: number }[] = [];
  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    if (typeof output !== "string") continue;
    if (output.startsWith("local-asset://")) continue;
    const assetType = detectAssetType(output);
    if (!assetType) continue;
    unsaved.push({ output, index: i });
  }
  if (unsaved.length === 0) return;

  // Fire-and-forget — save each output
  (async () => {
    for (const { output, index } of unsaved) {
      try {
        await saveAsset(output, detectAssetType(output)!, {
          modelId,
          predictionId,
          originalUrl: output,
          resultIndex: index,
        });
      } catch (err) {
        console.error("[playgroundStore] auto-save asset failed:", err);
      }
    }
  })();
}

/* ── Playground session persistence ───────────────────────────────────── */

const PLAYGROUND_SESSION_KEY = "wavespeed_playground_session_v1";

export type PlaygroundWorkspace = "image" | "video" | "avatar" | "audio" | "3d";

const WORKSPACE_KEYWORDS: Record<PlaygroundWorkspace, string[]> = {
  avatar: [
    "avatar",
    "talking",
    "talking-head",
    "portrait-animation",
    "lip-sync",
    "lipsync",
    "animate",
    "character-animation",
    "infinitetalk",
    "digital human",
    "face drive",
  ],
  audio: [
    "audio",
    "music",
    "speech",
    "voice",
    "tts",
    "sing",
    "song",
    "sound",
    "vocal",
  ],
  "3d": [
    "3d",
    "mesh",
    "gaussian",
    "splat",
    "point cloud",
    "point-cloud",
    "nerf",
    "obj",
    "glb",
    "gltf",
  ],
  video: ["video", "motion", "camera control", "frame interpolation"],
  image: [],
};

export function getModelWorkspace(
  model?: Pick<Model, "model_id" | "type"> | null,
): PlaygroundWorkspace {
  const haystack =
    `${model?.type ?? ""} ${model?.model_id ?? ""}`.toLowerCase();

  if (WORKSPACE_KEYWORDS.avatar.some((keyword) => haystack.includes(keyword))) {
    return "avatar";
  }
  if (WORKSPACE_KEYWORDS.audio.some((keyword) => haystack.includes(keyword))) {
    return "audio";
  }
  if (WORKSPACE_KEYWORDS["3d"].some((keyword) => haystack.includes(keyword))) {
    return "3d";
  }
  if (WORKSPACE_KEYWORDS.video.some((keyword) => haystack.includes(keyword))) {
    return "video";
  }
  return "image";
}

export function getWorkspaceRoute(
  workspace: PlaygroundWorkspace,
  modelId?: string | null,
): string {
  const base =
    workspace === "video"
      ? "/video"
      : workspace === "avatar"
        ? "/avatar"
        : workspace === "audio"
          ? "/audio"
          : workspace === "3d"
            ? "/3d"
            : "/image";
  return modelId ? `${base}/${encodeURIComponent(modelId)}` : base;
}

interface PersistedPlaygroundTab {
  id: string;
  createdAt?: number;
  workspace?: PlaygroundWorkspace;
  selectedModel: Model | null;
  formValues: Record<string, unknown>;
  formFields: FormFieldConfig[];
  batchConfig: BatchConfig;
  batchResults: BatchResult[];
  generationHistory?: GenerationHistoryItem[];
}

interface PersistedPlaygroundSession {
  version: 1;
  activeTabId: string | null;
  tabCounter: number;
  tabs: PersistedPlaygroundTab[];
}

function parseTabCounter(tabId: string): number {
  const m = /^tab-(\d+)$/.exec(tabId);
  return m ? Number(m[1]) : 0;
}

function parsePlaygroundSession(
  raw: unknown,
): { tabs: PlaygroundTab[]; activeTabId: string; tabCounter: number } | null {
  try {
    if (!raw) return null;
    const parsed = (
      typeof raw === "string" ? JSON.parse(raw) : raw
    ) as Partial<PersistedPlaygroundSession>;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.tabs) ||
      parsed.tabs.length === 0
    )
      return null;
    const tabs: PlaygroundTab[] = parsed.tabs.map(
      (t: PersistedPlaygroundTab) => ({
        id: t.id,
        createdAt: t.createdAt ?? Date.now(),
        workspace: t.workspace ?? getModelWorkspace(t.selectedModel),
        selectedModel: t.selectedModel ?? null,
        formValues: t.formValues ?? {},
        formFields: t.formFields ?? [],
        validationErrors: {},
        isRunning: false,
        currentPrediction: null,
        error: null,
        outputs: [],
        batchConfig: t.batchConfig ?? { ...DEFAULT_BATCH_CONFIG },
        batchState: null,
        batchResults: t.batchResults ?? [],
        uploadingCount: 0,
        generationHistory: Array.isArray(t.generationHistory)
          ? t.generationHistory.slice(0, 200)
          : [],
        selectedHistoryIndex: null,
        pendingFormValues: null,
      }),
    );
    const activeTabId =
      typeof parsed.activeTabId === "string" &&
      tabs.some((tab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : tabs[0].id;
    const tabCounter =
      typeof parsed.tabCounter === "number"
        ? parsed.tabCounter
        : Math.max(1, ...tabs.map((t) => parseTabCounter(t.id)));
    return { tabs, activeTabId, tabCounter };
  } catch {
    return null;
  }
}

export function persistPlaygroundSession(): void {
  try {
    const state = usePlaygroundStore.getState();
    const payload: PersistedPlaygroundSession = {
      version: 1,
      activeTabId: state.activeTabId,
      tabCounter,
      tabs: state.tabs.map((tab) => ({
        id: tab.id,
        createdAt: tab.createdAt,
        workspace: tab.workspace,
        selectedModel: tab.selectedModel,
        formValues: tab.formValues,
        formFields: tab.formFields,
        batchConfig: tab.batchConfig,
        batchResults: tab.batchResults,
        generationHistory: tab.generationHistory.slice(0, 200),
      })),
    };
    persistentStorage.set(PLAYGROUND_SESSION_KEY, payload);
  } catch {
    // ignore
  }
}

/** Hydrate playground session from persistent storage (async). */
export async function hydratePlaygroundSession(): Promise<void> {
  try {
    const stored = await persistentStorage.get(PLAYGROUND_SESSION_KEY);
    if (!stored) return;
    const session = parsePlaygroundSession(stored);
    if (!session) return;
    const current = usePlaygroundStore.getState();
    if (current.tabs.length > 0) return;
    tabCounter = session.tabCounter;
    usePlaygroundStore.setState({
      tabs: session.tabs,
      activeTabId: session.activeTabId,
    });
  } catch {
    // ignore
  }
}

// Module-level map for AbortControllers (not serializable, so kept outside store state)
const abortControllers = new Map<string, AbortController>();

function createPendingGenerationItem(params: {
  id: string;
  modelId: string;
  formValues: Record<string, unknown>;
  addedAt?: number;
}): GenerationHistoryItem {
  return {
    id: params.id,
    prediction: {
      id: params.id,
      model: params.modelId,
      status: "processing",
      outputs: [],
    },
    outputs: [],
    formValues: { ...params.formValues },
    addedAt: params.addedAt ?? Date.now(),
    thumbnailUrl: null,
    thumbnailType: null,
    status: "processing",
    error: null,
    modelId: params.modelId,
  };
}

interface PlaygroundTab {
  id: string;
  createdAt: number;
  workspace: PlaygroundWorkspace;
  selectedModel: Model | null;
  formValues: Record<string, unknown>;
  formFields: FormFieldConfig[];
  validationErrors: Record<string, string>;
  isRunning: boolean;
  currentPrediction: PredictionResult | null;
  error: string | null;
  outputs: (string | Record<string, unknown>)[];
  // Batch processing
  batchConfig: BatchConfig;
  batchState: BatchState | null;
  batchResults: BatchResult[];
  // File upload tracking
  uploadingCount: number;
  // Generation history (multi-output splitting)
  generationHistory: GenerationHistoryItem[];
  selectedHistoryIndex: number | null;
  // Pending form values to apply after schema defaults are set
  pendingFormValues: Record<string, unknown> | null;
}

interface PlaygroundState {
  tabs: PlaygroundTab[];
  activeTabId: string | null;

  // Tab management
  createTab: (
    model?: Model,
    initialFormValues?: Record<string, unknown>,
    initialOutputs?: (string | Record<string, unknown>)[],
    initialPrediction?: PredictionResult | null,
    workspace?: PlaygroundWorkspace,
  ) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  reorderTab: (fromIndex: number, toIndex: number) => void;

  // Current tab accessors (for convenience)
  getActiveTab: () => PlaygroundTab | null;

  // Actions on active tab
  setSelectedModel: (model: Model | null) => void;
  setFormValue: (key: string, value: unknown, tabId?: string) => void;
  setFormValues: (values: Record<string, unknown>) => void;
  setFormFields: (fields: FormFieldConfig[]) => void;
  validateForm: () => boolean;
  clearValidationError: (key: string) => void;
  resetForm: () => void;
  runPrediction: () => Promise<void>;
  abortRun: () => void;
  clearOutput: () => void;

  // Batch processing actions
  setBatchConfig: (config: Partial<BatchConfig>) => void;
  runBatch: () => Promise<void>;
  cancelBatch: () => void;
  clearBatchResults: () => void;
  generateBatchInputs: () => Record<string, unknown>[];

  // File upload tracking
  setUploading: (isUploading: boolean) => void;

  // History selection
  selectHistoryItem: (index: number | null) => void;

  // Consume pending form values (returns them and clears from tab)
  consumePendingFormValues: () => Record<string, unknown> | null;

  // Find formValues from any tab's generationHistory by prediction ID
  findFormValuesByPredictionId: (
    predictionId: string,
  ) => Record<string, unknown> | null;

  // Shared generation history used by tool pages that write into a workspace.
  startExternalGeneration: (params: {
    id: string;
    workspace: PlaygroundWorkspace;
    modelId: string;
    formValues: Record<string, unknown>;
  }) => void;
  completeExternalGeneration: (params: {
    pendingId: string;
    modelId: string;
    prediction: PredictionResult;
    outputs: (string | Record<string, unknown>)[];
    formValues: Record<string, unknown>;
  }) => void;
  failExternalGeneration: (params: {
    pendingId: string;
    error: string;
  }) => void;
}

// Check if a value is considered "empty"
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function createEmptyTab(
  id: string,
  model?: Model,
  workspace: PlaygroundWorkspace = getModelWorkspace(model),
): PlaygroundTab {
  return {
    id,
    createdAt: Date.now(),
    workspace,
    selectedModel: model || null,
    formValues: {},
    formFields: [],
    validationErrors: {},
    isRunning: false,
    currentPrediction: null,
    error: null,
    outputs: [],
    // Batch processing defaults
    batchConfig: { ...DEFAULT_BATCH_CONFIG },
    batchState: null,
    batchResults: [],
    // File upload tracking
    uploadingCount: 0,
    // Generation history
    generationHistory: [],
    selectedHistoryIndex: null,
    pendingFormValues: null,
  };
}

function createHistoryItemsFromOutputs(params: {
  prediction: PredictionResult;
  outputs: (string | Record<string, unknown>)[];
  formValues: Record<string, unknown>;
  modelId: string;
}): GenerationHistoryItem[] {
  const { prediction, outputs, formValues, modelId } = params;
  const mediaEntries: { output: string; type: "image" | "video" }[] = [];
  for (const output of outputs) {
    if (typeof output !== "string") continue;
    if (isImageUrl(output)) mediaEntries.push({ output, type: "image" });
    else if (isVideoUrl(output)) mediaEntries.push({ output, type: "video" });
  }

  if (mediaEntries.length >= 2) {
    const baseId = prediction.id || `gen-${Date.now()}`;
    return mediaEntries.map(({ output, type }, index) => ({
      id: `${baseId}-${index}`,
      prediction,
      outputs: [output],
      formValues: { ...formValues },
      addedAt: Date.now() + index,
      thumbnailUrl: output,
      thumbnailType: type,
      status: "completed",
      error: null,
      modelId,
    }));
  }

  const thumbnailUrl = mediaEntries[0]?.output ?? null;
  const thumbnailType = mediaEntries[0]?.type ?? null;
  return [
    {
      id: prediction.id || `gen-${Date.now()}`,
      prediction,
      outputs,
      formValues: { ...formValues },
      addedAt: Date.now(),
      thumbnailUrl,
      thumbnailType,
      status: "completed",
      error: null,
      modelId,
    },
  ];
}

function getWorkspaceTargetTabId(
  state: PlaygroundState,
  workspace: PlaygroundWorkspace,
) {
  const activeTab = state.tabs.find(
    (tab) => tab.id === state.activeTabId && tab.workspace === workspace,
  );
  return (
    activeTab?.id ?? state.tabs.find((tab) => tab.workspace === workspace)?.id
  );
}

function shallowRecordEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.is(a[key], b[key]));
}

function formFieldsEqual(a: FormFieldConfig[], b: FormFieldConfig[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((field, index) => {
    const other = b[index];
    return (
      field.name === other.name &&
      field.type === other.type &&
      field.required === other.required &&
      Object.is(field.default, other.default) &&
      JSON.stringify(field.options ?? []) ===
        JSON.stringify(other.options ?? [])
    );
  });
}

let tabCounter = 0;

const initialSession = parsePlaygroundSession(
  persistentStorage.getSync(PLAYGROUND_SESSION_KEY),
);
if (initialSession) {
  tabCounter = initialSession.tabCounter;
}

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  tabs: initialSession?.tabs ?? [],
  activeTabId: initialSession?.activeTabId ?? null,

  createTab: (
    model?: Model,
    initialFormValues?: Record<string, unknown>,
    initialOutputs?: (string | Record<string, unknown>)[],
    initialPrediction?: PredictionResult | null,
    workspace?: PlaygroundWorkspace,
  ) => {
    const id = `tab-${++tabCounter}`;
    const newTab = createEmptyTab(
      id,
      model,
      workspace ?? getModelWorkspace(model),
    );
    if (initialFormValues) {
      newTab.pendingFormValues = { ...initialFormValues };
    }
    if (initialOutputs && initialOutputs.length > 0) {
      newTab.outputs = initialOutputs;
    }
    if (initialPrediction) {
      newTab.currentPrediction = initialPrediction;
    }
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: id,
    }));
    return id;
  },

  closeTab: (tabId: string) => {
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== tabId);
      let newActiveTabId = state.activeTabId;

      // If we're closing the active tab, switch to another
      if (state.activeTabId === tabId) {
        const closedIndex = state.tabs.findIndex((t) => t.id === tabId);
        if (newTabs.length > 0) {
          // Try to select the tab to the left, or the first one
          const newIndex = Math.min(closedIndex, newTabs.length - 1);
          newActiveTabId = newTabs[newIndex].id;
        } else {
          newActiveTabId = null;
        }
      }

      return { tabs: newTabs, activeTabId: newActiveTabId };
    });
  },

  setActiveTab: (tabId: string) => {
    set({ activeTabId: tabId });
  },

  reorderTab: (fromIndex: number, toIndex: number) => {
    set((state) => {
      if (fromIndex === toIndex) return state;
      const newTabs = [...state.tabs];
      const [moved] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, moved);
      return { tabs: newTabs };
    });
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) || null;
  },

  setSelectedModel: (model: Model | null) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? tab.selectedModel?.model_id === model?.model_id
            ? tab
            : {
                ...tab,
                selectedModel: model,
                formValues: {},
                formFields: [],
                validationErrors: {},
                currentPrediction: null,
                error: null,
                outputs: [],
                generationHistory: [],
                selectedHistoryIndex: null,
              }
          : tab,
      ),
    }));
  },

  setFormValue: (key: string, value: unknown, tabId?: string) => {
    set((state) => {
      const targetTabId = tabId ?? state.activeTabId;
      let changed = false;
      const tabs = state.tabs.map((tab) => {
        if (tab.id !== targetTabId) return tab;
        if (Object.is(tab.formValues[key], value)) return tab;
        changed = true;
        return {
          ...tab,
          formValues: { ...tab.formValues, [key]: value },
          validationErrors: { ...tab.validationErrors, [key]: "" },
        };
      });
      if (!changed) return state;
      return {
        tabs,
      };
    });
  },

  setFormValues: (values: Record<string, unknown>) => {
    set((state) => {
      let changed = false;
      const tabs = state.tabs.map((tab) => {
        if (tab.id !== state.activeTabId) return tab;
        if (
          shallowRecordEqual(tab.formValues, values) &&
          Object.keys(tab.validationErrors).length === 0
        ) {
          return tab;
        }
        changed = true;
        return { ...tab, formValues: values, validationErrors: {} };
      });
      return changed ? { tabs } : state;
    });
  },

  setFormFields: (fields: FormFieldConfig[]) => {
    set((state) => {
      let changed = false;
      const tabs = state.tabs.map((tab) => {
        if (tab.id !== state.activeTabId) return tab;
        if (formFieldsEqual(tab.formFields, fields)) return tab;
        changed = true;
        return { ...tab, formFields: fields };
      });
      return changed ? { tabs } : state;
    });
  },

  validateForm: () => {
    const activeTab = get().getActiveTab();
    if (!activeTab) return false;

    const errors: Record<string, string> = {};
    let isValid = true;

    for (const field of activeTab.formFields) {
      if (field.required && isEmpty(activeTab.formValues[field.name])) {
        errors[field.name] = `${field.label} is required`;
        isValid = false;
      }
    }

    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? { ...tab, validationErrors: errors }
          : tab,
      ),
    }));

    return isValid;
  },

  clearValidationError: (key: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? { ...tab, validationErrors: { ...tab.validationErrors, [key]: "" } }
          : tab,
      ),
    }));
  },

  resetForm: () => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? {
              ...tab,
              formValues: {},
              validationErrors: {},
              currentPrediction: null,
              error: null,
              outputs: [],
              generationHistory: [],
              selectedHistoryIndex: null,
            }
          : tab,
      ),
    }));
  },

  runPrediction: async () => {
    const activeTab = get().getActiveTab();
    if (!activeTab) return;

    const { selectedModel, formValues, formFields } = activeTab;
    if (!selectedModel) {
      set((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.id === state.activeTabId
            ? { ...tab, error: "No model selected" }
            : tab,
        ),
      }));
      return;
    }

    // Validate required fields
    if (!get().validateForm()) {
      return;
    }

    const pendingId = `pending-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const pendingItem = createPendingGenerationItem({
      id: pendingId,
      modelId: selectedModel.model_id,
      formValues,
    });

    // Set running state, clear batch results, and add an optimistic card.
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? {
              ...tab,
              isRunning: true,
              error: null,
              currentPrediction: null,
              outputs: [],
              selectedHistoryIndex: null,
              batchState: null,
              batchResults: [],
              generationHistory: [pendingItem, ...tab.generationHistory].slice(
                0,
                200,
              ),
            }
          : tab,
      ),
    }));

    const tabId = get().activeTabId;

    // Create AbortController for this run
    const controller = new AbortController();
    if (tabId) abortControllers.set(tabId, controller);

    try {
      // Clean up form values - remove empty strings and undefined
      const cleanedInput: Record<string, unknown> = {};
      const integerFields = new Set(
        formFields.filter((f) => f.schemaType === "integer").map((f) => f.name),
      );
      for (const [key, value] of Object.entries(formValues)) {
        if (value !== "" && value !== undefined && value !== null) {
          // Ensure integer fields are sent as integers (API rejects non-integer values)
          cleanedInput[key] =
            integerFields.has(key) && typeof value === "number"
              ? Math.round(value)
              : value;
        }
      }
      const normalizedInput = normalizePayloadArrays(cleanedInput, formFields);

      const result = await apiClient.run(
        selectedModel.model_id,
        normalizedInput,
        {
          enableSyncMode: normalizedInput.enable_sync_mode as boolean,
          signal: controller.signal,
        },
      );

      // Normalize outputs: some models return [{ url: "..." }] instead of ["..."]
      const rawOutputs = result.outputs || [];
      const outputs: (string | Record<string, unknown>)[] = rawOutputs.map(
        (o) => {
          if (
            typeof o === "object" &&
            o !== null &&
            typeof (o as { url?: string }).url === "string"
          ) {
            return (o as { url: string }).url;
          }
          return o;
        },
      );

      // Build history items — split multi-media outputs into individual entries
      const historyItems: GenerationHistoryItem[] = [];

      const mediaEntries: { output: string; type: "image" | "video" }[] = [];
      for (const output of outputs) {
        if (typeof output === "string") {
          if (isImageUrl(output)) mediaEntries.push({ output, type: "image" });
          else if (isVideoUrl(output))
            mediaEntries.push({ output, type: "video" });
        }
      }

      // Snapshot form values for history recall
      const snapshotValues = { ...formValues };

      if (mediaEntries.length >= 2) {
        // Split: one history item per media output (newest/first at index 0)
        const baseId = result.id || `gen-${Date.now()}`;
        for (let i = 0; i < mediaEntries.length; i++) {
          const { output, type } = mediaEntries[i];
          historyItems.push({
            id: `${baseId}-${i}`,
            prediction: result,
            outputs: [output],
            formValues: snapshotValues,
            addedAt: Date.now() + i,
            thumbnailUrl: output,
            thumbnailType: type,
            status: "completed",
            error: null,
            modelId: selectedModel.model_id,
          });
        }
      } else {
        // Single or no media: keep as one history item
        const thumbnailUrl = mediaEntries[0]?.output ?? null;
        const thumbnailType = mediaEntries[0]?.type ?? null;
        historyItems.push({
          id: result.id || `gen-${Date.now()}`,
          prediction: result,
          outputs,
          formValues: snapshotValues,
          addedAt: Date.now(),
          thumbnailUrl,
          thumbnailType,
          status: "completed",
          error: null,
          modelId: selectedModel.model_id,
        });
      }

      // Update the specific tab (it might not be active anymore)
      set((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                currentPrediction: result,
                outputs,
                isRunning: false,
                generationHistory: [
                  ...historyItems,
                  ...tab.generationHistory.filter(
                    (item) => item.id !== pendingId,
                  ),
                ].slice(0, 50),
                selectedHistoryIndex: null,
              }
            : tab,
        ),
      }));

      // Auto-save outputs to My Assets from store layer (tab-switch safe)
      autoSaveToAssets(outputs, selectedModel.model_id, result.id);
    } catch (error) {
      // Don't show error for user-initiated abort
      const isAbort =
        error instanceof DOMException && error.name === "AbortError";
      set((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                error: isAbort
                  ? null
                  : error instanceof Error
                    ? error.message
                    : "Failed to run prediction",
                isRunning: false,
                generationHistory: isAbort
                  ? tab.generationHistory.filter(
                      (item) => item.id !== pendingId,
                    )
                  : tab.generationHistory.map((item) =>
                      item.id === pendingId
                        ? {
                            ...item,
                            status: "failed" as const,
                            error:
                              error instanceof Error
                                ? error.message
                                : "Failed to run prediction",
                            prediction: {
                              ...item.prediction,
                              status: "failed" as const,
                              error:
                                error instanceof Error
                                  ? error.message
                                  : "Failed to run prediction",
                            },
                          }
                        : item,
                    ),
              }
            : tab,
        ),
      }));
    } finally {
      if (tabId) abortControllers.delete(tabId);
    }
  },

  abortRun: () => {
    const tabId = get().activeTabId;
    if (!tabId) return;
    const controller = abortControllers.get(tabId);
    if (controller) {
      controller.abort();
    }
  },

  clearOutput: () => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? { ...tab, currentPrediction: null, outputs: [], error: null }
          : tab,
      ),
    }));
  },

  startExternalGeneration: ({ id, workspace, modelId, formValues }) => {
    const pendingItem = createPendingGenerationItem({
      id,
      modelId,
      formValues,
    });

    set((state) => {
      const targetTabId = getWorkspaceTargetTabId(state, workspace);
      if (!targetTabId) {
        const newTab = createEmptyTab(
          `tab-${++tabCounter}`,
          undefined,
          workspace,
        );
        newTab.generationHistory = [pendingItem];
        return {
          tabs: [...state.tabs, newTab],
          activeTabId: state.activeTabId ?? newTab.id,
        };
      }

      return {
        tabs: state.tabs.map((tab) =>
          tab.id === targetTabId
            ? {
                ...tab,
                error: null,
                selectedHistoryIndex: null,
                generationHistory: [
                  pendingItem,
                  ...tab.generationHistory.filter((item) => item.id !== id),
                ].slice(0, 200),
              }
            : tab,
        ),
      };
    });
    persistPlaygroundSession();
  },

  completeExternalGeneration: ({
    pendingId,
    modelId,
    prediction,
    outputs,
    formValues,
  }) => {
    const historyItems = createHistoryItemsFromOutputs({
      prediction,
      outputs,
      formValues,
      modelId,
    });

    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.generationHistory.some((item) => item.id === pendingId)
          ? {
              ...tab,
              currentPrediction: prediction,
              outputs,
              error: null,
              generationHistory: [
                ...historyItems,
                ...tab.generationHistory.filter(
                  (item) => item.id !== pendingId,
                ),
              ].slice(0, 200),
              selectedHistoryIndex: null,
            }
          : tab,
      ),
    }));
    persistPlaygroundSession();
  },

  failExternalGeneration: ({ pendingId, error }) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.generationHistory.some((item) => item.id === pendingId)
          ? {
              ...tab,
              error,
              generationHistory: tab.generationHistory.map((item) =>
                item.id === pendingId
                  ? {
                      ...item,
                      status: "failed" as const,
                      error,
                      prediction: {
                        ...item.prediction,
                        status: "failed" as const,
                        error,
                      },
                    }
                  : item,
              ),
            }
          : tab,
      ),
    }));
    persistPlaygroundSession();
  },

  // Batch processing actions
  setBatchConfig: (config: Partial<BatchConfig>) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? { ...tab, batchConfig: { ...tab.batchConfig, ...config } }
          : tab,
      ),
    }));
  },

  generateBatchInputs: () => {
    const activeTab = get().getActiveTab();
    if (!activeTab) return [];

    const { formValues, formFields, batchConfig } = activeTab;
    const count = batchConfig.repeatCount;
    // Only randomize seed if the field exists and is a number type
    const hasSeedField = formFields.some(
      (f) => f.name.toLowerCase() === "seed" && f.type === "number",
    );

    // Clean input values
    const cleanedBase: Record<string, unknown> = {};
    const integerFields = new Set(
      formFields.filter((f) => f.schemaType === "integer").map((f) => f.name),
    );
    for (const [key, value] of Object.entries(formValues)) {
      if (value !== "" && value !== undefined && value !== null) {
        cleanedBase[key] =
          integerFields.has(key) && typeof value === "number"
            ? Math.round(value)
            : value;
      }
    }

    // Generate inputs with incremental seeds
    const inputs: Record<string, unknown>[] = [];
    const baseSeed = Math.floor(Math.random() * 65536);

    for (let i = 0; i < count; i++) {
      const input = { ...cleanedBase };
      if (batchConfig.randomizeSeed && hasSeedField) {
        input.seed = (baseSeed + i) % 65536;
      }
      inputs.push(input);
    }

    return inputs;
  },

  runBatch: async () => {
    const activeTab = get().getActiveTab();
    if (!activeTab) return;

    const { selectedModel, formFields, formValues } = activeTab;
    if (!selectedModel) {
      set((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.id === state.activeTabId
            ? { ...tab, error: "No model selected" }
            : tab,
        ),
      }));
      return;
    }

    // Validate required fields first
    if (!get().validateForm()) {
      return;
    }

    // Snapshot form values for history recall
    const batchSnapshotValues = { ...formValues };

    // Generate batch inputs
    const inputs = get().generateBatchInputs();
    if (inputs.length === 0) {
      return;
    }

    // Initialize batch state
    const queue = inputs.map((input, index) => ({
      id: `batch-${index}`,
      index,
      input,
      status: "pending" as const,
    }));
    const pendingItems = inputs.map((_, index) =>
      createPendingGenerationItem({
        id: `pending-batch-${Date.now()}-${index}-${Math.random()
          .toString(36)
          .slice(2)}`,
        modelId: selectedModel.model_id,
        formValues: batchSnapshotValues,
        addedAt: Date.now() + index,
      }),
    );
    const pendingIds = pendingItems.map((item) => item.id);

    const tabId = get().activeTabId;

    // Create AbortController for this batch run
    const controller = new AbortController();
    if (tabId) abortControllers.set(tabId, controller);

    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              isRunning: true,
              error: null,
              selectedHistoryIndex: null,
              batchState: {
                isRunning: true,
                queue,
                currentIndex: 0,
                completedCount: 0,
                failedCount: 0,
                cancelRequested: false,
              },
              batchResults: [],
              generationHistory: [
                ...pendingItems,
                ...tab.generationHistory,
              ].slice(0, 200),
            }
          : tab,
      ),
    }));

    // Set all items to running status
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId && tab.batchState
          ? {
              ...tab,
              batchState: {
                ...tab.batchState,
                queue: tab.batchState.queue.map((item) => ({
                  ...item,
                  status: "running" as const,
                })),
              },
            }
          : tab,
      ),
    }));

    // Process all requests concurrently
    const results: BatchResult[] = new Array(inputs.length);

    const promises = inputs.map(async (input, i) => {
      const startTime = Date.now();
      const normalizedInput = normalizePayloadArrays(input, formFields);
      try {
        const result = await apiClient.run(
          selectedModel.model_id,
          normalizedInput,
          {
            enableSyncMode: normalizedInput.enable_sync_mode as boolean,
            signal: controller.signal,
          },
        );
        const timing = Date.now() - startTime;

        // Normalize outputs: some models return [{ url: "..." }] instead of ["..."]
        const batchOutputs: (string | Record<string, unknown>)[] = (
          result.outputs || []
        ).map((o) => {
          if (
            typeof o === "object" &&
            o !== null &&
            typeof (o as { url?: string }).url === "string"
          ) {
            return (o as { url: string }).url;
          }
          return o;
        });

        results[i] = {
          id: queue[i].id,
          index: i,
          input,
          prediction: result,
          outputs: batchOutputs,
          error: null,
          timing,
        };

        // Build history items for this single batch result
        const itemHistoryEntries: GenerationHistoryItem[] = [];
        for (const output of batchOutputs) {
          if (typeof output === "string") {
            const mType = isImageUrl(output)
              ? ("image" as const)
              : isVideoUrl(output)
                ? ("video" as const)
                : null;
            if (mType) {
              itemHistoryEntries.push({
                id: `${result.id || queue[i].id}-${itemHistoryEntries.length}`,
                prediction: result,
                outputs: [output],
                formValues: batchSnapshotValues,
                addedAt: Date.now() + itemHistoryEntries.length,
                thumbnailUrl: output,
                thumbnailType: mType,
                status: "completed",
                error: null,
                modelId: selectedModel.model_id,
              });
            }
          }
        }
        if (itemHistoryEntries.length === 0) {
          itemHistoryEntries.push({
            id: result.id || queue[i].id,
            prediction: result,
            outputs: batchOutputs,
            formValues: batchSnapshotValues,
            addedAt: Date.now(),
            thumbnailUrl: null,
            thumbnailType: null,
            status: "completed",
            error: null,
            modelId: selectedModel.model_id,
          });
        }

        // Update state for this completed item + add to history immediately
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId && tab.batchState
              ? {
                  ...tab,
                  batchState: {
                    ...tab.batchState,
                    completedCount: tab.batchState.completedCount + 1,
                    queue: tab.batchState.queue.map((item, idx) =>
                      idx === i
                        ? { ...item, status: "completed" as const, result }
                        : item,
                    ),
                  },
                  batchResults: results.filter(Boolean),
                  generationHistory: [
                    ...itemHistoryEntries,
                    ...tab.generationHistory.filter(
                      (historyItem) => historyItem.id !== pendingIds[i],
                    ),
                  ].slice(0, 200),
                }
              : tab,
          ),
        }));

        // Auto-save outputs to My Assets from store layer (tab-switch safe)
        autoSaveToAssets(batchOutputs, selectedModel.model_id, result.id);
      } catch (error) {
        // Skip state updates for aborted requests
        const isAbort =
          error instanceof DOMException && error.name === "AbortError";
        if (isAbort) return;

        const errorMessage =
          error instanceof Error ? error.message : "Failed to run prediction";
        const timing = Date.now() - startTime;

        results[i] = {
          id: queue[i].id,
          index: i,
          input,
          prediction: null,
          outputs: [],
          error: errorMessage,
          timing,
        };

        // Update state for this failed item
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId && tab.batchState
              ? {
                  ...tab,
                  batchState: {
                    ...tab.batchState,
                    failedCount: tab.batchState.failedCount + 1,
                    queue: tab.batchState.queue.map((item, idx) =>
                      idx === i
                        ? {
                            ...item,
                            status: "failed" as const,
                            error: errorMessage,
                          }
                        : item,
                    ),
                  },
                  batchResults: results.filter(Boolean),
                  generationHistory: tab.generationHistory.map((historyItem) =>
                    historyItem.id === pendingIds[i]
                      ? {
                          ...historyItem,
                          status: "failed" as const,
                          error: errorMessage,
                          prediction: {
                            ...historyItem.prediction,
                            status: "failed" as const,
                            error: errorMessage,
                          },
                        }
                      : historyItem,
                  ),
                }
              : tab,
          ),
        }));
      }
    });

    // Wait for all to complete
    await Promise.all(promises);

    // Finalize batch (history already updated per-item above)
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              isRunning: false,
              error: null,
              batchState: tab.batchState
                ? { ...tab.batchState, isRunning: false }
                : null,
              batchResults: results.filter(Boolean),
              generationHistory: controller.signal.aborted
                ? tab.generationHistory.filter(
                    (item) => !pendingIds.includes(item.id),
                  )
                : tab.generationHistory,
            }
          : tab,
      ),
    }));

    if (tabId) abortControllers.delete(tabId);
  },

  cancelBatch: () => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId && tab.batchState
          ? {
              ...tab,
              batchState: { ...tab.batchState, cancelRequested: true },
            }
          : tab,
      ),
    }));
  },

  clearBatchResults: () => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? {
              ...tab,
              batchState: null,
              batchResults: [],
              error: null,
            }
          : tab,
      ),
    }));
  },

  setUploading: (isUploading: boolean) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? {
              ...tab,
              uploadingCount: Math.max(
                0,
                tab.uploadingCount + (isUploading ? 1 : -1),
              ),
            }
          : tab,
      ),
    }));
  },

  selectHistoryItem: (index: number | null) => {
    set((state) => {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
      const historyItem =
        activeTab && index !== null ? activeTab.generationHistory[index] : null;
      // Restore form values from history if available
      const restoredValues = historyItem?.formValues;

      return {
        tabs: state.tabs.map((tab) =>
          tab.id === state.activeTabId
            ? {
                ...tab,
                selectedHistoryIndex: index,
                batchState: null,
                batchResults: [],
                ...(restoredValues ? { formValues: restoredValues } : {}),
              }
            : tab,
        ),
      };
    });
  },

  consumePendingFormValues: () => {
    const activeTab = get().getActiveTab();
    if (!activeTab?.pendingFormValues) return null;
    const pending = activeTab.pendingFormValues;
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? { ...tab, pendingFormValues: null }
          : tab,
      ),
    }));
    return pending;
  },

  findFormValuesByPredictionId: (predictionId: string) => {
    const tabs = get().tabs;
    for (const tab of tabs) {
      for (const item of tab.generationHistory) {
        if (item.prediction?.id === predictionId || item.id === predictionId) {
          if (item.formValues && Object.keys(item.formValues).length > 0) {
            return item.formValues;
          }
        }
      }
    }
    return null;
  },
}));
