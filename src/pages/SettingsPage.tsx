import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useApiKeyStore } from "@/stores/apiKeyStore";
import {
  API_SERVICE_PRESETS,
  apiClient,
  type ApiServiceId,
  type BalanceTransaction,
} from "@/api/client";
import { useApiServiceStore } from "@/stores/apiServiceStore";
import { useThemeStore, type Theme } from "@/stores/themeStore";
import { useAssetsStore } from "@/stores/assetsStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { languages } from "@/i18n";
import {
  FREE_TOOL_MODEL_DOWNLOADS,
  type FreeToolModelDownload,
} from "@/lib/freeToolModels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/useToast";
import {
  Eye,
  EyeOff,
  Check,
  Loader2,
  Monitor,
  Moon,
  Sun,
  Download,
  RefreshCw,
  Rocket,
  AlertCircle,
  Shield,
  Globe,
  FolderOpen,
  Trash2,
  Database,
  ChevronRight,
  X,
  Clock,
  Settings,
  ReceiptText,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface CacheItem {
  cacheName: string;
  url: string;
  size: number;
  type?: "browser" | "sd-model" | "sd-auxiliary" | "sd-binary"; // browser: browser cache, sd-model: SD models, sd-auxiliary: LLM/VAE, sd-binary: SD binary
  modelType?: "llm" | "vae"; // for sd-auxiliary models
}

interface PredownloadState {
  downloaded: boolean;
  downloading: boolean;
  progress: number;
  error: string | null;
  current?: number;
  total?: number;
}

type UpdateChannel = "stable" | "nightly";

interface UpdateStatus {
  status: string;
  version?: string;
  releaseNotes?: string | null;
  percent?: number;
  message?: string;
}

function createPredownloadStates() {
  return FREE_TOOL_MODEL_DOWNLOADS.reduce<Record<string, PredownloadState>>(
    (states, model) => {
      states[model.id] = {
        downloaded: false,
        downloading: false,
        progress: 0,
        error: null,
      };
      return states;
    },
    {},
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function getBalanceTransactionTypeLabel(type: string) {
  const labels: Record<string, string> = {
    CONSUME: "消费",
    REFUND: "退款",
    RECHARGE: "充值",
    ADMIN_ADJUST: "后台调整",
    MANUAL_CORRECTION: "人工修正",
  };
  return labels[type] || type || "其他";
}

function getBalanceTransactionSignedAmount(item: BalanceTransaction) {
  const rawAmount = Number(item.amount || 0);
  const balanceDelta =
    Number(item.balance_after || 0) - Number(item.balance_before || 0);
  const normalizedType = String(item.type || "").toUpperCase();
  const isDebit = ["CONSUME", "DEDUCT", "CHARGE"].includes(normalizedType);
  const isCredit = ["RECHARGE", "REFUND"].includes(normalizedType);

  if (isDebit) {
    const debitAmount = rawAmount === 0 ? Math.abs(balanceDelta) : rawAmount;
    return -Math.abs(debitAmount);
  }
  if (isCredit) {
    const creditAmount = rawAmount === 0 ? Math.abs(balanceDelta) : rawAmount;
    return Math.abs(creditAmount);
  }
  if (rawAmount !== 0) return rawAmount;
  return balanceDelta;
}

function formatCnyAmount(value: number, precision = 4) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}¥${Math.abs(value).toFixed(precision)}`;
}

function getBalanceTransactionDescription(item: BalanceTransaction) {
  const description = String(item.description || "").trim();
  if (description) return description;
  const referenceId = String(item.reference_id || "").trim();
  if (referenceId) return referenceId;
  return "余额变动";
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const {
    apiKey,
    setApiKey,
    isValidated,
    isValidating: storeIsValidating,
    validateApiKey,
  } = useApiKeyStore();
  const { theme, setTheme } = useThemeStore();
  const {
    serviceId,
    customBaseUrl,
    baseUrl,
    loadServiceConfig,
    setServiceConfig,
    resolveBaseUrl,
  } = useApiServiceStore();
  const {
    settings: assetsSettings,
    loadSettings: loadAssetsSettings,
    setAutoSave,
    setAssetsDirectory,
  } = useAssetsStore();
  const {
    settings: generalSettings,
    setDownloadTimeout,
    initSettings: initGeneralSettings,
  } = useSettingsStore();
  const [inputKey, setInputKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [serviceDraft, setServiceDraft] = useState<ApiServiceId>(serviceId);
  const [customBaseUrlDraft, setCustomBaseUrlDraft] = useState(customBaseUrl);
  const [isSavingService, setIsSavingService] = useState(false);

  // Sync inputKey when apiKey loads from storage
  useEffect(() => {
    setInputKey(apiKey);
  }, [apiKey]);

  useEffect(() => {
    setServiceDraft(
      serviceId === "ideart-production" ? serviceId : "ideart-production",
    );
    setCustomBaseUrlDraft(customBaseUrl);
  }, [customBaseUrl, serviceId]);

  // Balance state
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [showBalanceTransactions, setShowBalanceTransactions] = useState(false);
  const [balanceTransactions, setBalanceTransactions] = useState<
    BalanceTransaction[]
  >([]);
  const [balanceTransactionsPage, setBalanceTransactionsPage] = useState(1);
  const [balanceTransactionsTotalPages, setBalanceTransactionsTotalPages] =
    useState(1);
  const [balanceTransactionsTotal, setBalanceTransactionsTotal] = useState(0);
  const [isLoadingBalanceTransactions, setIsLoadingBalanceTransactions] =
    useState(false);

  // Update state
  const [appVersion, setAppVersion] = useState<string>("");
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>("stable");
  const [autoCheckUpdate, setAutoCheckUpdate] = useState<boolean>(true);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Cache state
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheItems, setCacheItems] = useState<CacheItem[]>([]);
  const [showCacheDialog, setShowCacheDialog] = useState(false);
  const [isDeletingItem, setIsDeletingItem] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [predownloadStates, setPredownloadStates] = useState(
    createPredownloadStates,
  );
  const [isPredownloading, setIsPredownloading] = useState(false);

  // Get the saved language preference (including 'auto')
  const [languagePreference, setLanguagePreference] = useState(() => {
    return localStorage.getItem("wavespeed_language") || "auto";
  });

  const handleLanguageChange = useCallback(
    (langCode: string) => {
      setLanguagePreference(langCode);
      localStorage.setItem("wavespeed_language", langCode);
      if (window.electronAPI?.setSettings) {
        window.electronAPI.setSettings({ language: langCode });
      }

      if (langCode === "auto") {
        // Detect browser language
        const browserLang = navigator.language || "en";
        // Find matching language or fallback to 'en'
        const supportedLangs = [
          "en",
          "zh-CN",
          "zh-TW",
          "ja",
          "ko",
          "es",
          "fr",
          "de",
          "it",
          "ru",
          "pt",
          "hi",
          "id",
          "ms",
          "th",
          "vi",
          "tr",
          "ar",
        ];
        const matchedLang =
          supportedLangs.find((l) => browserLang.startsWith(l.split("-")[0])) ||
          "en";
        i18n.changeLanguage(matchedLang);
      } else {
        i18n.changeLanguage(langCode);
      }

      toast({
        title: t("settings.language.changed"),
        description: t("settings.language.changedDesc"),
      });
    },
    [i18n, t],
  );

  // Load cache details (browser caches + SD models)
  const loadCacheDetails = useCallback(async () => {
    try {
      const items: CacheItem[] = [];
      let totalSize = 0;

      // 1. Load browser cache (Image Eraser, etc.)
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const request of keys) {
          const response = await cache.match(request);
          if (response) {
            const blob = await response.blob();
            items.push({
              cacheName: name,
              url: request.url,
              size: blob.size,
              type: "browser",
            });
            totalSize += blob.size;
          }
        }
      }

      // 2. Load SD auxiliary models (LLM, VAE)
      if (window.electronAPI?.sdListAuxiliaryModels) {
        const result = await window.electronAPI.sdListAuxiliaryModels();
        if (result.success && result.models) {
          for (const model of result.models) {
            items.push({
              cacheName: "z-image-auxiliary",
              url: model.path,
              size: model.size,
              type: "sd-auxiliary",
              modelType: model.type,
            });
            totalSize += model.size;
          }
        }
      }

      // 3. Load SD models
      if (window.electronAPI?.sdListModels) {
        const result = await window.electronAPI.sdListModels();
        if (result.success && result.models) {
          for (const model of result.models) {
            items.push({
              cacheName: "z-image-models",
              url: model.path,
              size: model.size,
              type: "sd-model",
            });
            totalSize += model.size;
          }
        }
      }

      // 4. Load SD binary
      if (window.electronAPI?.sdGetBinaryPath) {
        const result = await window.electronAPI.sdGetBinaryPath();
        if (result.success && result.path) {
          try {
            // Use Node.js fs to get binary size
            if (window.electronAPI?.getFileSize) {
              const size = await window.electronAPI.getFileSize(result.path);
              items.push({
                cacheName: "z-image-binary",
                url: result.path,
                size: size,
                type: "sd-binary",
              });
              totalSize += size;
            }
          } catch (error) {
            console.error("Failed to get SD binary size:", error);
          }
        }
      }

      setCacheItems(items);
      setCacheSize(totalSize);
    } catch (error) {
      console.error("Failed to load cache details:", error);
      setCacheItems([]);
      setCacheSize(0);
    }
  }, []);

  // Calculate cache size (calls loadCacheDetails)
  const calculateCacheSize = useCallback(async () => {
    await loadCacheDetails();
  }, [loadCacheDetails]);

  const loadPredownloadStatus = useCallback(async () => {
    const nextStates = createPredownloadStates();

    await Promise.all(
      FREE_TOOL_MODEL_DOWNLOADS.map(async (model) => {
        try {
          const cache = await caches.open(model.cacheName);
          const response = await cache.match(model.url);
          if (!response) return;

          const blob = await response.blob();
          nextStates[model.id] = {
            downloaded: true,
            downloading: false,
            progress: 100,
            error: null,
            current: blob.size,
            total: blob.size,
          };
        } catch (error) {
          nextStates[model.id] = {
            ...nextStates[model.id],
            error: (error as Error).message,
          };
        }
      }),
    );

    setPredownloadStates(nextStates);
  }, []);

  const updatePredownloadState = useCallback(
    (id: string, patch: Partial<PredownloadState>) => {
      setPredownloadStates((states) => ({
        ...states,
        [id]: {
          ...(states[id] ?? {
            downloaded: false,
            downloading: false,
            progress: 0,
            error: null,
          }),
          ...patch,
        },
      }));
    },
    [],
  );

  const downloadPredownloadModel = useCallback(
    async (model: FreeToolModelDownload) => {
      const cache = await caches.open(model.cacheName);
      const cachedResponse = await cache.match(model.url);
      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        updatePredownloadState(model.id, {
          downloaded: true,
          downloading: false,
          progress: 100,
          error: null,
          current: blob.size,
          total: blob.size,
        });
        return "cached";
      }

      const controller = new AbortController();
      const timeoutMs = generalSettings.downloadTimeout * 1000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const downloadTimedOutMessage = t("settings.cache.downloadTimedOut");

      updatePredownloadState(model.id, {
        downloaded: false,
        downloading: true,
        progress: 0,
        error: null,
        current: 0,
        total: model.size,
      });

      try {
        const response = await fetch(model.url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to download model: ${response.status}`);
        }

        const contentLength = response.headers.get("content-length");
        const total = contentLength ? parseInt(contentLength, 10) : model.size;
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Failed to read model response");

        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          if (controller.signal.aborted) {
            await reader.cancel();
            throw new Error(downloadTimedOutMessage);
          }

          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          updatePredownloadState(model.id, {
            progress: total > 0 ? (received / total) * 100 : 0,
            current: received,
            total,
          });
        }

        const buffer = new Uint8Array(received);
        let position = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, position);
          position += chunk.length;
        }

        await cache.put(
          model.url,
          new Response(buffer, {
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Length": buffer.byteLength.toString(),
            },
          }),
        );

        updatePredownloadState(model.id, {
          downloaded: true,
          downloading: false,
          progress: 100,
          error: null,
          current: received,
          total: received,
        });
        return "downloaded";
      } catch (error) {
        const isAbortError =
          controller.signal.aborted || (error as Error).name === "AbortError";
        const message = isAbortError
          ? downloadTimedOutMessage
          : (error as Error).message || t("settings.cache.clearFailed");
        updatePredownloadState(model.id, {
          downloading: false,
          error: message,
        });
        throw new Error(message);
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [generalSettings.downloadTimeout, t, updatePredownloadState],
  );

  const handlePredownloadModels = useCallback(async () => {
    setIsPredownloading(true);
    let downloadedCount = 0;
    let cachedCount = 0;

    try {
      for (const model of FREE_TOOL_MODEL_DOWNLOADS) {
        const result = await downloadPredownloadModel(model);
        if (result === "downloaded") downloadedCount++;
        else cachedCount++;
      }

      await Promise.all([loadCacheDetails(), loadPredownloadStatus()]);
      toast({
        title: t("settings.cache.downloadComplete"),
        description: t("settings.cache.downloadCompleteDesc"),
      });
    } catch (error) {
      await Promise.all([loadCacheDetails(), loadPredownloadStatus()]);
      toast({
        title:
          downloadedCount > 0 || cachedCount > 0
            ? t("settings.cache.downloadPartial")
            : t("common.error"),
        description:
          (error as Error).message || t("settings.cache.clearFailed"),
        variant:
          downloadedCount > 0 || cachedCount > 0 ? "default" : "destructive",
      });
    } finally {
      setIsPredownloading(false);
    }
  }, [downloadPredownloadModel, loadCacheDetails, loadPredownloadStatus, t]);

  // Fetch account balance
  const fetchBalance = useCallback(async () => {
    if (!isValidated) return;
    setIsLoadingBalance(true);
    try {
      const bal = await apiClient.getBalance();
      setBalance(bal);
    } catch {
      toast({
        title: t("common.error"),
        description: t("settings.balance.refreshFailed"),
        variant: "destructive",
      });
    } finally {
      setIsLoadingBalance(false);
    }
  }, [isValidated, t]);

  const fetchBalanceTransactions = useCallback(
    async (page = 1) => {
      if (!isValidated) return;
      setIsLoadingBalanceTransactions(true);
      try {
        const result = await apiClient.getBalanceTransactions(page, 20);
        setBalanceTransactions(result.items || []);
        setBalanceTransactionsPage(result.page || page);
        setBalanceTransactionsTotalPages(result.total_pages || 1);
        setBalanceTransactionsTotal(result.total || 0);
      } catch {
        toast({
          title: t("common.error"),
          description: t(
            "settings.balance.transactionsRefreshFailed",
            "Failed to fetch balance transactions",
          ),
          variant: "destructive",
        });
      } finally {
        setIsLoadingBalanceTransactions(false);
      }
    },
    [isValidated, t],
  );

  const openBalanceTransactions = useCallback(() => {
    setShowBalanceTransactions(true);
    void fetchBalanceTransactions(1);
  }, [fetchBalanceTransactions]);

  // Delete a single cache item
  const handleDeleteCacheItem = useCallback(
    async (item: CacheItem) => {
      setIsDeletingItem(item.url);
      try {
        if (item.type === "browser") {
          // Delete from browser cache
          const cache = await caches.open(item.cacheName);
          await cache.delete(item.url);
        } else if (item.type === "sd-auxiliary" && item.modelType) {
          // Delete SD auxiliary model (LLM or VAE)
          if (window.electronAPI?.sdDeleteAuxiliaryModel) {
            const result = await window.electronAPI.sdDeleteAuxiliaryModel(
              item.modelType,
            );
            if (!result.success) {
              throw new Error(result.error || "Failed to delete model");
            }
          }
        } else if (item.type === "sd-model") {
          // Delete SD model
          if (window.electronAPI?.sdDeleteModel) {
            const result = await window.electronAPI.sdDeleteModel(item.url);
            if (!result.success) {
              throw new Error(result.error || "Failed to delete model");
            }
          }
        } else if (item.type === "sd-binary") {
          // Delete SD binary
          if (window.electronAPI?.sdDeleteBinary) {
            const result = await window.electronAPI.sdDeleteBinary();
            if (!result.success) {
              throw new Error(result.error || "Failed to delete binary");
            }
          }
        }

        await Promise.all([loadCacheDetails(), loadPredownloadStatus()]);
        toast({
          title: t("common.success"),
          description: t("settings.cache.itemDeleted"),
        });
      } catch (error) {
        toast({
          title: t("common.error"),
          description:
            (error as Error).message || t("settings.cache.clearFailed"),
          variant: "destructive",
        });
      } finally {
        setIsDeletingItem(null);
      }
    },
    [loadCacheDetails, loadPredownloadStatus, t],
  );

  // Clear all caches
  const handleClearCache = useCallback(async () => {
    setIsClearingCache(true);
    try {
      // 1. Clear browser caches
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));

      // 2. Clear SD auxiliary models (LLM, VAE)
      if (window.electronAPI?.sdDeleteAuxiliaryModel) {
        await window.electronAPI
          .sdDeleteAuxiliaryModel("llm")
          .catch(console.error);
        await window.electronAPI
          .sdDeleteAuxiliaryModel("vae")
          .catch(console.error);
      }

      // 3. Clear SD models
      const electronApi = window.electronAPI;
      if (electronApi?.sdListModels && electronApi?.sdDeleteModel) {
        const result = await electronApi.sdListModels();
        if (result.success && result.models) {
          await Promise.all(
            result.models.map((model) =>
              electronApi.sdDeleteModel(model.path).catch(console.error),
            ),
          );
        }
      }

      // 4. Clear SD binary
      if (window.electronAPI?.sdDeleteBinary) {
        await window.electronAPI.sdDeleteBinary().catch(console.error);
      }

      setCacheSize(0);
      setCacheItems([]);
      setPredownloadStates(createPredownloadStates());
      setShowCacheDialog(false);
      toast({
        title: t("settings.cache.cleared"),
        description: t("settings.cache.clearedDesc"),
      });
    } catch {
      toast({
        title: t("common.error"),
        description: t("settings.cache.clearFailed"),
        variant: "destructive",
      });
    } finally {
      setIsClearingCache(false);
    }
  }, [t]);

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // Get display name from cache item
  const getDisplayName = (item: CacheItem) => {
    if (item.type === "sd-auxiliary") {
      return item.modelType === "llm"
        ? "Qwen3-4B LLM (2.4 GB)"
        : "Z-Image VAE (335 MB)";
    } else if (item.type === "sd-model") {
      // Extract filename from path
      const filename = item.url.split(/[\\/]/).pop() || item.url;
      return filename.replace(".gguf", "");
    } else if (item.type === "sd-binary") {
      // SD binary
      return "stable-diffusion (SD Binary)";
    } else {
      // Browser cache
      try {
        const urlObj = new URL(item.url);
        const path = urlObj.pathname;
        const filename = path.split("/").pop() || path;
        return filename.length > 40 ? filename.slice(0, 37) + "..." : filename;
      } catch {
        return item.url.slice(0, 40);
      }
    }
  };

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      if (window.electronAPI) {
        const version = await window.electronAPI.getAppVersion();
        setAppVersion(version);

        const settings = await window.electronAPI.getSettings();
        setUpdateChannel(settings.updateChannel || "stable");
        setAutoCheckUpdate(settings.autoCheckUpdate !== false);
        if (settings.language) {
          setLanguagePreference(settings.language);
          localStorage.setItem("wavespeed_language", settings.language);
        }
      }
      await loadServiceConfig();
      // Load assets settings
      loadAssetsSettings();
      // Load general settings
      initGeneralSettings();
      // Calculate cache size
      calculateCacheSize();
      loadPredownloadStatus();
    };
    loadSettings();
  }, [
    loadAssetsSettings,
    loadServiceConfig,
    initGeneralSettings,
    calculateCacheSize,
    loadPredownloadStatus,
  ]);

  // Fetch balance when authenticated
  useEffect(() => {
    if (isValidated) {
      fetchBalance();
    } else {
      setBalance(null);
    }
  }, [isValidated, fetchBalance]);

  // Subscribe to update status events
  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;

    const unsubscribe = window.electronAPI.onUpdateStatus((status) => {
      setUpdateStatus(status);

      if (status.status === "checking") {
        setIsCheckingUpdate(true);
      } else {
        setIsCheckingUpdate(false);
      }

      if (status.status === "downloading") {
        setIsDownloading(true);
      } else if (status.status === "downloaded" || status.status === "error") {
        setIsDownloading(false);
      }
    });

    return unsubscribe;
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (serviceDraft === "custom" && !customBaseUrlDraft.trim()) {
        toast({
          title: "默认服务未保存",
          description: "请先填写自定义服务地址，或选择一个预设服务。",
          variant: "destructive",
        });
        return;
      }
      if (
        serviceDraft !== serviceId ||
        customBaseUrlDraft.trim() !== customBaseUrl
      ) {
        await setServiceConfig({
          serviceId: serviceDraft,
          customBaseUrl: customBaseUrlDraft,
        });
      }
      const isValid = await setApiKey(inputKey);
      if (isValid) {
        toast({
          title: t("settings.apiKey.saved"),
          description: t("settings.apiKey.savedDesc"),
        });
      } else {
        toast({
          title: t("settings.apiKey.invalid"),
          description: t("settings.apiKey.invalidDesc"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: t("settings.apiKey.error"),
        description: t("settings.apiKey.errorDesc"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveService = async () => {
    setIsSavingService(true);
    try {
      await setServiceConfig({
        serviceId: serviceDraft,
        customBaseUrl: customBaseUrlDraft,
      });
      if (apiKey) {
        await validateApiKey();
      }
      toast({
        title: "默认服务已保存",
        description: `当前桌面端 API 服务：${resolveBaseUrl({
          serviceId: serviceDraft,
          customBaseUrl: customBaseUrlDraft,
        })}`,
      });
    } catch {
      toast({
        title: t("common.error"),
        description: "默认服务保存失败",
        variant: "destructive",
      });
    } finally {
      setIsSavingService(false);
    }
  };

  const handleClear = async () => {
    setInputKey("");
    await setApiKey("");
    toast({
      title: t("settings.apiKey.cleared"),
      description: t("settings.apiKey.clearedDesc"),
    });
  };

  const handleChannelChange = useCallback(
    async (channel: UpdateChannel) => {
      setUpdateChannel(channel);
      setUpdateStatus(null);
      if (window.electronAPI?.setUpdateChannel) {
        await window.electronAPI.setUpdateChannel(channel);
        toast({
          title: t("settings.updates.channelChanged"),
          description: t("settings.updates.channelChangedDesc", { channel }),
        });
      }
    },
    [t],
  );

  const handleAutoCheckUpdateChange = useCallback(async (checked: boolean) => {
    setAutoCheckUpdate(checked);
    if (window.electronAPI?.setSettings) {
      await window.electronAPI.setSettings({ autoCheckUpdate: checked });
    }
  }, []);

  const handleAutoSaveAssetsChange = useCallback(
    async (checked: boolean) => {
      await setAutoSave(checked);
      toast({
        title: checked
          ? t("settings.assets.autoSaveEnabled")
          : t("settings.assets.autoSaveDisabled"),
        description: checked
          ? t("settings.assets.autoSaveEnabledDesc")
          : t("settings.assets.autoSaveDisabledDesc"),
      });
    },
    [setAutoSave, t],
  );

  const handleSelectAssetsDirectory = useCallback(async () => {
    if (!window.electronAPI?.selectDirectory) {
      toast({
        title: t("common.error"),
        description: t("settings.assets.desktopOnly"),
        variant: "destructive",
      });
      return;
    }

    const result = await window.electronAPI.selectDirectory();
    if (result.success && result.path) {
      await setAssetsDirectory(result.path);
      toast({
        title: t("settings.assets.directoryChanged"),
        description: t("settings.assets.directoryChangedDesc", {
          path: result.path,
        }),
      });
    }
  }, [setAssetsDirectory, t]);

  const handleCheckForUpdates = useCallback(async () => {
    if (!window.electronAPI?.checkForUpdates) {
      toast({
        title: t("settings.updates.devMode"),
        description: t("settings.updates.notAvailableInDev"),
        variant: "destructive",
      });
      return;
    }

    setIsCheckingUpdate(true);
    setUpdateStatus(null);

    try {
      const result = await window.electronAPI.checkForUpdates();
      if (result.status === "dev-mode") {
        toast({
          title: t("settings.updates.devMode"),
          description: t("settings.updates.devModeDesc"),
        });
      } else if (result.status === "error") {
        toast({
          title: t("settings.updates.checkFailed"),
          description: result.message || t("settings.updates.checkFailed"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: t("common.error"),
        description: t("settings.updates.checkFailed"),
        variant: "destructive",
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [t]);

  const handleDownloadUpdate = useCallback(async () => {
    if (!window.electronAPI?.downloadUpdate) return;

    setIsDownloading(true);
    try {
      await window.electronAPI.downloadUpdate();
    } catch {
      toast({
        title: t("settings.updates.downloadFailed"),
        description: t("settings.updates.downloadFailedDesc"),
        variant: "destructive",
      });
      setIsDownloading(false);
    }
  }, [t]);

  const handleInstallUpdate = useCallback(() => {
    if (window.electronAPI?.installUpdate) {
      window.electronAPI.installUpdate();
    }
  }, []);

  const renderUpdateStatus = () => {
    if (!updateStatus) return null;

    switch (updateStatus.status) {
      case "checking":
        return (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("settings.updates.checking")}</span>
          </div>
        );

      case "available":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Download className="h-4 w-4" />
              <span>
                {t("settings.updates.available", {
                  version: updateStatus.version,
                })}
              </span>
            </div>
            <Button onClick={handleDownloadUpdate} disabled={isDownloading}>
              <Download className="mr-2 h-4 w-4" />
              {t("settings.updates.downloadUpdate")}
            </Button>
          </div>
        );

      case "not-available":
        return (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Check className="h-4 w-4" />
            <span>
              {t("settings.updates.notAvailable", {
                version: updateStatus.version,
              })}
            </span>
          </div>
        );

      case "downloading":
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {t("settings.updates.downloading", {
                  percent: Math.round(updateStatus.percent || 0),
                })}
              </span>
            </div>
            <Progress value={updateStatus.percent || 0} />
          </div>
        );

      case "downloaded":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="h-4 w-4" />
              <span>
                {t("settings.updates.downloaded", {
                  version: updateStatus.version,
                })}
              </span>
            </div>
            <Button onClick={handleInstallUpdate}>
              <Rocket className="mr-2 h-4 w-4" />
              {t("settings.updates.restartInstall")}
            </Button>
          </div>
        );

      case "error":
        return (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>
              {t("settings.updates.error", { message: updateStatus.message })}
            </span>
          </div>
        );

      default:
        return null;
    }
  };

  const allPredownloaded = FREE_TOOL_MODEL_DOWNLOADS.every(
    (model) => predownloadStates[model.id]?.downloaded,
  );
  const activePredownload = FREE_TOOL_MODEL_DOWNLOADS.find(
    (model) => predownloadStates[model.id]?.downloading,
  );
  const predownloadOverallProgress =
    FREE_TOOL_MODEL_DOWNLOADS.length > 0
      ? FREE_TOOL_MODEL_DOWNLOADS.reduce(
          (sum, model) => sum + (predownloadStates[model.id]?.progress ?? 0),
          0,
        ) / FREE_TOOL_MODEL_DOWNLOADS.length
      : 0;

  return (
    <div className="container max-w-2xl px-4 md:px-6 py-6 md:py-8 pt-14 md:pt-4 settings-stagger">
      <div className="mb-6 md:mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          {t("settings.title")}
        </h1>
        <p className="text-muted-foreground text-sm md:text-base mt-2">
          {t("settings.description")}
        </p>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>默认服务</CardTitle>
              <CardDescription>
                设置整个桌面端默认调用的 API
                服务。模型、生成、上传、余额都会使用这里的地址。
              </CardDescription>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {baseUrl}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiService">默认配置</Label>
            <Select
              value={
                serviceDraft === "ideart-production"
                  ? serviceDraft
                  : "ideart-production"
              }
              onValueChange={(value) => setServiceDraft(value as ApiServiceId)}
            >
              <SelectTrigger id="apiService">
                <SelectValue placeholder="选择默认服务" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ideart-production">
                  Lovarts.art (
                  {API_SERVICE_PRESETS["ideart-production"].baseUrl})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {serviceDraft === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="customApiBaseUrl">自定义 Base URL</Label>
              <Input
                id="customApiBaseUrl"
                value={customBaseUrlDraft}
                onChange={(event) => setCustomBaseUrlDraft(event.target.value)}
                placeholder="例如 http://127.0.0.1:3001 或 https://lovarts.art"
              />
            </div>
          )}

          <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground">
            保存后将使用：
            <span className="ml-1 font-mono text-foreground">
              {resolveBaseUrl({
                serviceId: serviceDraft,
                customBaseUrl: customBaseUrlDraft,
              })}
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSaveService}
              disabled={
                isSavingService ||
                (serviceDraft === "custom" && !customBaseUrlDraft.trim())
              }
            >
              {isSavingService ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中
                </>
              ) : (
                "保存默认服务"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.apiKey.title")}</CardTitle>
              <CardDescription>
                {t("settings.apiKey.description")}
              </CardDescription>
            </div>
            {apiKey && storeIsValidating && (
              <Badge variant="secondary">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />{" "}
                {t("settings.apiKey.validating")}
              </Badge>
            )}
            {apiKey && !storeIsValidating && isValidated && (
              <Badge variant="success">
                <Check className="mr-1 h-3 w-3" /> {t("settings.apiKey.valid")}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">{t("settings.apiKey.label")}</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="apiKey"
                  type={showKey ? "text" : "password"}
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder={t("settings.apiKey.placeholder")}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.apiKey.getKey")}{" "}
              <a
                href="https://lovarts.art"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                lovarts.art
              </a>
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isSaving || !inputKey}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("settings.apiKey.validating")}
                </>
              ) : (
                t("settings.apiKey.save")
              )}
            </Button>
            <Button variant="outline" onClick={handleClear} disabled={!apiKey}>
              {t("common.clear")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isValidated && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("settings.balance.title")}</CardTitle>
                <CardDescription>
                  {t("settings.balance.description")}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={openBalanceTransactions}
                  disabled={!isValidated}
                  title={t("settings.balance.transactions", "Transactions")}
                >
                  <ReceiptText className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={fetchBalance}
                  disabled={isLoadingBalance}
                  title={t("common.refresh", "Refresh")}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isLoadingBalance ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {isLoadingBalance ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : balance !== null ? (
                  `¥${balance.toFixed(2)}`
                ) : (
                  "—"
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("settings.appearance.title")}</CardTitle>
          <CardDescription>
            {t("settings.appearance.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme">{t("settings.appearance.theme")}</Label>
            <Select
              value="dark"
              onValueChange={() => setTheme("dark" as Theme)}
            >
              <SelectTrigger id="theme" className="w-[200px]">
                <SelectValue placeholder={t("settings.appearance.theme")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4" />
                    <span>{t("settings.appearance.themeDark")}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("settings.appearance.themeDesc")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("settings.language.title")}</CardTitle>
          <CardDescription>
            {t("settings.language.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="language">{t("settings.language.label")}</Label>
            <Select
              value={languagePreference}
              onValueChange={handleLanguageChange}
            >
              <SelectTrigger id="language" className="w-[200px]">
                <SelectValue placeholder={t("settings.language.label")} />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span>
                        {lang.code === "auto"
                          ? t("settings.language.auto")
                          : lang.nativeName}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("settings.assets.title")}</CardTitle>
          <CardDescription>{t("settings.assets.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="autoSaveAssets">
                {t("settings.assets.autoSave")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("settings.assets.autoSaveDesc")}
              </p>
            </div>
            <Switch
              id="autoSaveAssets"
              checked={assetsSettings.autoSaveAssets}
              onCheckedChange={handleAutoSaveAssetsChange}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("settings.assets.directory")}</Label>
            <div className="flex gap-2">
              <Input
                value={
                  assetsSettings.assetsDirectory ||
                  t("settings.assets.defaultDirectory")
                }
                readOnly
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectAssetsDirectory}>
                <FolderOpen className="mr-2 h-4 w-4" />
                {t("settings.assets.browse")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.assets.directoryDesc")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("settings.downloads.title")}</CardTitle>
          <CardDescription>
            {t("settings.downloads.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {FREE_TOOL_MODEL_DOWNLOADS.length > 0 && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Download className="h-4 w-4 text-muted-foreground" />
                    <Label>{t("settings.cache.predownload")}</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.cache.predownloadDesc")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePredownloadModels}
                  disabled={isPredownloading || allPredownloaded}
                >
                  {isPredownloading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {allPredownloaded
                    ? t("settings.cache.downloaded")
                    : t("settings.cache.downloadModels")}
                </Button>
              </div>

              <div className="space-y-2">
                {FREE_TOOL_MODEL_DOWNLOADS.map((model) => {
                  const state = predownloadStates[model.id];
                  return (
                    <div key={model.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium">
                            {t(model.labelKey)}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {formatSize(model.size)}
                          </span>
                        </div>
                        <Badge
                          variant={state?.downloaded ? "success" : "outline"}
                        >
                          {state?.downloaded
                            ? t("settings.cache.downloaded")
                            : state?.downloading
                              ? `${Math.round(state.progress)}%`
                              : t("settings.cache.notDownloaded")}
                        </Badge>
                      </div>
                      {(state?.downloading || state?.error) && (
                        <div className="space-y-1">
                          {state.downloading && (
                            <Progress value={state.progress} />
                          )}
                          {state.current != null && state.total != null && (
                            <p className="text-xs text-muted-foreground">
                              {formatSize(state.current)} /{" "}
                              {formatSize(state.total)}
                            </p>
                          )}
                          {state.error && (
                            <p className="text-xs text-destructive">
                              {state.error}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {activePredownload && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t(activePredownload.labelKey)}</span>
                    <span>{Math.round(predownloadOverallProgress)}%</span>
                  </div>
                  <Progress value={predownloadOverallProgress} />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label>{t("settings.downloads.downloadTimeout")}</Label>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={String(generalSettings.downloadTimeout)}
                onValueChange={(value) =>
                  setDownloadTimeout(parseInt(value, 10))
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="120">
                    2 {t("settings.downloads.minutes")}
                  </SelectItem>
                  <SelectItem value="300">
                    5 {t("settings.downloads.minutes")}
                  </SelectItem>
                  <SelectItem value="600">
                    10 {t("settings.downloads.minutes")}
                  </SelectItem>
                  <SelectItem value="900">
                    15 {t("settings.downloads.minutes")}
                  </SelectItem>
                  <SelectItem value="1800">
                    30 {t("settings.downloads.minutes")}
                  </SelectItem>
                  <SelectItem value="3600">
                    60 {t("settings.downloads.minutes")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.downloads.downloadTimeoutDesc")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("settings.cache.title")}</CardTitle>
          <CardDescription>{t("settings.cache.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              className="flex items-center gap-3 text-left hover:bg-muted/50 -ml-2 px-2 py-1 rounded-md transition-colors"
              onClick={() => setShowCacheDialog(true)}
              disabled={cacheSize === 0}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <Label className="cursor-pointer">
                    {t("settings.cache.aiModels")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("settings.cache.aiModelsDesc")}
                </p>
              </div>
              {cacheSize !== null && cacheSize > 0 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {cacheSize !== null
                  ? cacheSize > 0
                    ? formatSize(cacheSize)
                    : t("settings.cache.empty")
                  : t("settings.cache.calculating")}
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowClearConfirm(true)}
                disabled={isClearingCache || cacheSize === 0}
              >
                {isClearingCache ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("settings.cache.clear")}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={showBalanceTransactions}
        onOpenChange={setShowBalanceTransactions}
      >
        <DialogContent className="max-w-3xl max-h-[78vh] flex flex-col gap-0 overflow-hidden p-0">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between border-b px-6 py-4">
              <span className="flex items-center gap-2 text-lg">
                <ReceiptText className="h-4 w-4 text-muted-foreground" />
                {t("settings.balance.transactions", "Balance Details")}
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {t("settings.balance.transactionTotal", {
                  count: balanceTransactionsTotal,
                  defaultValue: "{{count}} records",
                })}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto px-6 py-2">
            {isLoadingBalanceTransactions ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.loading", "Loading...")}
              </div>
            ) : balanceTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                {t("settings.balance.noTransactions", "No balance records")}
              </p>
            ) : (
              <div className="divide-y">
                {balanceTransactions.map((item) => {
                  const signedAmount = getBalanceTransactionSignedAmount(item);
                  const isDebit = signedAmount < 0;
                  const typeLabel = getBalanceTransactionTypeLabel(item.type);
                  const description = getBalanceTransactionDescription(item);
                  return (
                    <div
                      key={item.id}
                      className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_150px] md:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 font-medium text-foreground">
                            {typeLabel}
                          </span>
                          {item.model_id ? (
                            <span
                              className="min-w-0 truncate text-sm text-muted-foreground"
                              title={item.model_id}
                            >
                              {item.model_id}
                            </span>
                          ) : null}
                        </div>
                        <div
                          className="mt-1 truncate text-sm text-muted-foreground"
                          title={description}
                        >
                          {description}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{formatDateTime(item.created_at)}</span>
                          <span>
                            {t("settings.balance.balanceAfter", "Balance")} ¥
                            {item.balance_after.toFixed(4)}
                          </span>
                        </div>
                      </div>
                      <div className="text-left md:text-right">
                        <div
                          className={cn(
                            "text-base font-semibold tabular-nums",
                            isDebit ? "text-red-400" : "text-emerald-400",
                          )}
                        >
                          {formatCnyAmount(signedAmount)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t bg-muted/20 px-6 py-4 text-sm">
            <span className="text-muted-foreground">
              {t("settings.balance.transactionPage", {
                page: balanceTransactionsPage,
                totalPages: balanceTransactionsTotalPages,
                defaultValue: "Page {{page}} / {{totalPages}}",
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={
                  balanceTransactionsPage <= 1 || isLoadingBalanceTransactions
                }
                onClick={() =>
                  fetchBalanceTransactions(balanceTransactionsPage - 1)
                }
              >
                {t("common.previous", "Previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  balanceTransactionsPage >= balanceTransactionsTotalPages ||
                  isLoadingBalanceTransactions
                }
                onClick={() =>
                  fetchBalanceTransactions(balanceTransactionsPage + 1)
                }
              >
                {t("common.next", "Next")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cache Details Dialog */}
      <Dialog open={showCacheDialog} onOpenChange={setShowCacheDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{t("settings.cache.title")}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {formatSize(cacheSize || 0)}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto -mx-6 px-6">
            {cacheItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("settings.cache.empty")}
              </p>
            ) : (
              <div className="space-y-2">
                {cacheItems.map((item) => (
                  <div
                    key={item.url}
                    className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/50 group"
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        title={item.url}
                      >
                        {getDisplayName(item)}
                      </p>
                      <p
                        className="text-xs text-muted-foreground truncate"
                        title={item.cacheName}
                      >
                        {item.cacheName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {formatSize(item.size)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteCacheItem(item)}
                        disabled={isDeletingItem === item.url}
                      >
                        {isDeletingItem === item.url ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {cacheItems.length > 0 && (
            <div className="flex justify-end pt-4 border-t">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowClearConfirm(true)}
                disabled={isClearingCache}
              >
                {isClearingCache ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                {t("settings.cache.clear")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Clear Cache Confirmation */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.cache.clear")}</AlertDialogTitle>
            <AlertDialogDescription>
              {(cacheSize ?? 0) > 0
                ? t("settings.cache.clearConfirmDesc", {
                    size: formatSize(cacheSize ?? 0),
                  })
                : t("settings.cache.clearConfirmEmpty")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleClearCache}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("settings.cache.clear")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.updates.title")}</CardTitle>
              <CardDescription>
                {t("settings.updates.description")}
              </CardDescription>
            </div>
            {appVersion && <Badge variant="outline">v{appVersion}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="updateChannel">
              {t("settings.updates.channel")}
            </Label>
            <Select
              value={updateChannel}
              onValueChange={(value) =>
                handleChannelChange(value as UpdateChannel)
              }
            >
              <SelectTrigger id="updateChannel" className="w-[200px]">
                <SelectValue placeholder={t("settings.updates.channel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stable">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span>{t("settings.updates.stable")}</span>
                  </div>
                </SelectItem>
                <SelectItem value="nightly">
                  <div className="flex items-center gap-2">
                    <Rocket className="h-4 w-4" />
                    <span>{t("settings.updates.nightly")}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {updateChannel === "stable"
                ? t("settings.updates.stableDesc")
                : t("settings.updates.nightlyDesc")}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="autoCheckUpdate">
                {t("settings.updates.autoCheck")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("settings.updates.autoCheckDesc")}
              </p>
            </div>
            <Switch
              id="autoCheckUpdate"
              checked={autoCheckUpdate}
              onCheckedChange={handleAutoCheckUpdateChange}
            />
          </div>

          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={handleCheckForUpdates}
              disabled={isCheckingUpdate || isDownloading}
            >
              {isCheckingUpdate ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("settings.updates.checking")}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("settings.updates.checkForUpdates")}
                </>
              )}
            </Button>

            {renderUpdateStatus()}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
