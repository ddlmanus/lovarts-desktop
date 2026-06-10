import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileText,
  ImagePlus,
  Loader2,
  Pencil,
  RefreshCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  DEFAULT_API_BASE_URL,
  IDEART_API_BASE_URL_STORAGE_KEY,
  IDEART_PRODUCTION_API_BASE_URL,
  apiClient,
} from "@/api/client";
import { ModelSelector } from "@/components/playground/ModelSelector";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import {
  buildOutlineRawFromPages,
  buildXiaohongshuImagePrompt,
  generateXiaohongshuContentFromPages,
  pageTypeLabel,
  splitPageContentAndPrompt,
  XIAOHONGSHU_CANVAS_SIZE_BY_ASPECT_RATIO,
  type XiaohongshuAspectRatio,
  type XiaohongshuCopyDraft,
  type XiaohongshuFormState,
  type XiaohongshuGeneratedImage,
  type XiaohongshuPage,
  type XiaohongshuPageType,
} from "@/lib/xiaohongshuGenerator";
import { getModelWorkspace } from "@/stores/playgroundStore";
import { useModelsStore } from "@/stores/modelsStore";
import { useXiaohongshuHistoryStore } from "@/stores/xiaohongshuHistoryStore";
import type { Model } from "@/types/model";

interface ReferenceImage {
  id: string;
  file: File;
  previewUrl: string;
}

type Step = "copy" | "image";

const DEFAULT_FORM: XiaohongshuFormState = {
  topic: "",
  audience: "",
  sellingPoints: "",
  tone: "真实种草",
  pageType: "图文笔记",
  pageCount: 6,
  aspectRatio: "3:4",
};

const MAX_REFERENCE_IMAGE_BYTES = 30 * 1024 * 1024;
const IDEART_GATEWAY_TOKEN_KEY = "ideart_gateway_token";

interface LovartsXiaohongshuRecord {
  id: string;
  outlineRaw?: string;
  outlinePages?: XiaohongshuPage[];
  generatedImages?: XiaohongshuGeneratedImage[];
  imageUnderstandingText?: string;
  content?: Partial<XiaohongshuCopyDraft> & {
    status?: string;
    error?: string;
  };
}

function isImageModel(model: Model) {
  return getModelWorkspace(model) === "image";
}

function getPreferredImageModel(models: Model[]) {
  const preferred = models.find((model) =>
    model.model_id.toLowerCase().includes("gpt-image-2"),
  );
  return preferred ?? models[0] ?? null;
}

function createReferenceImage(file: File): ReferenceImage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

function createGeneratedImages(
  pages: XiaohongshuPage[],
): XiaohongshuGeneratedImage[] {
  return pages.map((page) => ({
    index: page.index,
    url: "",
    status: "idle",
  }));
}

function outputFileName(index: number) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `xiaohongshu-page-${index + 1}-${stamp}.png`;
}

function extractPrimaryTitle(
  copyDraft: XiaohongshuCopyDraft,
  form: XiaohongshuFormState,
) {
  return copyDraft.titles[0] || form.topic || "小红书图文笔记";
}

function normalizeBaseUrl(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function resolveLovartsBaseUrl() {
  const clientBaseUrl = normalizeBaseUrl(apiClient.getBaseUrl());
  if (clientBaseUrl && clientBaseUrl !== DEFAULT_API_BASE_URL) {
    return clientBaseUrl;
  }
  if (typeof window !== "undefined") {
    const stored = normalizeBaseUrl(
      window.localStorage.getItem(IDEART_API_BASE_URL_STORAGE_KEY),
    );
    if (stored) return stored;
  }
  return IDEART_PRODUCTION_API_BASE_URL;
}

function resolveLovartsAuthToken(baseUrl: string) {
  if (typeof window !== "undefined") {
    const storedToken = String(
      window.localStorage.getItem(IDEART_GATEWAY_TOKEN_KEY) || "",
    ).trim();
    if (storedToken) return storedToken;
  }
  const clientBaseUrl = normalizeBaseUrl(apiClient.getBaseUrl());
  if (clientBaseUrl === normalizeBaseUrl(baseUrl)) {
    return apiClient.getApiKey();
  }
  return "";
}

function buildLovartsSettings(
  form: XiaohongshuFormState,
  imageModelId: string,
) {
  return {
    textModelId: "",
    imageModelId,
    aspectRatio: form.aspectRatio,
    imageSize: form.aspectRatio === "1:1" ? "1K" : "2K",
    imageCountLimit: form.pageCount,
    sequentialGeneration: false,
  };
}

interface DesktopApiResponse<T> {
  code?: number;
  message?: string;
  data?: T;
  error?: string;
}

async function parseLovartsResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as
    | DesktopApiResponse<T>
    | (T & { error?: string; message?: string });
  const code = Number((data as DesktopApiResponse<T>)?.code);
  if (!response.ok || (Number.isFinite(code) && code !== 200)) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : typeof data?.message === "string"
          ? data.message
          : response.status === 401
            ? "Lovarts 登录状态不可用"
            : "Lovarts 小红书接口调用失败";
    throw new Error(message);
  }
  return ((data as DesktopApiResponse<T>)?.data ?? data) as T;
}

