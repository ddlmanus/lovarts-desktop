import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Check,
  X,
  ChevronDown,
  Star,
  BarChart3,
  Sparkles,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fuzzySearch } from "@/lib/fuzzySearch";
import { useModelsStore } from "@/stores/modelsStore";
import { findFamilyByVariantId } from "@/lib/smartFormConfig";
import type { Model } from "@/types/model";

interface ModelSelectorProps {
  models: Model[];
  value: string | undefined;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  hideVariantSelector?: boolean;
  variant?: "default" | "video" | "avatar";
}

type ModelBadge = {
  label: "NEW" | "HOT";
  className: string;
};

/** First two path segments = family. e.g. "bytedance/seedream-v5.0-lite/edit" → "bytedance/seedream-v5.0-lite" */
function getModelFamily(modelId: string): string {
  const parts = modelId.split("/");
  if (parts.length <= 2) return modelId;
  return parts.slice(0, 2).join("/");
}

/**
 * Get the "base family" for grouping related models.
 * Only strips clear speed-variant suffixes (-fast, -turbo) that indicate
 * the same model at different speed tiers. Does NOT strip quality/size
 * suffixes like -pro, -ultra, -lite which are distinct model variants.
 */
function getBaseFamily(modelId: string): string {
  const family = getModelFamily(modelId);
  const parts = family.split("/");
  if (parts.length < 2) return family;
  const baseName = parts[1].replace(/-(fast|turbo)$/i, "");
  return `${parts[0]}/${baseName}`;
}

function getVideoGroupKey(modelId: string): string {
  const lower = modelId.toLowerCase();
  const family = getModelFamily(modelId);
  if (lower.includes("seedance-2.0") && lower.includes("turbo")) {
    return "bytedance/seedance-2.0-turbo";
  }
  if (lower.includes("seedance-v2.0") && lower.includes("turbo")) {
    return "bytedance/seedance-v2.0-turbo";
  }
  return getBaseFamily(family);
}

function getAvatarGroupKey(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes("infinitetalk")) return "wavespeed-ai/infinitetalk";
  if (lower.includes("kling") && lower.includes("motion-control")) {
    return "kwaivgi/kling-motion-control";
  }
  return getBaseFamily(modelId);
}

/** Provider = first segment. e.g. "bytedance/seedream-v5.0-lite" → "bytedance" */
function getProvider(modelId: string): string {
  return modelId.split("/")[0] || modelId;
}

/** Family short name = second segment. e.g. "bytedance/seedream-v5.0-lite" → "seedream-v5.0-lite" */
function getFamilyName(modelId: string): string {
  const parts = modelId.split("/");
  return parts[1] || parts[0];
}

