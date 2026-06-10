import { create } from "zustand";
import {
  API_SERVICE_PRESETS,
  DEFAULT_API_BASE_URL,
  apiClient,
  type ApiServiceId,
} from "@/api/client";
import { useModelsStore } from "@/stores/modelsStore";

const SERVICE_STORAGE_KEY = "wavespeed_api_service_config";

export interface ApiServiceConfig {
  serviceId: ApiServiceId;
  customBaseUrl: string;
}

interface ApiServiceState extends ApiServiceConfig {
  baseUrl: string;
  isLoading: boolean;
  hasLoaded: boolean;
  loadServiceConfig: (force?: boolean) => Promise<void>;
  setServiceConfig: (config: Partial<ApiServiceConfig>) => Promise<void>;
  resolveBaseUrl: (config?: Partial<ApiServiceConfig>) => string;
}

const DEFAULT_SERVICE_CONFIG: ApiServiceConfig = {
  serviceId: "wavespeed",
  customBaseUrl: "",
};

function normalizeBaseUrl(value?: string | null): string {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function resolveBaseUrlFromConfig(config: Partial<ApiServiceConfig>): string {
  const serviceId = config.serviceId || DEFAULT_SERVICE_CONFIG.serviceId;
  if (serviceId === "custom") {
    return normalizeBaseUrl(config.customBaseUrl) || DEFAULT_API_BASE_URL;
  }
  return API_SERVICE_PRESETS[serviceId]?.baseUrl || DEFAULT_API_BASE_URL;
}

async function loadStoredConfig(): Promise<ApiServiceConfig> {
  if (window.electronAPI?.getSettings) {
    const settings = await window.electronAPI.getSettings();
    return {
      serviceId:
        (settings.apiServiceId as ApiServiceId | undefined) ||
        DEFAULT_SERVICE_CONFIG.serviceId,
      customBaseUrl: String(settings.customApiBaseUrl || ""),
    };
  }

  try {
    const raw = localStorage.getItem(SERVICE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      serviceId: parsed.serviceId || DEFAULT_SERVICE_CONFIG.serviceId,
      customBaseUrl: String(parsed.customBaseUrl || ""),
    };
  } catch {
    return DEFAULT_SERVICE_CONFIG;
  }
}

async function saveStoredConfig(config: ApiServiceConfig): Promise<void> {
  if (window.electronAPI?.setSettings) {
    await window.electronAPI.setSettings({
      apiServiceId: config.serviceId,
      customApiBaseUrl: config.customBaseUrl,
      apiBaseUrl: resolveBaseUrlFromConfig(config),
    });
    return;
  }
  localStorage.setItem(SERVICE_STORAGE_KEY, JSON.stringify(config));
}

export const useApiServiceStore = create<ApiServiceState>((set, get) => ({
  ...DEFAULT_SERVICE_CONFIG,
  baseUrl: DEFAULT_API_BASE_URL,
  isLoading: false,
  hasLoaded: false,

  resolveBaseUrl: (config = {}) =>
    resolveBaseUrlFromConfig({
      serviceId: config.serviceId || get().serviceId,
      customBaseUrl:
        config.customBaseUrl === undefined
          ? get().customBaseUrl
          : config.customBaseUrl,
    }),

  loadServiceConfig: async (force?: boolean) => {
    if (get().hasLoaded && !force) return;
    set({ isLoading: true, hasLoaded: true });
    try {
      const stored = await loadStoredConfig();
      const next: ApiServiceConfig = {
        serviceId: stored.serviceId || "wavespeed",
        customBaseUrl: normalizeBaseUrl(stored.customBaseUrl),
      };
      const baseUrl = resolveBaseUrlFromConfig(next);
      apiClient.setBaseUrl(baseUrl);
      useModelsStore.getState().loadCachedModelsForCurrentService();
      set({ ...next, baseUrl });
    } finally {
      set({ isLoading: false });
    }
  },

  setServiceConfig: async (config) => {
    const next: ApiServiceConfig = {
      serviceId: config.serviceId || get().serviceId,
      customBaseUrl:
        config.customBaseUrl === undefined
          ? get().customBaseUrl
          : normalizeBaseUrl(config.customBaseUrl),
    };
    const baseUrl = resolveBaseUrlFromConfig(next);
    apiClient.setBaseUrl(baseUrl);
    useModelsStore.getState().loadCachedModelsForCurrentService();
    await saveStoredConfig(next);
    set({ ...next, baseUrl, hasLoaded: true });
    await useModelsStore.getState().fetchModels(true);
  },
}));