async function requestLovartsXiaohongshuCopy(params: {
  form: XiaohongshuFormState;
  imageModelId: string;
  referenceImages: ReferenceImage[];
  signal: AbortSignal;
}) {
  const baseUrl = resolveLovartsBaseUrl();
  const token = resolveLovartsAuthToken(baseUrl);
  const formData = new FormData();
  formData.set("topic", params.form.topic.trim());
  formData.set("originalTopic", params.form.topic.trim());
  formData.set("pageCount", String(params.form.pageCount));
  formData.set("enable_search", "false");
  formData.set(
    "settings",
    JSON.stringify(buildLovartsSettings(params.form, params.imageModelId)),
  );
  for (const image of params.referenceImages) {
    formData.append("images", image.file, image.file.name || "reference.png");
  }

  const response = await fetch(`${baseUrl}/api/desktop/xiaohongshu/copy`, {
    method: "POST",
    body: formData,
    credentials: "include",
    signal: params.signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return parseLovartsResponse<{ record?: LovartsXiaohongshuRecord }>(response);
}

async function requestLovartsXiaohongshuImage(params: {
  recordId?: string;
  topic: string;
  page: XiaohongshuPage;
  outlinePages: XiaohongshuPage[];
  generatedImages: XiaohongshuGeneratedImage[];
  referenceImages: ReferenceImage[];
  styleReferenceImages: string[];
  imageUnderstandingText?: string;
  promptSuggestion?: string;
  form: XiaohongshuFormState;
  imageModelId: string;
  signal: AbortSignal;
}) {
  const baseUrl = resolveLovartsBaseUrl();
  const token = resolveLovartsAuthToken(baseUrl);
  const formData = new FormData();
  if (params.recordId) formData.set("recordId", params.recordId);
  formData.set("topic", params.topic);
  formData.set("page", JSON.stringify(params.page));
  formData.set(
    "fullOutline",
    buildOutlineRawFromPages(params.outlinePages, params.generatedImages),
  );
  formData.set(
    "settings",
    JSON.stringify(buildLovartsSettings(params.form, params.imageModelId)),
  );
  formData.set(
    "styleReferenceImages",
    JSON.stringify(params.styleReferenceImages),
  );
  if (params.imageUnderstandingText) {
    formData.set("imageUnderstandingText", params.imageUnderstandingText);
  }
  if (params.promptSuggestion) {
    formData.set("promptSuggestion", params.promptSuggestion);
  }
  for (const image of params.referenceImages) {
    formData.append("images", image.file, image.file.name || "reference.png");
  }

  const response = await fetch(`${baseUrl}/api/desktop/xiaohongshu/image`, {
    method: "POST",
    credentials: "include",
    body: formData,
    signal: params.signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return parseLovartsResponse<{
    image?: XiaohongshuGeneratedImage;
    recordId?: string;
    meta?: {
      imageModelId?: string;
      provider?: string;
    };
  }>(response);
}

function normalizeRemotePages(pages?: XiaohongshuPage[]): XiaohongshuPage[] {
  return (Array.isArray(pages) ? pages : [])
    .map((page, index) => {
      const type: XiaohongshuPageType =
        page?.type === "cover" || page?.type === "summary"
          ? page.type
          : "content";
      return {
        index,
        type,
        content: String(page?.content || "").trim(),
      };
    })
    .filter((page) => page.content);
}

function normalizeRemoteGeneratedImages(
  images: XiaohongshuGeneratedImage[] | undefined,
  pages: XiaohongshuPage[],
) {
  const source = Array.isArray(images) ? images : [];
  return pages.map((page) => {
    const image = source.find((item) => item.index === page.index);
    return {
      index: page.index,
      url: String(image?.url || ""),
      status: image?.status || "idle",
      error: image?.error,
      prompt: image?.prompt,
      model: image?.model,
    } satisfies XiaohongshuGeneratedImage;
  });
}

function normalizeRemoteCopyDraft(
  content?: LovartsXiaohongshuRecord["content"],
): XiaohongshuCopyDraft | null {
  if (!content) return null;
  const titles = Array.isArray(content.titles)
    ? content.titles.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const copywriting = String(content.copywriting || "").trim();
  const tags = Array.isArray(content.tags)
    ? content.tags.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (titles.length === 0 && !copywriting && tags.length === 0) return null;
  return { titles, copywriting, tags };
}

export function XiaohongshuGeneratorPage() {
  const { models, fetchModels } = useModelsStore();
  const [step, setStep] = useState<Step>("copy");
  const [selectedImageModelId, setSelectedImageModelId] = useState("");
  const [form, setForm] = useState<XiaohongshuFormState>(DEFAULT_FORM);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [copyDraft, setCopyDraft] = useState<XiaohongshuCopyDraft>({
    titles: [],
    copywriting: "",
    tags: [],
  });
  const [outlineRaw, setOutlineRaw] = useState("");
  const [pages, setPages] = useState<XiaohongshuPage[]>([]);
  const [generatedImages, setGeneratedImages] = useState<
    XiaohongshuGeneratedImage[]
  >([]);
  const [lovartsRecordId, setLovartsRecordId] = useState("");
  const [imageUnderstandingText, setImageUnderstandingText] = useState("");
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [activeOutputIndex, setActiveOutputIndex] = useState(0);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [generatingPageIndex, setGeneratingPageIndex] = useState<number | null>(
    null,
  );
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceImagesRef = useRef<ReferenceImage[]>([]);

  const imageModels = useMemo(() => models.filter(isImageModel), [models]);
  const selectedImageModel = useMemo(
    () => imageModels.find((model) => model.model_id === selectedImageModelId),
    [imageModels, selectedImageModelId],
  );
  const selectedPage =
    pages.find((page) => page.index === selectedPageIndex) ?? pages[0] ?? null;
  const activeImage = generatedImages[activeOutputIndex]?.url || "";
  const fullCopyText = useMemo(
    () =>
      [
        extractPrimaryTitle(copyDraft, form),
        "",
        copyDraft.copywriting,
        "",
        copyDraft.tags.map((tag) => `#${tag}`).join(" "),
      ].join("\n"),
    [copyDraft, form],
  );

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (selectedImageModelId || imageModels.length === 0) return;
    const model = getPreferredImageModel(imageModels);
    if (model) setSelectedImageModelId(model.model_id);
  }, [imageModels, selectedImageModelId]);

  useEffect(() => {
    referenceImagesRef.current = referenceImages;
  }, [referenceImages]);

  useEffect(() => {
    return () => {
      referenceImagesRef.current.forEach((image) =>
        URL.revokeObjectURL(image.previewUrl),
      );
      abortRef.current?.abort();
    };
  }, []);

  const updateForm = useCallback(
    <K extends keyof XiaohongshuFormState>(
      key: K,
      value: XiaohongshuFormState[K],
    ) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const addFiles = useCallback((files: FileList | File[]) => {
    const sourceFiles = Array.from(files);
    const oversized = sourceFiles.filter(
      (file) =>
        file.type.startsWith("image/") && file.size > MAX_REFERENCE_IMAGE_BYTES,
    );
    const nextFiles = sourceFiles.filter(
      (file) =>
        file.type.startsWith("image/") &&
        file.size <= MAX_REFERENCE_IMAGE_BYTES,
    );
    if (oversized.length > 0) {
      setError(
        `单张参考图最大支持 30MB，已跳过 ${oversized.length} 张超限图片。`,
      );
    }
    if (nextFiles.length === 0) return;
    setReferenceImages((prev) => {
      const remaining = Math.max(0, 8 - prev.length);
      return [
        ...prev,
        ...nextFiles.slice(0, remaining).map(createReferenceImage),
      ];
    });
  }, []);

  const removeReference = useCallback((id: string) => {
    setReferenceImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((image) => image.id !== id);
    });
  }, []);

  const applyOutline = useCallback(
    (
      nextPages: XiaohongshuPage[],
      nextOutlineRaw?: string,
      options?: {
        copyDraft?: XiaohongshuCopyDraft | null;
        generatedImages?: XiaohongshuGeneratedImage[];
      },
    ) => {
      const normalizedPages = nextPages.map((page, index) => ({
        ...page,
        index,
      }));
      const raw = nextOutlineRaw || buildOutlineRawFromPages(normalizedPages);
      setPages(normalizedPages);
      setOutlineRaw(raw);
      setGeneratedImages(
        options?.generatedImages?.length
          ? options.generatedImages
          : createGeneratedImages(normalizedPages),
      );
      setSelectedPageIndex(0);
      setActiveOutputIndex(0);
      setCopyDraft(
        options?.copyDraft ||
          generateXiaohongshuContentFromPages(normalizedPages, form),
      );
      setStep("image");
    },
    [form],
  );

  const handleGenerateCopy = useCallback(async () => {
    if (!form.topic.trim()) {
      toast({
        title: "请输入主题",
        variant: "destructive",
      });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGeneratingCopy(true);
    setError("");
    try {
      const copyData = await requestLovartsXiaohongshuCopy({
        form,
        imageModelId: selectedImageModelId,
        referenceImages,
        signal: controller.signal,
      });
      const record = copyData.record;
      if (!record) {
        throw new Error("Lovarts 未返回小红书记录");
      }

      const outlinePages = normalizeRemotePages(record.outlinePages);
      if (outlinePages.length === 0) {
        throw new Error("Lovarts 未返回可用页面大纲");
      }
      const copyDraft = normalizeRemoteCopyDraft(record.content);
      const outlineRaw =
        String(record.outlineRaw || "").trim() ||
        buildOutlineRawFromPages(outlinePages);

      applyOutline(outlinePages, outlineRaw, {
        copyDraft,
        generatedImages: normalizeRemoteGeneratedImages(
          record.generatedImages,
          outlinePages,
        ),
      });
      setLovartsRecordId(record.id);
      setImageUnderstandingText(String(record.imageUnderstandingText || ""));
      toast({
        title: "文案大纲已生成",
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("文案生成已取消。");
      } else {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast({
          title: "文案生成失败",
          description: message,
          variant: "destructive",
        });
      }
    } finally {
      setIsGeneratingCopy(false);
      abortRef.current = null;
    }
  }, [applyOutline, form, referenceImages, selectedImageModelId]);

  const updatePageContent = useCallback(
    (index: number, content: string) => {
      setPages((prev) => {
        const next = prev.map((page) =>
          page.index === index ? { ...page, content } : page,
        );
        setOutlineRaw(buildOutlineRawFromPages(next, generatedImages));
        setCopyDraft(generateXiaohongshuContentFromPages(next, form));
        return next;
      });
    },
    [form, generatedImages],
  );

  const updatePageType = useCallback(
    (index: number, type: XiaohongshuPageType) => {
      setPages((prev) => {
        const next = prev.map((page) =>
          page.index === index ? { ...page, type } : page,
        );
        setOutlineRaw(buildOutlineRawFromPages(next, generatedImages));
        return next;
      });
    },
    [generatedImages],
  );

  const handleGeneratePageImage = useCallback(
    async (pageIndex: number, existingController?: AbortController) => {
      if (!selectedImageModelId) {
        toast({
          title: "请选择图像模型",
          variant: "destructive",
        });
        return null;
      }
      const page = pages.find((item) => item.index === pageIndex);
      if (!page) return null;
      const controller = existingController ?? new AbortController();
      if (!existingController) abortRef.current = controller;
      const taskId = useXiaohongshuHistoryStore.getState().startTask({
        recordId: lovartsRecordId || undefined,
        topic: form.topic.trim(),
        pageIndex: page.index,
        pageType: page.type,
        pageContent: page.content,
        aspectRatio: form.aspectRatio,
        imageModelId: selectedImageModelId,
        referenceCount: referenceImages.length,
      });

      setGeneratingPageIndex(pageIndex);
      setGeneratedImages((prev) =>
        prev.map((image) =>
          image.index === pageIndex
            ? { ...image, status: "generating", error: "" }
            : image,
        ),
      );

      try {
        const styleReferenceImages =
          page.type === "cover"
            ? []
            : generatedImages
                .filter(
                  (image) =>
                    image.index === 0 && image.status === "done" && image.url,
                )
                .map((image) => image.url);
        const promptSuggestion =
          generatedImages.find((image) => image.index === pageIndex)?.prompt ||
          splitPageContentAndPrompt(page.content).prompt;
        const result = await requestLovartsXiaohongshuImage({
          recordId: lovartsRecordId,
          topic: form.topic.trim(),
          page,
          outlinePages: pages,
          generatedImages,
          referenceImages,
          styleReferenceImages,
          imageUnderstandingText,
          promptSuggestion,
          form,
          imageModelId: selectedImageModelId,
          signal: controller.signal,
        });
        if (result.recordId) setLovartsRecordId(result.recordId);
        const url = result.image?.url || "";
        const historyPatch = {
          recordId: result.recordId || lovartsRecordId || undefined,
          url,
          prompt: result.image?.prompt || promptSuggestion,
          model:
            result.image?.model ||
            result.meta?.imageModelId ||
            selectedImageModelId,
          provider: result.meta?.provider,
        };
        const nextImage: XiaohongshuGeneratedImage = {
          index: pageIndex,
          url,
          status: url ? "done" : "error",
          error: url ? "" : "Lovarts 未返回可展示图片 URL",
          prompt: historyPatch.prompt,
          model: historyPatch.model,
        };
        if (url) {
          useXiaohongshuHistoryStore
            .getState()
            .completeTask(taskId, historyPatch);
        } else {
          useXiaohongshuHistoryStore
            .getState()
            .failTask(
              taskId,
              nextImage.error || "Lovarts 未返回可展示图片 URL",
            );
        }
        setGeneratedImages((prev) =>
          prev.map((image) => (image.index === pageIndex ? nextImage : image)),
        );
        setActiveOutputIndex(pageIndex);
        if (!url) setError(nextImage.error || "");
        return nextImage;
      } catch (err) {
        const message =
          err instanceof DOMException && err.name === "AbortError"
            ? "生成已取消。"
            : err instanceof Error
              ? err.message
              : String(err);
        setGeneratedImages((prev) =>
          prev.map((image) =>
            image.index === pageIndex
              ? { ...image, status: "error", error: message }
              : image,
          ),
        );
        useXiaohongshuHistoryStore.getState().failTask(taskId, message);
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          toast({
            title: "图片生成失败",
            description: message,
            variant: "destructive",
          });
        }
        return null;
      } finally {
        setGeneratingPageIndex(null);
        if (!existingController) abortRef.current = null;
      }
    },
    [
      form,
      generatedImages,
      imageUnderstandingText,
      lovartsRecordId,
      pages,
      referenceImages,
      selectedImageModelId,
    ],
  );

  const handleGenerateAllImages = useCallback(async () => {
    if (pages.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGeneratingAll(true);
    setError("");
    try {
      for (const page of pages) {
        if (controller.signal.aborted) break;
        await handleGeneratePageImage(page.index, controller);
      }
      toast({
        title: "批量生图已完成",
      });
    } finally {
      setIsGeneratingAll(false);
      abortRef.current = null;
    }
  }, [handleGeneratePageImage, pages]);

  const cancelGenerate = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const copyText = useCallback(async (text: string, title: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title, description: "已复制到剪贴板。" });
  }, []);

  const resetAll = useCallback(() => {
    setStep("copy");
    setPages([]);
    setOutlineRaw("");
    setGeneratedImages([]);
    setLovartsRecordId("");
    setImageUnderstandingText("");
    setSelectedPageIndex(0);
    setActiveOutputIndex(0);
    setError("");
  }, []);

  return (
    <div className="playground-shell playground-dark flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-full min-h-0 flex-col border-r border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] md:w-[390px] md:shrink-0">
          <div className="shrink-0 border-b border-[hsl(var(--playground-border))] px-4 py-3 pt-14 md:pt-3">
            <h1 className="flex items-center gap-2 text-base font-semibold leading-none text-white">
              <FileText className="h-4 w-4 text-[hsl(var(--playground-accent))]" />
              小红书
            </h1>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="space-y-3">
              <section className="rounded-lg border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] p-3">
                <Label className="text-xs font-medium text-muted-foreground">
                  图像模型
                </Label>
                <ModelSelector
                  models={imageModels}
                  value={selectedImageModelId}
                  onChange={setSelectedImageModelId}
                  disabled={isGeneratingAll || generatingPageIndex !== null}
                />
              </section>

              <section className="rounded-lg border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] p-3">
                <Label htmlFor="xhs-topic" className="text-sm text-white">
                  提示词
                </Label>
                <Textarea
                  id="xhs-topic"
                  value={form.topic}
                  disabled={isGeneratingCopy}
                  onPaste={(event) => {
                    const files = Array.from(event.clipboardData?.items || [])
                      .filter((item) => item.type.startsWith("image/"))
                      .map((item) => item.getAsFile())
                      .filter((file): file is File => Boolean(file));
                    if (files.length > 0) {
                      event.preventDefault();
                      addFiles(files);
                    }
                  }}
                  onChange={(event) => {
                    updateForm("topic", event.target.value);
                    if (pages.length === 0) setStep("copy");
                  }}
                  className="mt-2 min-h-[150px] resize-y bg-[hsl(var(--playground-panel))]"
                  placeholder="主题、产品、场景或要求"
                />
              </section>

              <section className="rounded-lg border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    参考图
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {referenceImages.length}/8
                  </span>
                </div>
                <button
                  type="button"
                  disabled={
                    isGeneratingCopy ||
                    isGeneratingAll ||
                    referenceImages.length >= 8
                  }
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragOver(false);
                    addFiles(event.dataTransfer.files);
                  }}
                  className={cn(
                    "mt-2 flex min-h-[122px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-panel))] px-4 py-5 text-center transition-colors",
                    isDragOver &&
                      "border-[hsl(var(--playground-accent))] bg-white/6",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  <ImagePlus className="h-7 w-7 text-[hsl(var(--playground-accent))]" />
                  <span className="mt-2 text-sm font-semibold text-white">
                    上传/拖拽/粘贴参考图
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                {referenceImages.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {referenceImages.map((image) => (
                      <div
                        key={image.id}
                        className="group relative overflow-hidden rounded-lg border border-[hsl(var(--playground-border))] bg-black/30"
                      >
                        <img
                          src={image.previewUrl}
                          alt="参考图"
                          className="aspect-[4/3] w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeReference(image.id)}
                          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          title="移除参考图"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      页数
                    </Label>
                    <Select
                      value={String(form.pageCount)}
                      onValueChange={(value) =>
                        updateForm("pageCount", Number(value))
                      }
                      disabled={isGeneratingCopy || isGeneratingAll}
                    >
                      <SelectTrigger className="h-10 bg-[hsl(var(--playground-panel))]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          { length: 15 },
                          (_, index) => index + 1,
                        ).map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            {value} 页
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      比例
                    </Label>
                    <Select
                      value={form.aspectRatio}
                      onValueChange={(value) =>
                        updateForm(
                          "aspectRatio",
                          value as XiaohongshuAspectRatio,
                        )
                      }
                      disabled={isGeneratingCopy || isGeneratingAll}
                    >
                      <SelectTrigger className="h-10 bg-[hsl(var(--playground-panel))]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3:4">3:4 竖版</SelectItem>
                        <SelectItem value="1:1">1:1 方图</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {
                        XIAOHONGSHU_CANVAS_SIZE_BY_ASPECT_RATIO[
                          form.aspectRatio
                        ]
                      }
                    </p>
                  </div>
                </div>
              </section>

              {pages.length > 0 && (
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-panel))] p-1">
                  <button
                    type="button"
                    onClick={() => setStep("copy")}
                    className={cn(
                      "flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors",
                      step === "copy"
                        ? "bg-[hsl(var(--playground-accent))] text-black"
                        : "text-muted-foreground hover:bg-white/6 hover:text-white",
                    )}
                  >
                    <FileText className="h-4 w-4" />
                    文案
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("image")}
                    className={cn(
                      "flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors",
                      step === "image"
                        ? "bg-[hsl(var(--playground-accent))] text-black"
                        : "text-muted-foreground hover:bg-white/6 hover:text-white",
                    )}
                  >
                    <ImagePlus className="h-4 w-4" />
                    生图
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] px-3 py-3">
            {error && (
              <div className="mb-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}
            <div className="flex items-center gap-2">
              {isGeneratingCopy ||
              isGeneratingAll ||
              generatingPageIndex !== null ? (
                <button
                  type="button"
                  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 text-sm font-semibold text-white transition-colors hover:bg-red-600"
                  onClick={cancelGenerate}
                >
                  <X className="h-4 w-4" />
                  取消
                </button>
              ) : step === "copy" ? (
                <button
                  type="button"
                  className="playground-run-button flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm transition-colors disabled:opacity-40"
                  onClick={handleGenerateCopy}
                >
                  <Send className="h-4 w-4" />
                  生成文案大纲
                </button>
              ) : (
                <button
                  type="button"
                  className="playground-run-button flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm transition-colors disabled:opacity-40"
                  disabled={pages.length === 0}
                  onClick={handleGenerateAllImages}
                >
                  <ImagePlus className="h-4 w-4" />
                  批量生图
                </button>
              )}
              <button
                type="button"
                disabled={isGeneratingCopy || isGeneratingAll}
                onClick={resetAll}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[hsl(var(--playground-border))] text-muted-foreground transition-colors hover:bg-white/6 hover:text-white disabled:opacity-40"
                title="重置"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        <div className="hidden w-1 shrink-0 bg-[hsl(var(--playground-canvas))] md:flex md:items-center md:justify-center">
          <div className="h-8 w-px bg-[hsl(var(--playground-border))]" />
        </div>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--playground-canvas))]">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] px-3">
            <button className="h-10 border-b-2 border-[hsl(var(--playground-accent))] px-3 text-sm font-semibold text-white">
              我的生成
            </button>
            {pages.length > 0 && (
              <button
                type="button"
                onClick={() => setStep(step === "copy" ? "image" : "copy")}
                className="ml-auto rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/6 hover:text-white"
              >
                {step === "copy" ? "生图" : "文案"}
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {step === "copy" ? (
              isGeneratingCopy ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-[hsl(var(--playground-accent))]" />
                </div>
              ) : pages.length > 0 ? (
                <section className="max-w-4xl rounded-xl border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] p-5">
                  <CopyPreview copyDraft={copyDraft} />
                </section>
              ) : null
            ) : (
              <section className="min-w-0">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      生成结果
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      共 {pages.length} 页 ·{" "}
                      {selectedImageModel?.model_id || "未选择图像模型"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void copyText(fullCopyText, "文案已复制")}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      复制文案
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStep("copy")}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      修改文案
                    </Button>
                  </div>
                </div>

                {pages.length > 0 ? (
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-5">
                    {pages.map((page) => {
                      const image = generatedImages.find(
                        (item) => item.index === page.index,
                      );
                      return (
                        <XiaohongshuPageCard
                          key={page.index}
                          page={page}
                          image={image}
                          selected={selectedPageIndex === page.index}
                          aspectRatio={form.aspectRatio}
                          isGenerating={generatingPageIndex === page.index}
                          disabled={
                            generatingPageIndex !== null || isGeneratingAll
                          }
                          onSelect={() => {
                            setSelectedPageIndex(page.index);
                            setActiveOutputIndex(page.index);
                          }}
                          onGenerate={() =>
                            void handleGeneratePageImage(page.index)
                          }
                        />
                      );
                    })}
                  </div>
                ) : null}

                {selectedPage && (
                  <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <section className="rounded-xl border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h2 className="text-base font-semibold text-white">
                          编辑 P{selectedPage.index + 1}
                        </h2>
                        <Select
                          value={selectedPage.type}
                          onValueChange={(value) =>
                            updatePageType(
                              selectedPage.index,
                              value as XiaohongshuPageType,
                            )
                          }
                        >
                          <SelectTrigger className="h-9 w-[112px] bg-[hsl(var(--playground-panel))]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cover">封面</SelectItem>
                            <SelectItem value="content">内容</SelectItem>
                            <SelectItem value="summary">总结</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Textarea
                        value={selectedPage.content}
                        onChange={(event) =>
                          updatePageContent(
                            selectedPage.index,
                            event.target.value,
                          )
                        }
                        className="min-h-[170px] bg-[hsl(var(--playground-panel))] font-mono text-xs leading-5"
                      />
                    </section>

                    <section className="flex flex-col gap-2 rounded-xl border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-surface))] p-4">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() =>
                          void copyText(
                            buildXiaohongshuImagePrompt({
                              form,
                              page: selectedPage,
                              fullOutline: outlineRaw,
                              referenceImageCount: referenceImages.length,
                              styleReferenceCount: generatedImages.some(
                                (image) => image.index === 0 && image.url,
                              )
                                ? 1
                                : 0,
                              promptSuggestion: splitPageContentAndPrompt(
                                selectedPage.content,
                              ).prompt,
                            }),
                            "本页生图提示词已复制",
                          )
                        }
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        复制提示词
                      </Button>
                      {activeImage && (
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          asChild
                        >
                          <a
                            href={activeImage}
                            download={outputFileName(activeOutputIndex)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            下载图片
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          setGeneratedImages((prev) =>
                            prev.map((image) =>
                              image.index === selectedPage.index
                                ? {
                                    ...image,
                                    url: "",
                                    status: "idle",
                                    error: "",
                                  }
                                : image,
                            ),
                          );
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        清空图片
                      </Button>
                    </section>
                  </div>
                )}
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function XiaohongshuPageCard({
  page,
  image,
  selected,
  aspectRatio,
  isGenerating,
  disabled,
  onSelect,
  onGenerate,
}: {
  page: XiaohongshuPage;
  image?: XiaohongshuGeneratedImage;
  selected: boolean;
  aspectRatio: XiaohongshuAspectRatio;
  isGenerating: boolean;
  disabled: boolean;
  onSelect: () => void;
  onGenerate: () => void;
}) {
  const split = splitPageContentAndPrompt(page.content);
  const lines = split.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fallbackTitle = `第 ${page.index + 1} 页`;
  const title = (lines[0] || fallbackTitle)
    .replace(/^#{1,6}\s*/, "")
    .replace(/^标题[:：]\s*/, "")
    .trim();
  const bodyLines = lines.slice(title ? 1 : 0);
  const imageStatus = isGenerating ? "generating" : image?.status || "idle";
  const prompt = split.prompt || image?.prompt || "";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group flex min-h-[520px] w-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-[hsl(var(--playground-surface))] text-left shadow-sm transition-all",
        selected
          ? "border-[hsl(var(--playground-accent))] shadow-[0_0_0_1px_hsl(var(--playground-accent)/0.35),0_18px_48px_rgba(0,0,0,0.28)]"
          : "border-[hsl(var(--playground-border))] hover:border-[hsl(var(--playground-accent))]/55 hover:bg-white/[0.035]",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--playground-border))] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 min-w-10 items-center justify-center rounded-lg bg-[hsl(var(--playground-accent))] px-2 text-sm font-bold text-black">
            P{page.index + 1}
          </span>
          <span className="rounded-md border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-panel))] px-2 py-1 text-xs font-medium text-muted-foreground">
            {pageTypeLabel(page.type)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {imageStatus === "done" && (
            <Check className="h-4 w-4 text-emerald-300" />
          )}
          {imageStatus === "error" && <X className="h-4 w-4 text-red-300" />}
          {imageStatus === "generating" && (
            <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--playground-accent))]" />
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
              onGenerate();
            }}
            className="flex h-8 items-center gap-1.5 rounded-md border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-panel))] px-2.5 text-xs font-medium text-white transition-colors hover:border-[hsl(var(--playground-accent))] hover:bg-[hsl(var(--playground-accent))]/12 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            生成
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <div className="rounded-xl border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-panel))] p-4">
          <h3 className="text-[17px] font-semibold leading-6 text-white">
            {title || fallbackTitle}
          </h3>
          {bodyLines.length > 0 && (
            <div className="mt-3 max-h-[190px] overflow-y-auto pr-1 text-sm leading-6 text-slate-200/90">
              {bodyLines.map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className={cn(
                    "whitespace-pre-wrap",
                    index > 0 && "mt-2",
                    /^[-*•]/.test(line) && "pl-1",
                  )}
                >
                  {line.replace(/^#{1,6}\s*/, "")}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[hsl(var(--playground-accent))]/25 bg-[hsl(var(--playground-accent))]/8 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--playground-accent))]">
            <ImagePlus className="h-3.5 w-3.5" />
            配图建议
          </div>
          <p className="max-h-[104px] overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-200/85">
            {prompt || "根据本页文案生成统一风格画面。"}
          </p>
        </div>

        <div
          className={cn(
            "mt-auto overflow-hidden rounded-xl border border-[hsl(var(--playground-border))] bg-black/25",
            aspectRatio === "3:4" ? "aspect-[3/4]" : "aspect-square",
          )}
        >
          {image?.url ? (
            <img
              src={image.url}
              alt={`小红书 P${page.index + 1}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {imageStatus === "generating" ? (
                <Loader2 className="h-7 w-7 animate-spin text-[hsl(var(--playground-accent))]" />
              ) : imageStatus === "error" ? (
                <div className="px-5 text-center text-xs leading-5 text-red-200">
                  {image?.error || "生成失败"}
                </div>
              ) : (
                <ImagePlus className="h-8 w-8 text-muted-foreground/70" />
              )}
            </div>
          )}
        </div>

        {image?.url && (
          <a
            href={image.url}
            download={outputFileName(page.index)}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="flex h-9 items-center justify-center gap-2 rounded-lg border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-panel))] text-xs font-medium text-white transition-colors hover:border-[hsl(var(--playground-accent))] hover:bg-white/6"
          >
            <Download className="h-4 w-4" />
            下载
          </a>
        )}
      </div>
    </div>
  );
}

function CopyPreview({
  copyDraft,
  compact = false,
}: {
  copyDraft: XiaohongshuCopyDraft;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground">推荐标题</Label>
        <div className="mt-2 space-y-2">
          {copyDraft.titles.map((title, index) => (
            <div
              key={`${title}-${index}`}
              className="rounded-lg border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-panel))] px-3 py-2 text-sm text-white"
            >
              {title}
            </div>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">正文</Label>
        <pre
          className={cn(
            "mt-2 whitespace-pre-wrap rounded-lg border border-[hsl(var(--playground-border))] bg-[hsl(var(--playground-panel))] p-3 text-sm leading-6 text-white",
            compact && "max-h-[220px] overflow-auto text-xs leading-5",
          )}
        >
          {copyDraft.copywriting}
        </pre>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">标签</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {copyDraft.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-[hsl(var(--playground-accent))]/40 bg-[hsl(var(--playground-accent))]/10 px-2.5 py-1 text-xs text-[hsl(var(--playground-accent))]"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
