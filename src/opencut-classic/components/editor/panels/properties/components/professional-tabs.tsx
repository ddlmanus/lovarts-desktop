"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ChevronDown,
  Check,
  Diamond,
  HelpCircle,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Unlock,
  Volume2,
  WandSparkles,
} from "lucide-react";
import type { AnimationPath } from "@/opencut-classic/animation/types";
import { buildDefaultEffectInstance } from "@/opencut-classic/effects";
import type { Effect } from "@/opencut-classic/effects/types";
import { useEditor } from "@/opencut-classic/editor/use-editor";
import { MasksTab } from "@/opencut-classic/masks/components/masks-tab";
import { buildConstantRetime } from "@/opencut-classic/retime";
import {
  DEFAULT_RETIME_RATE,
  MAX_RETIME_RATE,
  MIN_RETIME_RATE,
  canMaintainPitch,
  clampRetimeRate,
} from "@/opencut-classic/retime/rate";
import type {
  AudioElement,
  MaskableElement,
  RetimableElement,
  TimelineElement,
  VideoElement,
  VisualElement,
} from "@/opencut-classic/timeline";
import { DEFAULTS } from "@/opencut-classic/timeline/defaults";
import { useElementPreview } from "@/opencut-classic/timeline/hooks/use-element-preview";
import { cn } from "@/opencut-classic/utils/ui";
import {
  mediaTimeFromSeconds,
  mediaTimeToSeconds,
} from "@/opencut-classic/wasm";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/opencut-classic/components/section";
import { Button } from "@/opencut-classic/components/ui/button";
import { NumberField } from "@/opencut-classic/components/ui/number-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/opencut-classic/components/ui/select";
import { Slider } from "@/opencut-classic/components/ui/slider";
import { Switch } from "@/opencut-classic/components/ui/switch";

type PictureSubTab = "base" | "cutout" | "mask";
type AudioSubTab = "base" | "voice";
type SpeedSubTab = "normal" | "curve";
type AnimationSubTab = "in" | "out" | "combo";
type AdjustmentSubTab = "base" | "hsl" | "curve" | "colorWheel" | "lut";

const BLEND_MODES = [
  "normal",
  "darken",
  "multiply",
  "color-burn",
  "lighten",
  "screen",
  "plus-lighter",
  "color-dodge",
  "overlay",
  "soft-light",
  "hard-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;

const PICTURE_BASE_FEATURES = [
  { key: "distort", info: true },
  { key: "stabilize" },
  { key: "enhanceQuality", badge: "trial3" },
  { key: "videoDenoise", premium: true },
  { key: "aiFrameInterpolation", premium: true },
  { key: "aiExpand", badge: "freeLimited" },
  { key: "aiErase", badge: "trial" },
] as const;

const CUTOUT_FEATURES = [
  { key: "smartCutout", premium: true },
  { key: "customCutout" },
  { key: "chromaKey" },
] as const;

const AI_EFFECT_FEATURES = [
  { key: "eyeCorrection", badge: "freeLimited", info: true },
  { key: "lipSync", badge: "trial" },
  { key: "smartLight", premium: true },
  { key: "smartCrop", premium: true },
  { key: "resolutionFill", premium: true },
  { key: "deflicker", premium: true },
  { key: "smartMotion", premium: true },
  { key: "lensTracking", premium: true },
  { key: "motionBlur", info: true },
] as const;

const VOICE_CARDS = [
  "warmFemale",
  "clearMale",
  "energetic",
  "narration",
] as const;

const ADJUSTMENT_FIELDS = [
  {
    effectType: "color-adjust",
    key: "brightness",
    min: -100,
    max: 100,
    step: 1,
  },
  { effectType: "color-adjust", key: "contrast", min: -100, max: 100, step: 1 },
  {
    effectType: "color-adjust",
    key: "saturation",
    min: -100,
    max: 100,
    step: 1,
  },
  { effectType: "color-adjust", key: "exposure", min: -2, max: 2, step: 0.05 },
  {
    effectType: "color-adjust",
    key: "temperature",
    min: -100,
    max: 100,
    step: 1,
  },
  { effectType: "color-adjust", key: "tint", min: -100, max: 100, step: 1 },
  {
    effectType: "color-adjust",
    key: "highlights",
    min: -100,
    max: 100,
    step: 1,
  },
  { effectType: "color-adjust", key: "shadows", min: -100, max: 100, step: 1 },
  { effectType: "sharpen", key: "amount", min: 0, max: 100, step: 1 },
  { effectType: "vignette", key: "amount", min: -100, max: 100, step: 1 },
] as const;

const ANIMATION_PRESETS = [
  { key: "fade" },
  { key: "slideLeft" },
  { key: "slideUp" },
  { key: "zoom" },
] as const;

const FEATURE_PARAM_PREFIX = "professional";

function numberParam(
  params: Record<string, unknown>,
  key: string,
  fallback = 0,
): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolParam(params: Record<string, unknown>, key: string): boolean {
  return params[key] === true;
}

function stringParam(
  params: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  const value = params[key];
  return typeof value === "string" ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sectionKey(element: TimelineElement, key: string): string {
  return `${element.id}:professional:${key}`;
}

function buildRetime({
  rate,
  maintainPitch,
}: {
  rate: number;
  maintainPitch: boolean;
}) {
  if (rate === DEFAULT_RETIME_RATE && !maintainPitch) return undefined;
  return buildConstantRetime({ rate, maintainPitch });
}

function featureParamKey(featureKey: string, paramKey: string): string {
  return `${FEATURE_PARAM_PREFIX}.${featureKey}.${paramKey}`;
}

function featureCopy(
  t: ReturnType<typeof useTranslation>["t"],
  key: string,
  fallback: string,
): string {
  return t(`freeTools.mediaTrimmer.editor.featureControls.${key}`, {
    defaultValue: fallback,
  });
}

function isMaskableElement(
  element: TimelineElement,
): element is MaskableElement {
  return ["video", "image", "graphic"].includes(element.type);
}

function SmallTabs<T extends string>({
  value,
  tabs,
  onChange,
  i18nPrefix,
}: {
  value: T;
  tabs: readonly T[];
  onChange: (value: T) => void;
  i18nPrefix: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2.5">
      {tabs.map((tab) => (
        <Button
          key={tab}
          type="button"
          variant="ghost"
          className={cn(
            "h-6 flex-1 rounded-[4px] px-1.5 text-[12px] font-medium text-muted-foreground",
            value === tab && "bg-secondary text-foreground",
          )}
          onClick={() => onChange(tab)}
        >
          {t(`${i18nPrefix}.${tab}`)}
        </Button>
      ))}
    </div>
  );
}

function CompactNumber({
  value,
  min,
  max,
  step = 1,
  icon,
  suffix,
  onPreview,
  onCommit,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  icon?: ReactNode;
  suffix?: string;
  onPreview: (value: number) => void;
  onCommit: () => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(
      String(Number.isInteger(value) ? value : Number(value.toFixed(2))),
    );
  }, [value]);

  const normalize = (raw: number) => {
    const snapped = Math.round(raw / step) * step;
    return clamp(snapped, min ?? -100_000, max ?? 100_000);
  };

  const commitDraft = () => {
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    onPreview(normalize(parsed));
    onCommit();
  };

  return (
    <NumberField
      icon={icon}
      value={draft}
      suffix={suffix}
      dragSensitivity="slow"
      scrubClamp={{ min, max }}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setDraft(next);
        const parsed = Number.parseFloat(next);
        if (Number.isFinite(parsed)) onPreview(normalize(parsed));
      }}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if (event.key === "Enter") commitDraft();
      }}
      onScrub={(next) => {
        const normalized = normalize(next);
        setDraft(String(normalized));
        onPreview(normalized);
      }}
      onScrubEnd={onCommit}
    />
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onPreview,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onPreview: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <div className="grid grid-cols-[58px_minmax(0,1fr)_70px] items-center gap-2.5">
      <ControlLabel>{label}</ControlLabel>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onPreview(next)}
        onValueCommit={onCommit}
      />
      <CompactNumber
        value={value}
        min={min}
        max={max}
        step={step}
        suffix={suffix}
        onPreview={onPreview}
        onCommit={onCommit}
      />
    </div>
  );
}