/** Format a slug to title case. e.g. "nano-banana-pro" → "Nano Banana Pro" */
function formatSlug(s: string): string {
  return s
    .split("-")
    .map((w) => {
      const lower = w.toLowerCase();
      if (["ai", "api", "gpt", "sd", "xl", "hd", "uhd", "3d"].includes(lower)) {
        return lower.toUpperCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/** Readable type label: "text-to-video" → "Text To Video" */
function formatType(type: string): string {
  return type
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Get a short display label for a variant within its base family group.
 * Shows the distinguishing parts: family suffix + path suffix.
 * e.g. for base "wavespeed-ai/infinitetalk":
 *   "wavespeed-ai/infinitetalk/video-to-video" → "video-to-video"
 *   "wavespeed-ai/infinitetalk-fast/video-to-video" → "fast / video-to-video"
 *   "wavespeed-ai/infinitetalk" → "infinitetalk"
 */
function getVariantLabel(modelId: string, baseFamily: string): string {
  const family = getModelFamily(modelId);
  const baseParts = baseFamily.split("/");
  const familyParts = family.split("/");

  // Difference in the second segment (e.g. "infinitetalk-fast" vs base "infinitetalk" → "fast")
  const baseName = baseParts[1] || "";
  const familyName = familyParts[1] || "";
  let speedSuffix = "";
  if (familyName !== baseName && familyName.startsWith(baseName)) {
    speedSuffix = familyName.slice(baseName.length + 1); // strip the leading "-"
  }

  // Path suffix after the family (e.g. "/video-to-video")
  const pathSuffix =
    modelId.length > family.length ? modelId.slice(family.length + 1) : "";

  if (speedSuffix && pathSuffix) return `${speedSuffix} / ${pathSuffix}`;
  if (speedSuffix) return speedSuffix;
  if (pathSuffix) return pathSuffix;
  return familyName;
}

function normalizeDisplayName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
}

function getVideoDisplayName(model: Model): string {
  const id = model.model_id.toLowerCase();
  const family = findFamilyByVariantId(model.model_id);

  if (id.includes("seedance-2.0") || id.includes("seedance-v2.0")) {
    return id.includes("turbo") ? "Seedance 2.0 Turbo" : "Seedance 2.0";
  }
  if (id.includes("seedance-v1.5-pro")) return "Seedance 1.5 Pro";
  if (id.includes("wan-2.7")) return "WAN 2.7";
  if (id.includes("wan-2.6")) return "WAN 2.6";
  if (id.includes("wan-2.5")) return "WAN 2.5";
  if (id.includes("wan-2.2-spicy")) return "WAN 2.2 Spicy";
  if (id.includes("kling-v3") || id.includes("kling-3")) return "Kling 3.0";
  if (id.includes("kling-o3")) return "Kling O3";
  if (id.includes("kling-v2.6") || id.includes("kling-2.6")) return "Kling 2.6";
  if (id.includes("sora-2")) return "Sora 2";
  if (id.includes("veo-3.1-lite")) return "Veo 3.1 Lite";
  if (id.includes("veo-3.1")) return "Veo 3.1";
  if (id.includes("vidu-q3")) return "Vidu Q3";
  if (id.includes("hailuo-2.3")) return "Hailuo 2.3";
  if (id.includes("grok-imagine")) return "Grok Imagine";
  if (id.includes("happy-horse")) return "Happy Horse 1.0";

  return (
    family?.name || model.name || formatSlug(getFamilyName(model.model_id))
  );
}

function getAvatarDisplayName(model: Model): string {
  const id = model.model_id.toLowerCase();
  const family = findFamilyByVariantId(model.model_id);

  if (id.includes("infinitetalk")) return "InfiniteTalk";
  if (id.includes("longcat")) return "LongCat Avatar 1.5";
  if (id.includes("wan-2.2") && id.includes("animate"))
    return "WAN 2.2 Animate";
  if (id.includes("kling-v3") && id.includes("motion-control")) {
    return "Kling 3.0 Motion Control";
  }
  if (id.includes("kling-v2.6") && id.includes("motion-control")) {
    return "Kling 2.6 Motion Control";
  }
  if (id.includes("pixverse") && id.includes("mimic")) {
    return "PixVerse Motion Mimic";
  }
  if (id.includes("steadydancer")) return "SteadyDancer";
  if (id.includes("face-swap")) return "Face Swapper";
  if (id.includes("skyreels-v3-pro")) return "SkyReels V3 Pro";
  if (id.includes("skyreels")) return "SkyReels";

  return (
    family?.name || model.name || formatSlug(getFamilyName(model.model_id))
  );
}

const VIDEO_MODEL_ORDER = [
  "seedance-2.0",
  "seedance-2.0-turbo",
  "happy-horse-1.0",
  "wan-2.7",
  "wan-2.6",
  "wan-2.5",
  "wan-2.2-spicy",
  "kling-3.0",
  "kling-o3",
  "kling-2.6",
  "seedance-1.5-pro",
  "sora-2",
  "veo-3.1",
  "veo-3.1-lite",
  "vidu-q3",
  "hailuo-2.3",
  "grok-imagine",
];

const AVATAR_MODEL_ORDER = [
  "infinitetalk",
  "longcat-avatar-1.5",
  "wan-2.2-animate",
  "kling-3.0-motion-control",
  "kling-2.6-motion-control",
  "pixverse-motion-mimic",
  "steadydancer",
  "face-swapper",
  "skyreels-v3-pro",
  "skyreels",
];

function getVideoSortRank(model: Model): number {
  const name = normalizeDisplayName(getVideoDisplayName(model));
  const rank = VIDEO_MODEL_ORDER.findIndex((item) => name.includes(item));
  return rank === -1 ? 1000 : rank;
}

function getAvatarSortRank(model: Model): number {
  const name = normalizeDisplayName(getAvatarDisplayName(model));
  const rank = AVATAR_MODEL_ORDER.findIndex((item) => name.includes(item));
  return rank === -1 ? 1000 : rank;
}

function getModelBadge(modelId: string | undefined): ModelBadge | null {
  if (!modelId) return null;
  const family = getModelFamily(modelId).toLowerCase();
  const id = modelId.toLowerCase();

  if (family === "openai/gpt-image-2" || id.includes("openai/gpt-image-2")) {
    return {
      label: "NEW",
      className: "bg-fuchsia-500 text-white shadow-fuchsia-500/20",
    };
  }

  if (
    id.includes("happy-horse") ||
    id.includes("longcat") ||
    (id.includes("pixverse") && id.includes("mimic"))
  ) {
    return {
      label: "NEW",
      className: "bg-fuchsia-500 text-white shadow-fuchsia-500/20",
    };
  }

  if (
    family.includes("seedance-2.0") ||
    family.includes("seedance-v2.0") ||
    id.includes("seedance-2.0") ||
    family.includes("nano-banana-2") ||
    family.includes("nano-banana-pro") ||
    family.includes("seedream-v4.5") ||
    family.includes("seedream-4.5") ||
    family.includes("wan-2.7") ||
    family.includes("wan-2.2-spicy") ||
    family.includes("kling-o3") ||
    family.includes("kling-v3") ||
    family.includes("veo-3.1-lite") ||
    id.includes("infinitetalk") ||
    id.includes("skyreels-v3-pro")
  ) {
    return {
      label: "HOT",
      className: "bg-orange-400 text-black shadow-orange-400/20",
    };
  }

  return null;
}

function getModelGlyph(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.includes("seedance")) return "";
  if (id.includes("kling")) return "K";
  if (id.includes("wan")) return "W";
  if (id.includes("sora")) return "O";
  if (id.includes("veo")) return "G";
  if (id.includes("vidu")) return "V";
  if (id.includes("hailuo")) return "H";
  if (id.includes("grok")) return "X";
  if (id.includes("pixverse")) return "P";
  return "";
}

function ModelIcon({
  modelId,
  variant,
}: {
  modelId: string;
  variant: "default" | "video" | "avatar";
}) {
  if (variant === "default") return null;
  const glyph = getModelGlyph(modelId);
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
      {glyph ? (
        <span className="text-sm font-semibold leading-none">{glyph}</span>
      ) : modelId.toLowerCase().includes("seedance") ? (
        <BarChart3 className="h-4 w-4" />
      ) : variant === "avatar" ? (
        <UserRound className="h-4 w-4" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
    </span>
  );
}

function ModelTag({ badge }: { badge: ModelBadge }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded px-1.5 text-[10px] font-bold leading-none shadow-sm",
        badge.className,
      )}
    >
      {badge.label}
    </span>
  );
}

export function ModelSelector({
  models,
  value,
  onChange,
  disabled,
  hideVariantSelector = false,
  variant = "default",
}: ModelSelectorProps) {
  const { t } = useTranslation();
  const isVideoVariant = variant === "video";
  const isAvatarVariant = variant === "avatar";
  const isCompactVariant = isVideoVariant || isAvatarVariant;
  const isFavorite = useModelsStore((s) => s.isFavorite);
  const [isOpen, setIsOpen] = useState(false);
  const [variantOpen, setVariantOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const variantRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedModel = models.find((m) => m.model_id === value);
  const currentBaseFamily = value ? getBaseFamily(value) : "";
  const selectedBadge = getModelBadge(value);
  const selectedDisplayName = selectedModel
    ? isVideoVariant
      ? getVideoDisplayName(selectedModel)
      : isAvatarVariant
        ? getAvatarDisplayName(selectedModel)
        : formatSlug(getFamilyName(selectedModel.model_id))
    : "";

  // Family variants: all models sharing the same base family (includes speed variants like -fast, -turbo)
  const familyVariants = useMemo(() => {
    if (!value) return [];
    const base = getBaseFamily(value);
    return models
      .filter((m) => getBaseFamily(m.model_id) === base)
      .sort((a, b) => a.model_id.localeCompare(b.model_id));
  }, [models, value]);

  // Group variants by model.type for the dropdown optgroups
  const variantsByType = useMemo(() => {
    const groups = new Map<string, Model[]>();
    for (const v of familyVariants) {
      const type = v.type || "other";
      const arr = groups.get(type) ?? [];
      arr.push(v);
      groups.set(type, arr);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [familyVariants]);

  // Breadcrumb parts for the selected model
  const breadcrumb = useMemo(() => {
    if (!value) return null;
    const provider = getProvider(value);
    const familyName = getFamilyName(value);
    return { provider, familyName };
  }, [value]);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => setDebouncedSearch(localSearch),
      150,
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localSearch]);

  // Reset highlight when search results change
  useEffect(() => {
    setHighlightIndex(0);
  }, [debouncedSearch]);

  // Unique families: one representative model per base family
  const familyModels = useMemo(() => {
    const seen = new Set<string>();
    return models.filter((m) => {
      const family = getBaseFamily(m.model_id);
      if (seen.has(family)) return false;
      seen.add(family);
      return true;
    });
  }, [models]);

  const videoFamilyModels = useMemo(() => {
    const seen = new Set<string>();
    return models
      .filter((model) => {
        const key = getVideoGroupKey(model.model_id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const rankDiff = getVideoSortRank(a) - getVideoSortRank(b);
        if (rankDiff !== 0) return rankDiff;
        return getVideoDisplayName(a).localeCompare(getVideoDisplayName(b));
      });
  }, [models]);

  const avatarFamilyModels = useMemo(() => {
    const seen = new Set<string>();
    return models
      .filter((model) => {
        const key = getAvatarGroupKey(model.model_id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const rankDiff = getAvatarSortRank(a) - getAvatarSortRank(b);
        if (rankDiff !== 0) return rankDiff;
        return getAvatarDisplayName(a).localeCompare(getAvatarDisplayName(b));
      });
  }, [models]);

  const filteredModels = useMemo(() => {
    const displayModels = isVideoVariant
      ? videoFamilyModels
      : isAvatarVariant
        ? avatarFamilyModels
        : familyModels;
    if (!debouncedSearch.trim()) {
      return isCompactVariant
        ? displayModels
        : [...displayModels].sort((a, b) =>
            getModelFamily(a.model_id).localeCompare(
              getModelFamily(b.model_id),
            ),
          );
    }
    // When variants are hidden, keep search at the family level as well.
    const searchSource = hideVariantSelector ? displayModels : models;
    return fuzzySearch(searchSource, debouncedSearch, (model) => [
      isVideoVariant ? getVideoDisplayName(model) : "",
      isAvatarVariant ? getAvatarDisplayName(model) : "",
      getModelFamily(model.model_id),
      model.name || "",
      model.model_id,
    ]).map((r) => r.item);
  }, [
    models,
    familyModels,
    videoFamilyModels,
    avatarFamilyModels,
    debouncedSearch,
    hideVariantSelector,
    isAvatarVariant,
    isCompactVariant,
    isVideoVariant,
  ]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setLocalSearch("");
        setDebouncedSearch("");
      }
      if (
        variantRef.current &&
        !variantRef.current.contains(e.target as Node)
      ) {
        setVariantOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
    if (isOpen && !localSearch) {
      // Scroll to the selected model after the list renders
      requestAnimationFrame(() => {
        const list = listRef.current;
        if (!list) return;
        const selected = list.querySelector('[data-selected="true"]');
        if (selected) {
          selected.scrollIntoView({ block: "center" });
        }
      });
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setLocalSearch("");
        setDebouncedSearch("");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => (i < filteredModels.length - 1 ? i + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => (i > 0 ? i - 1 : filteredModels.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredModels.length > 0) {
          const idx = Math.min(highlightIndex, filteredModels.length - 1);
          onChange(filteredModels[idx].model_id);
          setIsOpen(false);
          setLocalSearch("");
          setDebouncedSearch("");
        }
      }
    },
    [filteredModels, highlightIndex, onChange],
  );

  const handleSelect = useCallback(
    (modelId: string) => {
      onChange(modelId);
      setIsOpen(false);
      setLocalSearch("");
      setDebouncedSearch("");
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    setLocalSearch("");
    setDebouncedSearch("");
    inputRef.current?.focus();
  }, []);

  return (
    <div ref={containerRef}>
      {/* Title — integrated into the card */}
      <div
        className={cn(
          "space-y-2 mt-2",
          isCompactVariant
            ? ""
            : "rounded-lg border border-border/60 bg-card/50 px-2 py-3",
        )}
      >
        <div className="text-xs font-medium text-muted-foreground">
          {isCompactVariant
            ? t("playground.model", "模型")
            : t("playground.modelSelector", "Model Selector")}
        </div>
        {/* Row 1: Breadcrumb / search trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (!disabled) {
                setIsOpen(!isOpen);
                setVariantOpen(false);
              }
            }}
            disabled={disabled}
            className={cn(
              "flex w-full items-center gap-2 border text-xs transition-all",
              isCompactVariant
                ? "h-12 rounded-lg border-white/[0.08] bg-[#111111] px-3 hover:bg-[#171717]"
                : "h-8 rounded-md border-input/80 bg-muted/40 px-2 hover:bg-muted/60",
              "disabled:cursor-not-allowed disabled:opacity-50",
              isOpen && "border-primary/50 ring-2 ring-primary/10",
            )}
          >
            {breadcrumb ? (
              <span className="min-w-0 flex flex-1 items-center gap-2 text-left">
                <ModelIcon modelId={value || ""} variant={variant} />
                <span
                  className="min-w-0 truncate text-sm font-medium text-foreground"
                  title={selectedModel?.name || value}
                >
                  {hideVariantSelector
                    ? selectedDisplayName
                    : selectedModel?.name || formatSlug(breadcrumb.familyName)}
                </span>
                {selectedBadge && <ModelTag badge={selectedBadge} />}
              </span>
            ) : (
              <span className="text-muted-foreground flex-1 text-left">
                {t("playground.selectModel")}
              </span>
            )}
            {isCompactVariant ? (
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground shrink-0 ml-auto transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            ) : (
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
            )}
          </button>

          {/* Search dropdown */}
          {isOpen && (
            <div
              className={cn(
                "absolute z-50 mt-1.5 w-full border shadow-xl animate-in fade-in-0 zoom-in-95",
                isCompactVariant
                  ? "rounded-lg border-white/[0.08] bg-[#111111]"
                  : "rounded-xl border-border/80 bg-popover",
              )}
            >
              <div className="flex items-center border-b px-3">
                <Search className="h-4 w-4 shrink-0 opacity-50" />
                <input
                  ref={inputRef}
                  type="text"
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("playground.searchModels")}
                  className="flex h-10 w-full bg-transparent px-2 py-3 text-sm outline-none placeholder:text-muted-foreground"
                />
                {localSearch && (
                  <button
                    onClick={handleClear}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div
                ref={listRef}
                className={cn(
                  "overflow-auto p-1.5",
                  isCompactVariant ? "max-h-[520px]" : "max-h-72",
                )}
              >
                {filteredModels.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    {t("models.noResults")}
                  </div>
                ) : (
                  filteredModels.map((model, idx) => {
                    const isSelected =
                      value &&
                      (isVideoVariant
                        ? getVideoGroupKey(value) ===
                          getVideoGroupKey(model.model_id)
                        : isAvatarVariant
                          ? getAvatarGroupKey(value) ===
                            getAvatarGroupKey(model.model_id)
                          : getBaseFamily(value) ===
                            getBaseFamily(model.model_id));
                    const isHighlighted = idx === highlightIndex;
                    const family = getModelFamily(model.model_id);
                    const displayName = isVideoVariant
                      ? getVideoDisplayName(model)
                      : isAvatarVariant
                        ? getAvatarDisplayName(model)
                        : hideVariantSelector
                          ? formatSlug(getFamilyName(model.model_id))
                          : model.name ||
                            formatSlug(getFamilyName(model.model_id));
                    const badge = getModelBadge(model.model_id);
                    return (
                      <button
                        key={model.model_id}
                        type="button"
                        ref={(el) => {
                          if (isHighlighted && el) {
                            el.scrollIntoView({ block: "nearest" });
                          }
                        }}
                        data-selected={isSelected || undefined}
                        onClick={() => handleSelect(model.model_id)}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        title={model.model_id}
                        className={cn(
                          "relative flex w-full cursor-pointer select-none items-center rounded-md text-sm outline-none",
                          isCompactVariant
                            ? "h-11 gap-2 px-2.5 text-[#e5e7eb] hover:bg-white/[0.08]"
                            : "px-2 py-1.5 hover:bg-accent hover:text-accent-foreground",
                          isHighlighted &&
                            (isCompactVariant
                              ? "bg-white/[0.08] text-white"
                              : "bg-accent text-accent-foreground"),
                          isSelected &&
                            isCompactVariant &&
                            "bg-white/[0.12] text-white",
                        )}
                      >
                        <ModelIcon modelId={model.model_id} variant={variant} />
                        <span
                          className={cn(
                            "min-w-0 flex flex-1 items-start",
                            isCompactVariant ? "flex-row" : "flex-col",
                          )}
                        >
                          <span className="flex max-w-full items-center gap-2">
                            <span className="truncate font-medium">
                              {displayName}
                            </span>
                            {badge && <ModelTag badge={badge} />}
                          </span>
                          {!isCompactVariant && (
                            <span className="text-xs text-muted-foreground/60 truncate max-w-full">
                              {family}
                            </span>
                          )}
                        </span>
                        {isFavorite(model.model_id) && (
                          <Star className="ml-auto h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400" />
                        )}
                        {isSelected && isCompactVariant && (
                          <Check className="ml-2 h-4 w-4 shrink-0 text-white" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Row 2: Variant dropdown — custom popover */}
        {!hideVariantSelector && selectedModel && familyVariants.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap shrink-0">
              {t("playground.specificFunction", "Specific Model Function")}
            </label>
            <div ref={variantRef} className="relative flex-1 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setVariantOpen(!variantOpen);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex h-8 w-full items-center gap-1 rounded-lg border border-input/80 bg-muted/40 px-2.5 text-sm transition-all cursor-pointer",
                  "hover:bg-muted/60",
                  variantOpen && "border-primary/50 ring-2 ring-primary/10",
                )}
              >
                <span className="flex-1 text-left truncate">
                  {getVariantLabel(value!, currentBaseFamily)}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform",
                    variantOpen && "rotate-180",
                  )}
                />
              </button>

              {variantOpen && (
                <div className="absolute z-50 mt-1 min-w-full w-max max-w-[280px] rounded-xl border border-border/80 bg-popover shadow-xl animate-in fade-in-0 zoom-in-95">
                  <div className="max-h-60 overflow-auto p-1">
                    {variantsByType.map(([type, variants], idx) => (
                      <div key={type}>
                        {idx > 0 && (
                          <div className="mx-2 my-1 border-t border-border/50" />
                        )}
                        <div className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                          {formatType(type)}
                        </div>
                        {variants.map((variant) => (
                          <button
                            key={variant.model_id}
                            type="button"
                            title={getVariantLabel(
                              variant.model_id,
                              currentBaseFamily,
                            )}
                            onClick={() => {
                              onChange(variant.model_id);
                              setVariantOpen(false);
                            }}
                            className={cn(
                              "relative flex w-full cursor-pointer select-none items-center justify-between rounded-lg px-2 py-1 text-sm outline-none",
                              "hover:bg-accent hover:text-accent-foreground",
                              variant.model_id === value &&
                                "bg-primary/10 text-foreground font-medium",
                            )}
                          >
                            <span className="truncate">
                              {getVariantLabel(
                                variant.model_id,
                                currentBaseFamily,
                              )}
                            </span>
                            {variant.model_id === value && (
                              <Check className="ml-2 h-3.5 w-3.5 shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