function FeatureRow({
  title,
  description,
  badge,
  premium,
  info,
  checked = false,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  badge?: string;
  premium?: boolean;
  info?: boolean;
  checked?: boolean;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-border/70">
      <button
        type="button"
        className="flex min-h-[38px] w-full items-center gap-2 px-3 text-left transition-colors hover:bg-secondary/30"
        onClick={() => setOpen((next) => !next)}
      >
        <span
          className={cn(
            "flex size-[13px] shrink-0 items-center justify-center rounded-[3px] border",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/30 bg-secondary/60",
          )}
        >
          {checked && <Check className="size-2" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="property-feature-title truncate text-foreground">
              {title}
            </span>
            {info && <HelpCircle className="size-3 text-muted-foreground" />}
            {premium && (
              <Diamond className="size-3 fill-primary text-primary" />
            )}
            {badge && (
              <span className="rounded-[3px] bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary">
                {badge}
              </span>
            )}
          </span>
          {description && (
            <span className="property-feature-hint mt-0.5 block truncate text-muted-foreground">
              {description}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-border/60 bg-background/35 px-3 py-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

function FeatureRows({
  items,
  i18nPrefix,
  element,
  trackId,
}: {
  items: readonly {
    key: string;
    badge?: string;
    premium?: boolean;
    info?: boolean;
  }[];
  i18nPrefix: string;
  element: TimelineElement;
  trackId: string;
}) {
  const { t } = useTranslation();

  return (
    <>
      {items.map((item) => (
        <FeatureControlRow
          key={item.key}
          item={item}
          title={t(`${i18nPrefix}.${item.key}`)}
          description={t(`${i18nPrefix}.${item.key}Hint`)}
          badge={
            item.badge
              ? t(`freeTools.mediaTrimmer.editor.badges.${item.badge}`)
              : undefined
          }
          premium={item.premium}
          info={item.info}
          element={element}
          trackId={trackId}
        />
      ))}
    </>
  );
}

function ControlLabel({ children }: { children: ReactNode }) {
  return <div className="property-label text-muted-foreground">{children}</div>;
}

function SelectControlRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-2.5">
      <ControlLabel>{label}</ControlLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 w-full rounded-[5px] bg-secondary/50 text-[12px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SegmentedControlRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-2.5">
      <ControlLabel>{label}</ControlLabel>
      <div className="grid min-w-0 grid-flow-col auto-cols-fr gap-1 rounded-[5px] bg-secondary/50 p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              "h-6 min-w-0 truncate rounded-[4px] px-1.5 text-[11px] text-muted-foreground transition-colors",
              value === option.value && "bg-background text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SwitchControlRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex h-7 items-center justify-between gap-3">
      <ControlLabel>{label}</ControlLabel>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ColorControlRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-2.5">
      <ControlLabel>{label}</ControlLabel>
      <label className="flex h-7 cursor-pointer items-center gap-2 rounded-[5px] border bg-secondary/45 px-2 text-[12px] text-muted-foreground">
        <span
          className="size-4 rounded-[3px] border border-foreground/20"
          style={{ backgroundColor: value }}
        />
        <span className="font-mono text-[11px] uppercase">{value}</span>
        <input
          type="color"
          value={value}
          className="sr-only"
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
    </div>
  );
}

function StatusStrip({
  status,
  idleText,
}: {
  status: string;
  idleText: string;
}) {
  const { t } = useTranslation();
  const label =
    status === "queued"
      ? featureCopy(t, "statusQueued", "已加入队列")
      : status === "processing"
        ? featureCopy(t, "statusProcessing", "处理中")
        : status === "done"
          ? featureCopy(t, "statusDone", "已完成")
          : idleText;

  return (
    <div className="flex h-7 items-center gap-2 rounded-[5px] bg-secondary/35 px-2 text-[11px] text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "done"
            ? "bg-primary"
            : status === "queued" || status === "processing"
              ? "bg-primary/70"
              : "bg-muted-foreground/45",
        )}
      />
      <span className="truncate">{label}</span>
    </div>
  );
}

function ActionButtons({
  onApply,
  onReset,
  applyLabel,
}: {
  onApply: () => void;
  onReset?: () => void;
  applyLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Button
        type="button"
        variant="secondary"
        className="h-7 rounded-[5px] text-[12px]"
        onClick={onReset}
        disabled={!onReset}
      >
        <RefreshCw className="size-3.5" />
        {featureCopy(t, "reset", "重置")}
      </Button>
      <Button
        type="button"
        className="h-7 rounded-[5px] text-[12px]"
        onClick={onApply}
      >
        <Play className="size-3.5" />
        {applyLabel}
      </Button>
    </div>
  );
}

function useClipFeature({
  element,
  trackId,
  featureKey,
}: {
  element: TimelineElement;
  trackId: string;
  featureKey: string;
}) {
  const { renderElement, previewUpdates, commit } = useElementPreview({
    trackId,
    elementId: element.id,
    fallback: element,
  });
  const params = renderElement.params;
  const enabled = boolParam(params, featureParamKey(featureKey, "enabled"));
  const status = stringParam(params, featureParamKey(featureKey, "status"));

  const updateFeatureParams = (nextParams: Record<string, unknown>) => {
    previewUpdates({ params: { ...params, ...nextParams } });
    commit();
  };

  const setFeatureParam = (paramKey: string, value: unknown) => {
    updateFeatureParams({ [featureParamKey(featureKey, paramKey)]: value });
  };

  const getNumber = (paramKey: string, fallback: number) =>
    numberParam(params, featureParamKey(featureKey, paramKey), fallback);

  const getString = (paramKey: string, fallback: string) =>
    stringParam(params, featureParamKey(featureKey, paramKey), fallback);

  const getBoolean = (paramKey: string, fallback = false) => {
    const value = params[featureParamKey(featureKey, paramKey)];
    return typeof value === "boolean" ? value : fallback;
  };

  const setEnabled = (nextEnabled: boolean) => {
    updateFeatureParams({
      [featureParamKey(featureKey, "enabled")]: nextEnabled,
      [featureParamKey(featureKey, "status")]: nextEnabled ? "done" : "",
    });
  };

  const queue = () => {
    updateFeatureParams({
      [featureParamKey(featureKey, "enabled")]: true,
      [featureParamKey(featureKey, "status")]: "queued",
    });
  };

  const reset = () => {
    const nextParams = Object.fromEntries(
      Object.entries(params).filter(
        ([key]) => !key.startsWith(`${FEATURE_PARAM_PREFIX}.${featureKey}.`),
      ),
    );
    previewUpdates({ params: nextParams });
    commit();
  };

  return {
    enabled,
    status,
    setEnabled,
    setFeatureParam,
    updateFeatureParams,
    getNumber,
    getString,
    getBoolean,
    queue,
    reset,
  };
}

function FeatureControlRow({
  item,
  title,
  description,
  badge,
  premium,
  info,
  element,
  trackId,
}: {
  item: {
    key: string;
    badge?: string;
    premium?: boolean;
    info?: boolean;
  };
  title: string;
  description?: string;
  badge?: string;
  premium?: boolean;
  info?: boolean;
  element: TimelineElement;
  trackId: string;
}) {
  const feature = useClipFeature({ element, trackId, featureKey: item.key });
  const checked = feature.enabled || feature.status === "queued" || feature.status === "processing";

  return (
    <FeatureRow
      title={title}
      description={description}
      badge={badge}
      premium={premium}
      info={info}
      checked={checked}
    >
      <FeatureControls featureKey={item.key} feature={feature} />
    </FeatureRow>
  );
}

function FeatureControls({
  featureKey,
  feature,
}: {
  featureKey: string;
  feature: ReturnType<typeof useClipFeature>;
}) {
  const { t } = useTranslation();
  const modeLabel = featureCopy(t, "mode", "模式");
  const strengthLabel = featureCopy(t, "strength", "强度");
  const applyLabel = featureCopy(t, "apply", "应用");
  const generateLabel = featureCopy(t, "generate", "生成");
  const enterLabel = featureCopy(t, "enterEdit", "进入编辑");
  const idleText = featureCopy(t, "statusIdle", "未应用");

  if (featureKey === "distort") {
    return (
      <>
        <SwitchControlRow
          label={featureCopy(t, "dragDistort", "拖拽变形")}
          checked={feature.enabled}
          onChange={feature.setEnabled}
        />
        <SegmentedControlRow
          label={modeLabel}
          value={feature.getString("mode", "corner")}
          options={[
            { value: "corner", label: featureCopy(t, "cornerDrag", "四角") },
            { value: "free", label: featureCopy(t, "freeDistort", "自由") },
            { value: "mirror", label: featureCopy(t, "mirror", "镜像") },
          ]}
          onChange={(value) => feature.setFeatureParam("mode", value)}
        />
        <SliderRow
          label={featureCopy(t, "perspective", "透视")}
          value={feature.getNumber("perspective", 0)}
          min={-100}
          max={100}
          onPreview={(value) => feature.setFeatureParam("perspective", value)}
          onCommit={() => undefined}
        />
        <ActionButtons
          applyLabel={enterLabel}
          onApply={() => feature.setEnabled(true)}
          onReset={feature.reset}
        />
      </>
    );
  }

  if (featureKey === "stabilize") {
    return (
      <>
        <SelectControlRow
          label={strengthLabel}
          value={feature.getString("strength", "standard")}
          options={[
            { value: "light", label: featureCopy(t, "light", "轻微") },
            { value: "standard", label: featureCopy(t, "standard", "标准") },
            { value: "strong", label: featureCopy(t, "strong", "强烈") },
          ]}
          onChange={(value) => feature.setFeatureParam("strength", value)}
        />
        <SelectControlRow
          label={featureCopy(t, "cropRatio", "裁切")}
          value={feature.getString("crop", "balanced")}
          options={[
            { value: "minimal", label: featureCopy(t, "cropMinimal", "最小裁切") },
            { value: "balanced", label: featureCopy(t, "balanced", "平衡") },
            { value: "stable", label: featureCopy(t, "stableFirst", "稳定优先") },
          ]}
          onChange={(value) => feature.setFeatureParam("crop", value)}
        />
        <StatusStrip status={feature.status} idleText={idleText} />
        <ActionButtons applyLabel={applyLabel} onApply={feature.queue} onReset={feature.reset} />
      </>
    );
  }

  if (featureKey === "enhanceQuality") {
    return (
      <>
        <SelectControlRow
          label={featureCopy(t, "quality", "画质")}
          value={feature.getString("level", "hd")}
          options={[
            { value: "standard", label: featureCopy(t, "standard", "标准") },
            { value: "hd", label: featureCopy(t, "hd", "高清") },
            { value: "ultra", label: featureCopy(t, "ultra", "超清") },
          ]}
          onChange={(value) => feature.setFeatureParam("level", value)}
        />
        <SliderRow
          label={featureCopy(t, "detail", "细节")}
          value={feature.getNumber("detail", 50)}
          min={0}
          max={100}
          onPreview={(value) => feature.setFeatureParam("detail", value)}
          onCommit={() => undefined}
        />
        <StatusStrip status={feature.status} idleText={idleText} />
        <ActionButtons applyLabel={applyLabel} onApply={feature.queue} onReset={feature.reset} />
      </>
    );
  }

  if (featureKey === "videoDenoise") {
    return (
      <>
        <SelectControlRow
          label={modeLabel}
          value={feature.getString("scene", "auto")}
          options={[
            { value: "auto", label: featureCopy(t, "auto", "自动") },
            { value: "portrait", label: featureCopy(t, "portrait", "人像") },
            { value: "night", label: featureCopy(t, "night", "夜景") },
          ]}
          onChange={(value) => feature.setFeatureParam("scene", value)}
        />
        <SliderRow
          label={strengthLabel}
          value={feature.getNumber("amount", 45)}
          min={0}
          max={100}
          onPreview={(value) => feature.setFeatureParam("amount", value)}
          onCommit={() => undefined}
        />
        <StatusStrip status={feature.status} idleText={idleText} />
        <ActionButtons applyLabel={applyLabel} onApply={feature.queue} onReset={feature.reset} />
      </>
    );
  }

  if (featureKey === "audioDenoise" || featureKey === "voiceEnhance") {
    return (
      <>
        <SelectControlRow
          label={modeLabel}
          value={feature.getString("mode", "auto")}
          options={[
            { value: "auto", label: featureCopy(t, "auto", "自动") },
            { value: "standard", label: featureCopy(t, "standard", "标准") },
            { value: "strong", label: featureCopy(t, "strong", "强烈") },
          ]}
          onChange={(value) => feature.setFeatureParam("mode", value)}
        />
        <SliderRow
          label={strengthLabel}
          value={feature.getNumber("amount", 45)}
          min={0}
          max={100}
          onPreview={(value) => feature.setFeatureParam("amount", value)}
          onCommit={() => undefined}
        />
        <StatusStrip status={feature.status} idleText={idleText} />
        <ActionButtons applyLabel={applyLabel} onApply={feature.queue} onReset={feature.reset} />
      </>
    );
  }

  if (featureKey === "aiFrameInterpolation") {
    return (
      <>
        <SelectControlRow
          label={featureCopy(t, "targetFps", "帧率")}
          value={feature.getString("fps", "60")}
          options={[
            { value: "30", label: "30 FPS" },
            { value: "60", label: "60 FPS" },
            { value: "120", label: "120 FPS" },
          ]}
          onChange={(value) => feature.setFeatureParam("fps", value)}
        />
        <SwitchControlRow
          label={featureCopy(t, "motionProtect", "运动保护")}
          checked={feature.getBoolean("motionProtect", true)}
          onChange={(value) => feature.setFeatureParam("motionProtect", value)}
        />
        <StatusStrip status={feature.status} idleText={idleText} />
        <ActionButtons applyLabel={applyLabel} onApply={feature.queue} onReset={feature.reset} />
      </>
    );
  }

  if (featureKey === "aiExpand") {
    return (
      <>
        <SelectControlRow
          label={featureCopy(t, "ratio", "比例")}
          value={feature.getString("ratio", "original")}
          options={[
            { value: "original", label: featureCopy(t, "original", "原比例") },
            { value: "9:16", label: "9:16" },
            { value: "16:9", label: "16:9" },
            { value: "1:1", label: "1:1" },
          ]}
          onChange={(value) => feature.setFeatureParam("ratio", value)}
        />
        <SegmentedControlRow
          label={featureCopy(t, "direction", "方向")}
          value={feature.getString("direction", "all")}
          options={[
            { value: "all", label: featureCopy(t, "all", "四周") },
            { value: "horizontal", label: featureCopy(t, "horizontal", "横向") },
            { value: "vertical", label: featureCopy(t, "vertical", "纵向") },
          ]}
          onChange={(value) => feature.setFeatureParam("direction", value)}
        />
        <StatusStrip status={feature.status} idleText={idleText} />
        <ActionButtons applyLabel={generateLabel} onApply={feature.queue} onReset={feature.reset} />
      </>
    );
  }

  if (featureKey === "aiErase") {
    return (
      <>
        <SliderRow
          label={featureCopy(t, "brush", "画笔")}
          value={feature.getNumber("brushSize", 28)}
          min={4}
          max={120}
          suffix="px"
          onPreview={(value) => feature.setFeatureParam("brushSize", value)}
          onCommit={() => undefined}
        />
        <SegmentedControlRow
          label={modeLabel}
          value={feature.getString("eraseMode", "object")}
          options={[
            { value: "object", label: featureCopy(t, "object", "物体") },
            { value: "scratch", label: featureCopy(t, "scratch", "涂抹") },
          ]}
          onChange={(value) => feature.setFeatureParam("eraseMode", value)}
        />
        <StatusStrip status={feature.status} idleText={idleText} />
        <ActionButtons applyLabel={enterLabel} onApply={feature.queue} onReset={feature.reset} />
      </>
    );
  }

  if (featureKey === "smartCutout") {
    return (
      <>
        <SegmentedControlRow
          label={modeLabel}
          value={feature.getString("mode", "basic")}
          options={[
            { value: "basic", label: featureCopy(t, "basic", "基础") },
            { value: "fine", label: featureCopy(t, "fine", "精细") },
          ]}
          onChange={(value) => feature.setFeatureParam("mode", value)}
        />
        <SliderRow
          label={featureCopy(t, "feather", "羽化")}
          value={feature.getNumber("feather", 0)}
          min={0}
          max={100}
          onPreview={(value) => feature.setFeatureParam("feather", value)}
          onCommit={() => undefined}
        />
        <StatusStrip status={feature.status} idleText={idleText} />
        <ActionButtons applyLabel={applyLabel} onApply={feature.queue} onReset={feature.reset} />
      </>
    );
  }

  if (featureKey === "customCutout") {
    return (
      <>
        <SegmentedControlRow
          label={modeLabel}
          value={feature.getString("paintMode", "keep")}
          options={[
            { value: "keep", label: featureCopy(t, "keep", "保留") },
            { value: "remove", label: featureCopy(t, "remove", "擦除") },
          ]}
          onChange={(value) => feature.setFeatureParam("paintMode", value)}
        />
        <SliderRow
          label={featureCopy(t, "brush", "画笔")}
          value={feature.getNumber("brushSize", 32)}
          min={4}
          max={120}
          suffix="px"
          onPreview={(value) => feature.setFeatureParam("brushSize", value)}
          onCommit={() => undefined}
        />
        <StatusStrip status={feature.status} idleText={idleText} />
        <ActionButtons applyLabel={enterLabel} onApply={feature.queue} onReset={feature.reset} />
      </>
    );
  }

  if (featureKey === "chromaKey") {
    return (
      <>
        <ColorControlRow
          label={featureCopy(t, "keyColor", "颜色")}
          value={feature.getString("color", "#00ff00")}
          onChange={(value) => feature.setFeatureParam("color", value)}
        />
        <SliderRow
          label={strengthLabel}
          value={feature.getNumber("strength", 45)}
          min={0}
          max={100}
          onPreview={(value) => feature.setFeatureParam("strength", value)}
          onCommit={() => undefined}
        />
        <SliderRow
          label={featureCopy(t, "edge", "边缘")}
          value={feature.getNumber("edge", 20)}
          min={0}
          max={100}
          onPreview={(value) => feature.setFeatureParam("edge", value)}
          onCommit={() => undefined}
        />
        <ActionButtons applyLabel={applyLabel} onApply={() => feature.setEnabled(true)} onReset={feature.reset} />
      </>
    );
  }

  const aiSelectOptions: Record<string, readonly { value: string; label: string }[]> = {
    lipSync: [
      { value: "clip", label: featureCopy(t, "clipAudio", "片段音频") },
      { value: "import", label: featureCopy(t, "importAudio", "导入音频") },
      { value: "tts", label: featureCopy(t, "tts", "文本配音") },
    ],
    smartCrop: [
      { value: "9:16", label: "9:16" },
      { value: "16:9", label: "16:9" },
      { value: "1:1", label: "1:1" },
      { value: "4:5", label: "4:5" },
    ],
    resolutionFill: [
      { value: "1080p", label: "1080p" },
      { value: "2k", label: "2K" },
      { value: "4k", label: "4K" },
    ],
    deflicker: [
      { value: "auto", label: featureCopy(t, "auto", "自动") },
      { value: "50hz", label: "50Hz" },
      { value: "60hz", label: "60Hz" },
    ],
    smartMotion: [
      { value: "push", label: featureCopy(t, "pushIn", "推近") },
      { value: "pull", label: featureCopy(t, "pullOut", "拉远") },
      { value: "pan", label: featureCopy(t, "pan", "平移") },
    ],
    lensTracking: [
      { value: "person", label: featureCopy(t, "person", "人像") },
      { value: "object", label: featureCopy(t, "object", "物体") },
      { value: "custom", label: featureCopy(t, "custom", "自定义") },
    ],
  };

  return (
    <>
      <SelectControlRow
        label={modeLabel}
        value={feature.getString("mode", aiSelectOptions[featureKey]?.[0]?.value ?? "auto")}
        options={
          aiSelectOptions[featureKey] ?? [
            { value: "auto", label: featureCopy(t, "auto", "自动") },
            { value: "standard", label: featureCopy(t, "standard", "标准") },
          ]
        }
        onChange={(value) => feature.setFeatureParam("mode", value)}
      />
      <SliderRow
        label={featureKey === "motionBlur" ? featureCopy(t, "amount", "数量") : strengthLabel}
        value={feature.getNumber("amount", 50)}
        min={0}
        max={100}
        onPreview={(value) => feature.setFeatureParam("amount", value)}
        onCommit={() => undefined}
      />
      <StatusStrip status={feature.status} idleText={idleText} />
      <ActionButtons applyLabel={applyLabel} onApply={feature.queue} onReset={feature.reset} />
    </>
  );
}

function BlendFeatureRow({
  opacity,
  blendMode,
  onPreviewParams,
  onCommit,
}: {
  opacity: number;
  blendMode: string;
  onPreviewParams: (nextParams: Record<string, unknown>) => void;
  onCommit: () => void;
}) {
  const { t } = useTranslation();

  return (
    <FeatureRow
      title={t("freeTools.mediaTrimmer.editor.inspector.blend")}
      checked={blendMode !== DEFAULTS.element.blendMode || opacity < 1}
      defaultOpen={false}
    >
      <SliderRow
        label={t("freeTools.mediaTrimmer.editor.inspector.opacity")}
        value={Math.round(opacity * 100)}
        min={0}
        max={100}
        suffix="%"
        onPreview={(value) => onPreviewParams({ opacity: value / 100 })}
        onCommit={onCommit}
      />
      <div className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-2.5">
        <ControlLabel>
          {t("freeTools.mediaTrimmer.editor.inspector.blendMode")}
        </ControlLabel>
        <Select
          value={blendMode}
          onValueChange={(value) => {
            onPreviewParams({ blendMode: value });
            onCommit();
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BLEND_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {t(
                  `freeTools.mediaTrimmer.editor.paramOptions.blendMode.${mode.replace(/-/g, "_")}`,
                  { defaultValue: mode },
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </FeatureRow>
  );
}
export function PictureInspectorTab({
  element,
  trackId,
}: {
  element: VisualElement;
  trackId: string;
}) {
  const [subTab, setSubTab] = useState<PictureSubTab>("base");
  const canMask = isMaskableElement(element);
  const tabs: PictureSubTab[] = canMask ? ["base", "cutout", "mask"] : ["base"];

  return (
    <div className="flex h-full flex-col">
      <SmallTabs
        value={subTab}
        tabs={tabs}
        onChange={setSubTab}
        i18nPrefix="freeTools.mediaTrimmer.editor.propertySubTabs"
      />
      {subTab === "base" && (
        <PictureBasePanel element={element} trackId={trackId} />
      )}
      {subTab === "cutout" && (
        <CutoutPanel element={element} trackId={trackId} />
      )}
      {subTab === "mask" && canMask && (
        <MasksTab element={element} trackId={trackId} />
      )}
    </div>
  );
}

function PictureBasePanel({
  element,
  trackId,
}: {
  element: VisualElement;
  trackId: string;
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const canvasSize = useEditor(
    (e) => e.project.getActive().settings.canvasSize,
  );
  const { renderElement, previewUpdates, commit } = useElementPreview({
    trackId,
    elementId: element.id,
    fallback: element,
  });
  const [lockScale, setLockScale] = useState(true);
  const params = renderElement.params;
  const scaleX = numberParam(
    params,
    "transform.scaleX",
    DEFAULTS.element.transform.scaleX,
  );
  const scaleY = numberParam(
    params,
    "transform.scaleY",
    DEFAULTS.element.transform.scaleY,
  );
  const positionX = numberParam(
    params,
    "transform.positionX",
    DEFAULTS.element.transform.position.x,
  );
  const positionY = numberParam(
    params,
    "transform.positionY",
    DEFAULTS.element.transform.position.y,
  );
  const rotate = numberParam(
    params,
    "transform.rotate",
    DEFAULTS.element.transform.rotate,
  );
  const opacity = numberParam(params, "opacity", DEFAULTS.element.opacity);
  const blendMode = String(params.blendMode ?? DEFAULTS.element.blendMode);
  const scalePercent = Math.round(
    ((Math.abs(scaleX) + Math.abs(scaleY)) / 2) * 100,
  );

  const previewParams = (nextParams: Record<string, unknown>) => {
    previewUpdates({ params: { ...renderElement.params, ...nextParams } });
  };

  const setScalePercent = (nextPercent: number) => {
    const nextScale = clamp(nextPercent, 1, 500) / 100;
    if (lockScale) {
      previewParams({
        "transform.scaleX": nextScale * (scaleX < 0 ? -1 : 1),
        "transform.scaleY": nextScale * (scaleY < 0 ? -1 : 1),
      });
      return;
    }
    previewParams({ "transform.scaleX": nextScale * (scaleX < 0 ? -1 : 1) });
  };

  const resetTransform = () => {
    editor.timeline.updateElements({
      updates: [
        {
          trackId,
          elementId: element.id,
          patch: {
            params: {
              ...element.params,
              "transform.positionX": DEFAULTS.element.transform.position.x,
              "transform.positionY": DEFAULTS.element.transform.position.y,
              "transform.scaleX": DEFAULTS.element.transform.scaleX,
              "transform.scaleY": DEFAULTS.element.transform.scaleY,
              "transform.rotate": DEFAULTS.element.transform.rotate,
            },
          },
        },
      ],
    });
  };

  const align = (patch: Record<string, number>) => {
    editor.timeline.updateElements({
      updates: [
        {
          trackId,
          elementId: element.id,
          patch: { params: { ...element.params, ...patch } },
        },
      ],
    });
  };

  const alignButtons = [
    {
      key: "left",
      icon: AlignStartVertical,
      patch: { "transform.positionX": -canvasSize.width / 4 },
    },
    {
      key: "centerX",
      icon: AlignCenterVertical,
      patch: { "transform.positionX": 0 },
    },
    {
      key: "right",
      icon: AlignEndVertical,
      patch: { "transform.positionX": canvasSize.width / 4 },
    },
    {
      key: "top",
      icon: AlignStartHorizontal,
      patch: { "transform.positionY": -canvasSize.height / 4 },
    },
    {
      key: "centerY",
      icon: AlignCenterHorizontal,
      patch: { "transform.positionY": 0 },
    },
    {
      key: "bottom",
      icon: AlignEndHorizontal,
      patch: { "transform.positionY": canvasSize.height / 4 },
    },
  ] as const;

  return (
    <div className="flex-1 overflow-y-auto">
      <Section sectionKey={sectionKey(element, "size-position")}>
        <SectionHeader
          actions={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-[5px]"
              onClick={resetTransform}
              title={t("freeTools.mediaTrimmer.editor.inspector.reset")}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          }
        >
          <SectionTitle>
            {t("freeTools.mediaTrimmer.editor.inspector.positionSize")}
          </SectionTitle>
        </SectionHeader>
        <SectionContent className="space-y-4 pb-4 pt-1">
          <SliderRow
            label={t("freeTools.mediaTrimmer.editor.inspector.scale")}
            value={scalePercent}
            min={1}
            max={500}
            suffix="%"
            onPreview={setScalePercent}
            onCommit={commit}
          />
          <div className="flex items-center justify-between rounded-[6px] bg-secondary/60 px-2.5 py-2">
            <span className="property-label text-muted-foreground">
              {t("freeTools.mediaTrimmer.editor.inspector.equalScale")}
            </span>
            <Button
              type="button"
              variant="ghost"
              className="h-7 rounded-[5px] px-2 text-[12px]"
              onClick={() => setLockScale((next) => !next)}
            >
              {lockScale ? (
                <Lock className="mr-1 size-3.5" />
              ) : (
                <Unlock className="mr-1 size-3.5" />
              )}
              {lockScale
                ? t("freeTools.mediaTrimmer.editor.inspector.locked")
                : t("freeTools.mediaTrimmer.editor.inspector.unlocked")}
            </Button>
          </div>
          <div className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-2.5">
            <ControlLabel>
              {t("freeTools.mediaTrimmer.editor.inspector.position")}
            </ControlLabel>
            <div className="grid grid-cols-2 gap-2">
              <CompactNumber
                icon="X"
                value={Math.round(positionX)}
                step={1}
                onPreview={(value) =>
                  previewParams({ "transform.positionX": value })
                }
                onCommit={commit}
              />
              <CompactNumber
                icon="Y"
                value={Math.round(positionY)}
                step={1}
                onPreview={(value) =>
                  previewParams({ "transform.positionY": value })
                }
                onCommit={commit}
              />
            </div>
          </div>
          <div className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-2.5">
            <ControlLabel>
              {t("freeTools.mediaTrimmer.editor.inspector.rotate")}
            </ControlLabel>
            <CompactNumber
              value={Math.round(rotate)}
              min={-360}
              max={360}
              step={1}
              suffix="°"
              onPreview={(value) =>
                previewParams({ "transform.rotate": value })
              }
              onCommit={commit}
            />
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {alignButtons.map(({ key, icon: Icon, patch }) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                size="icon"
                className="h-8 rounded-[5px] bg-secondary/50"
                title={t(
                  `freeTools.mediaTrimmer.editor.inspector.align.${key}`,
                )}
                onClick={() => align(patch)}
              >
                <Icon className="size-3.5" />
              </Button>
            ))}
          </div>
        </SectionContent>
      </Section>

      <BlendFeatureRow
        opacity={opacity}
        blendMode={blendMode}
        onPreviewParams={previewParams}
        onCommit={commit}
      />
      <FeatureRows
        items={PICTURE_BASE_FEATURES}
        i18nPrefix="freeTools.mediaTrimmer.editor.pictureFeatures"
        element={element}
        trackId={trackId}
      />
    </div>
  );
}

function CutoutPanel({
  element,
  trackId,
}: {
  element: TimelineElement;
  trackId: string;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <FeatureRows
        items={CUTOUT_FEATURES}
        i18nPrefix="freeTools.mediaTrimmer.editor.cutoutFeatures"
        element={element}
        trackId={trackId}
      />
    </div>
  );
}

export function AudioInspectorTab({
  element,
  trackId,
}: {
  element: AudioElement | VideoElement;
  trackId: string;
}) {
  const [subTab, setSubTab] = useState<AudioSubTab>("base");

  return (
    <div className="flex h-full flex-col">
      <SmallTabs
        value={subTab}
        tabs={["base", "voice"]}
        onChange={setSubTab}
        i18nPrefix="freeTools.mediaTrimmer.editor.audioSubTabs"
      />
      {subTab === "base" ? (
        <AudioBasePanel element={element} trackId={trackId} />
      ) : (
        <VoicePanel />
      )}
    </div>
  );
}

function AudioBasePanel({
  element,
  trackId,
}: {
  element: AudioElement | VideoElement;
  trackId: string;
}) {
  const { t } = useTranslation();
  const { renderElement, previewUpdates, commit } = useElementPreview({
    trackId,
    elementId: element.id,
    fallback: element,
  });
  const volume = numberParam(
    renderElement.params,
    "volume",
    DEFAULTS.element.volume,
  );
  const muted = boolParam(renderElement.params, "muted");

  const previewParams = (nextParams: Record<string, unknown>) => {
    previewUpdates({ params: { ...renderElement.params, ...nextParams } });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <Section sectionKey={sectionKey(element, "audio-basic")}>
        <SectionHeader>
          <SectionTitle>
            {t("freeTools.mediaTrimmer.editor.audioInspector.basic")}
          </SectionTitle>
        </SectionHeader>
        <SectionContent className="space-y-4 pb-4 pt-1">
          <SliderRow
            label={t("freeTools.mediaTrimmer.editor.audioInspector.volume")}
            value={Math.round(volume)}
            min={-60}
            max={12}
            suffix="dB"
            onPreview={(value) => previewParams({ volume: value })}
            onCommit={commit}
          />
          <div className="flex items-center justify-between rounded-[6px] bg-secondary/50 px-3 py-2">
            <div className="property-label flex items-center gap-2 text-foreground">
              <Volume2 className="size-3.5 text-muted-foreground" />
              {t("freeTools.mediaTrimmer.editor.audioInspector.mute")}
            </div>
            <Switch
              checked={muted}
              onCheckedChange={(checked) => {
                previewParams({ muted: checked });
                commit();
              }}
            />
          </div>
          <SliderRow
            label={t("freeTools.mediaTrimmer.editor.audioInspector.fadeIn")}
            value={0}
            min={0}
            max={10}
            suffix="s"
            onPreview={() => undefined}
            onCommit={() => undefined}
          />
          <SliderRow
            label={t("freeTools.mediaTrimmer.editor.audioInspector.fadeOut")}
            value={0}
            min={0}
            max={10}
            suffix="s"
            onPreview={() => undefined}
            onCommit={() => undefined}
          />
        </SectionContent>
      </Section>
      <FeatureControlRow
        item={{ key: "audioDenoise", premium: true }}
        title={t("freeTools.mediaTrimmer.editor.audioInspector.noiseReduce")}
        description={t(
          "freeTools.mediaTrimmer.editor.audioInspector.noiseReduceHint",
        )}
        premium
        element={element}
        trackId={trackId}
      />
      <FeatureControlRow
        item={{ key: "voiceEnhance", premium: true }}
        title={t("freeTools.mediaTrimmer.editor.audioInspector.voiceEnhance")}
        description={t(
          "freeTools.mediaTrimmer.editor.audioInspector.voiceEnhanceHint",
        )}
        premium
        element={element}
        trackId={trackId}
      />
    </div>
  );
}

function VoicePanel() {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {VOICE_CARDS.map((card) => (
        <button
          key={card}
          type="button"
          disabled
          className="flex h-20 flex-col items-start justify-between rounded-[6px] border bg-secondary/40 p-3 text-left opacity-70"
        >
          <WandSparkles className="size-4 text-primary" />
          <span className="property-label text-foreground">
            {t(`freeTools.mediaTrimmer.editor.voiceCards.${card}`)}
          </span>
        </button>
      ))}
    </div>
  );
}

export function SpeedInspectorTab({
  element,
  trackId,
}: {
  element: RetimableElement;
  trackId: string;
}) {
  const [subTab, setSubTab] = useState<SpeedSubTab>("normal");

  return (
    <div className="flex h-full flex-col">
      <SmallTabs
        value={subTab}
        tabs={["normal", "curve"]}
        onChange={setSubTab}
        i18nPrefix="freeTools.mediaTrimmer.editor.speedSubTabs"
      />
      {subTab === "normal" ? (
        <NormalSpeedPanel element={element} trackId={trackId} />
      ) : (
        <CurveSpeedPanel />
      )}
    </div>
  );
}

function NormalSpeedPanel({
  element,
  trackId,
}: {
  element: RetimableElement;
  trackId: string;
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const rate = clampRetimeRate({
    rate: element.retime?.rate ?? DEFAULT_RETIME_RATE,
  });
  const maintainPitch = element.retime?.maintainPitch ?? false;
  const isPitchPreserveAvailable = canMaintainPitch({ rate });

  const commitRate = (nextRate: number, nextMaintainPitch = maintainPitch) => {
    editor.timeline.updateElementRetime({
      trackId,
      elementId: element.id,
      retime: buildRetime({
        rate: nextRate,
        maintainPitch: nextMaintainPitch,
      }),
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <Section sectionKey={sectionKey(element, "speed-normal")}>
        <SectionHeader>
          <SectionTitle>
            {t("freeTools.mediaTrimmer.editor.speedInspector.basic")}
          </SectionTitle>
        </SectionHeader>
        <SectionContent className="space-y-4 pb-4 pt-1">
          <SliderRow
            label={t("freeTools.mediaTrimmer.editor.speedInspector.speed")}
            value={Number(rate.toFixed(2))}
            min={MIN_RETIME_RATE}
            max={MAX_RETIME_RATE}
            step={0.01}
            suffix="x"
            onPreview={(nextRate) => {
              editor.timeline.previewElements({
                updates: [
                  {
                    trackId,
                    elementId: element.id,
                    updates: {
                      retime: buildRetime({ rate: nextRate, maintainPitch }),
                    },
                  },
                ],
              });
            }}
            onCommit={() => editor.timeline.commitPreview()}
          />
          <div className="flex items-center justify-between rounded-[6px] bg-secondary/50 px-3 py-2">
            <span className="property-label text-foreground">
              {t("freeTools.mediaTrimmer.editor.speedInspector.changePitch")}
            </span>
            <Switch
              checked={!maintainPitch}
              disabled={!isPitchPreserveAvailable}
              onCheckedChange={(checked) => commitRate(rate, !checked)}
            />
          </div>
        </SectionContent>
      </Section>
    </div>
  );
}

function CurveSpeedPanel() {
  const { t } = useTranslation();
  const presets = ["montage", "hero", "bullet", "custom"] as const;

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {presets.map((preset) => (
        <button
          key={preset}
          type="button"
          className="flex h-24 flex-col justify-between rounded-[6px] border bg-secondary/35 p-3 text-left opacity-80"
        >
          <Sparkles className="size-4 text-primary" />
          <span className="property-label text-foreground">
            {t(`freeTools.mediaTrimmer.editor.speedCurves.${preset}`)}
          </span>
        </button>
      ))}
    </div>
  );
}

export function AdjustmentInspectorTab({
  element,
  trackId,
}: {
  element: VisualElement;
  trackId: string;
}) {
  const [subTab, setSubTab] = useState<AdjustmentSubTab>("base");

  return (
    <div className="flex h-full flex-col">
      <SmallTabs
        value={subTab}
        tabs={["base", "hsl", "curve", "colorWheel"]}
        onChange={setSubTab}
        i18nPrefix="freeTools.mediaTrimmer.editor.adjustmentSubTabs"
      />
      {subTab === "base" ? (
        <AdjustmentBasePanel element={element} trackId={trackId} />
      ) : (
        <AdvancedAdjustmentPlaceholder tab={subTab} />
      )}
    </div>
  );
}

function AdjustmentBasePanel({
  element,
  trackId,
}: {
  element: VisualElement;
  trackId: string;
}) {
  const { t } = useTranslation();
  const { renderElement, previewUpdates, commit } = useElementPreview({
    trackId,
    elementId: element.id,
    fallback: element,
  });
  const effectIdRef = useRef<Record<string, string>>({});

  const getEffect = (effectType: string) =>
    (renderElement.effects ?? []).find((effect) => effect.type === effectType);

  const upsertEffectParam = (
    effectType: string,
    key: string,
    value: number,
  ) => {
    const existing = getEffect(effectType);
    const nextEffects = existing
      ? (renderElement.effects ?? []).map((effect) =>
          effect.id === existing.id
            ? { ...effect, params: { ...effect.params, [key]: value } }
            : effect,
        )
      : [
          ...(renderElement.effects ?? []),
          {
            ...buildDefaultEffectInstance({ effectType }),
            id:
              effectIdRef.current[effectType] ??
              (effectIdRef.current[effectType] = `${element.id}:${effectType}`),
            params: {
              ...buildDefaultEffectInstance({ effectType }).params,
              [key]: value,
            },
          } satisfies Effect,
        ];
    previewUpdates({ effects: nextEffects });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <Section
        sectionKey={sectionKey(element, "adjust-base")}
        showBottomBorder={false}
      >
        <SectionHeader>
          <SectionTitle>
            {t("freeTools.mediaTrimmer.editor.adjustmentInspector.basic")}
          </SectionTitle>
        </SectionHeader>
        <SectionContent className="space-y-4 pb-4 pt-1">
          {ADJUSTMENT_FIELDS.map((field) => {
            const effect = getEffect(field.effectType);
            const defaultValue =
              field.effectType === "vignette" && field.key === "amount" ? 0 : 0;
            const value = numberParam(
              effect?.params ?? {},
              field.key,
              defaultValue,
            );
            return (
              <SliderRow
                key={`${field.effectType}:${field.key}`}
                label={t(
                  `freeTools.mediaTrimmer.editor.adjustmentInspector.${field.effectType}_${field.key}`.replace(
                    /-/g,
                    "_",
                  ),
                )}
                value={value}
                min={field.min}
                max={field.max}
                step={field.step}
                onPreview={(next) =>
                  upsertEffectParam(field.effectType, field.key, next)
                }
                onCommit={commit}
              />
            );
          })}
        </SectionContent>
      </Section>
    </div>
  );
}

function AdvancedAdjustmentPlaceholder({ tab }: { tab: AdjustmentSubTab }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <Sparkles className="size-8 text-primary" />
      <div className="property-title text-foreground">
        {t(`freeTools.mediaTrimmer.editor.adjustmentSubTabs.${tab}`)}
      </div>
      <div className="property-hint text-muted-foreground">
        {t("freeTools.mediaTrimmer.editor.adjustmentInspector.advancedPending")}
      </div>
    </div>
  );
}

export function AnimationInspectorTab({
  element,
  trackId,
}: {
  element: TimelineElement;
  trackId: string;
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const [subTab, setSubTab] = useState<AnimationSubTab>("in");
  const durationSeconds = mediaTimeToSeconds({ time: element.duration });
  const endTime = Math.max(0.08, durationSeconds);
  const animationWindow = Math.min(0.55, endTime * 0.35);

  const applyPreset = (presetKey: string) => {
    const isIn = subTab === "in";
    const start = mediaTimeFromSeconds({
      seconds: isIn ? 0 : Math.max(0, endTime - animationWindow),
    });
    const end = mediaTimeFromSeconds({
      seconds: isIn ? animationWindow : endTime,
    });
    const keyframes: Parameters<
      typeof editor.timeline.upsertKeyframes
    >[0]["keyframes"] = [];

    const add = (
      propertyPath: AnimationPath,
      timeSeconds: number,
      value: number,
    ) => {
      keyframes.push({
        trackId,
        elementId: element.id,
        propertyPath,
        time: mediaTimeFromSeconds({ seconds: timeSeconds }),
        value,
      });
    };

    const from = mediaTimeToSeconds({ time: start });
    const to = mediaTimeToSeconds({ time: end });
    const opacityFrom = isIn ? 0 : 1;
    const opacityTo = isIn ? 1 : 0;

    if (presetKey === "fade") {
      add("opacity", from, opacityFrom);
      add("opacity", to, opacityTo);
    }
    if (presetKey === "slideLeft") {
      add("transform.positionX", from, isIn ? -260 : 0);
      add("transform.positionX", to, isIn ? 0 : -260);
      add("opacity", from, opacityFrom);
      add("opacity", to, opacityTo);
    }
    if (presetKey === "slideUp") {
      add("transform.positionY", from, isIn ? 180 : 0);
      add("transform.positionY", to, isIn ? 0 : 180);
      add("opacity", from, opacityFrom);
      add("opacity", to, opacityTo);
    }
    if (presetKey === "zoom") {
      add("transform.scaleX", from, isIn ? 0.82 : 1);
      add("transform.scaleY", from, isIn ? 0.82 : 1);
      add("transform.scaleX", to, isIn ? 1 : 0.82);
      add("transform.scaleY", to, isIn ? 1 : 0.82);
      add("opacity", from, opacityFrom);
      add("opacity", to, opacityTo);
    }

    editor.timeline.upsertKeyframes({ keyframes });
  };

  return (
    <div className="flex h-full flex-col">
      <SmallTabs
        value={subTab}
        tabs={["in", "out", "combo"]}
        onChange={setSubTab}
        i18nPrefix="freeTools.mediaTrimmer.editor.animationSubTabs"
      />
      <div className="grid grid-cols-2 gap-2 p-3">
        {ANIMATION_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="group flex h-24 flex-col justify-between rounded-[6px] border bg-secondary/35 p-3 text-left transition-colors hover:border-primary/60 hover:bg-secondary"
            onClick={() => applyPreset(preset.key)}
          >
            <div className="flex h-9 items-center justify-center rounded-[5px] bg-background/70 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div>
              <div className="property-label text-foreground">
                {t(
                  `freeTools.mediaTrimmer.editor.animationPresets.${preset.key}`,
                )}
              </div>
              <div className="property-hint mt-0.5 flex items-center gap-1 text-muted-foreground">
                <Check className="size-3 text-primary" />
                {t(
                  "freeTools.mediaTrimmer.editor.animationPanel.keyframeReady",
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AIEffectsInspectorTab({
  element,
  trackId,
}: {
  element: VisualElement;
  trackId: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <FeatureRows
          items={AI_EFFECT_FEATURES}
          i18nPrefix="freeTools.mediaTrimmer.editor.aiEffectFeatures"
          element={element}
          trackId={trackId}
        />
      </div>
    </div>
  );
}
