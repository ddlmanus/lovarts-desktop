import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { FormFieldConfig } from "@/lib/schemaToForm";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { FileUpload } from "./FileUpload";
import { SizeSelector } from "./SizeSelector";
import { LoraSelector, type LoraItem } from "./LoraSelector";
import { ObjectArrayField } from "./ObjectArrayField";
import { PromptOptimizer } from "./PromptOptimizer";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Dices, Info, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  field: FormFieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  error?: string;
  modelType?: string;
  imageValue?: string;
  hideLabel?: boolean;
  formValues?: Record<string, unknown>;
  onUploadingChange?: (isUploading: boolean) => void;
  tooltipDescription?: boolean;
  /** When provided (e.g. workflow), file uploads use this instead of API. */
  onUploadFile?: (file: File) => Promise<string>;
  /** Optional React node rendered inside the label row (e.g. a connection handle anchor). */
  handleAnchor?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

// Generate a random seed (0 to 65535)
const generateRandomSeed = () => Math.floor(Math.random() * 65536);

function isAspectRatioField(field: FormFieldConfig) {
  const haystack = `${field.name} ${field.label}`.toLowerCase();
  return haystack.includes("aspect_ratio") || haystack.includes("aspect ratio");
}

function isAspectRatioValue(value: string) {
  return /^\d+:\d+$/.test(value);
}

function getAspectPreviewSize(ratio: string) {
  switch (ratio) {
    case "16:9":
    case "21:9":
    case "3:1":
      return { width: 18, height: 10 };
    case "9:16":
    case "9:21":
    case "1:3":
      return { width: 10, height: 18 };
    case "4:3":
    case "3:2":
    case "5:4":
    case "2:1":
      return { width: 15, height: 11 };
    case "3:4":
    case "2:3":
    case "4:5":
    case "1:2":
      return { width: 11, height: 15 };
    default:
      return { width: 12, height: 12 };
  }
}

function AspectRatioPreview({ ratio }: { ratio: string }) {
  const { width, height } = getAspectPreviewSize(ratio);
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.03] text-[hsl(var(--playground-sidebar-foreground))]">
      <span
        className="rounded-[3px] border border-current/85"
        style={{ width, height }}
      />
    </span>
  );
}

function getDisplayOption(field: FormFieldConfig, option: string) {
  const normalized = option.trim().toLowerCase();
  const name = field.name.toLowerCase();

  if (normalized === "auto") return "自动";
  if (normalized === "true") return "开启";
  if (normalized === "false") return "关闭";

  const isLanguageField =
    name.includes("lang") ||
    name.includes("language") ||
    name.endsWith("_locale");

  if (isLanguageField) {
    const languageLabels: Record<string, string> = {
      zh: "中文",
      cn: "中文",
      "zh-cn": "简体中文",
      zh_cn: "简体中文",
      "zh-hans": "简体中文",
      zh_hans: "简体中文",
      "chinese-simplified": "简体中文",
      "chinese simplified": "简体中文",
      "simplified chinese": "简体中文",
      "zh-tw": "繁体中文",
      zh_tw: "繁体中文",
      "zh-hant": "繁体中文",
      zh_hant: "繁体中文",
      "chinese-traditional": "繁体中文",
      "chinese traditional": "繁体中文",
      "traditional chinese": "繁体中文",
      chinese: "中文",
      en: "英语",
      eng: "英语",
      english: "英语",
      ja: "日语",
      jp: "日语",
      japanese: "日语",
      ko: "韩语",
      kr: "韩语",
      korean: "韩语",
      fr: "法语",
      french: "法语",
      de: "德语",
      german: "德语",
      es: "西班牙语",
      spanish: "西班牙语",
      ru: "俄语",
      russian: "俄语",
      ar: "阿拉伯语",
      arabic: "阿拉伯语",
      hi: "印地语",
      hindi: "印地语",
      bn: "孟加拉语",
      bengali: "孟加拉语",
      pt: "葡萄牙语",
      portuguese: "葡萄牙语",
      it: "意大利语",
      italian: "意大利语",
      nl: "荷兰语",
      dutch: "荷兰语",
      pl: "波兰语",
      polish: "波兰语",
      tr: "土耳其语",
      turkish: "土耳其语",
      vi: "越南语",
      vietnamese: "越南语",
      th: "泰语",
      thai: "泰语",
      id: "印尼语",
      indonesian: "印尼语",
      ms: "马来语",
      malay: "马来语",
      tl: "菲律宾语",
      fil: "菲律宾语",
      filipino: "菲律宾语",
      ur: "乌尔都语",
      urdu: "乌尔都语",
      fa: "波斯语",
      persian: "波斯语",
      he: "希伯来语",
      hebrew: "希伯来语",
      sv: "瑞典语",
      swedish: "瑞典语",
      da: "丹麦语",
      danish: "丹麦语",
      no: "挪威语",
      nb: "挪威语",
      norwegian: "挪威语",
      fi: "芬兰语",
      finnish: "芬兰语",
      el: "希腊语",
      greek: "希腊语",
      cs: "捷克语",
      czech: "捷克语",
      hu: "匈牙利语",
      hungarian: "匈牙利语",
      ro: "罗马尼亚语",
      romanian: "罗马尼亚语",
      uk: "乌克兰语",
      ukrainian: "乌克兰语",
    };

    if (languageLabels[normalized]) return languageLabels[normalized];
  }

  const qualityLabels: Record<string, string> = {
    low: "低",
    medium: "中",
    middle: "中",
    high: "高",
    hd: "高清",
    standard: "标准",
    pro: "专业",
    ultra: "超高",
    fast: "快速",
    normal: "普通",
  };

  if (name.includes("quality") && qualityLabels[normalized]) {
    return qualityLabels[normalized];
  }

  const generalLabels: Record<string, string> = {
    yes: "是",
    no: "否",
    enable: "开启",
    enabled: "开启",
    disable: "关闭",
    disabled: "关闭",
    image: "图像",
    video: "视频",
    audio: "音频",
    text: "文本",
    portrait: "竖版",
    landscape: "横版",
    square: "方形",
  };

  if (generalLabels[normalized]) return generalLabels[normalized];

  if (name.includes("format")) return option.toUpperCase();

  return option;
}

function SelectOptionBody({
  field,
  option,
  selected,
  compact,
}: {
  field: FormFieldConfig;
  option: string;
  selected?: boolean;
  compact?: boolean;
}) {
  const normalized = option.trim().toLowerCase();
  const isAuto = normalized === "auto";
  const showRatioVisual =
    isAspectRatioField(field) && isAspectRatioValue(option);
  const displayOption = getDisplayOption(field, option);

  if (isAuto || showRatioVisual) {
    return (
      <div
        className={cn("flex min-w-0 items-center", compact ? "gap-2" : "gap-3")}
      >
        {!compact && (
          <AspectRatioPreview ratio={showRatioVisual ? option : "1:1"} />
        )}
        {compact && (
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
            <span
              className="rounded-[2px] border border-current/80"
              style={getAspectPreviewSize(showRatioVisual ? option : "1:1")}
            />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate font-medium text-white",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {displayOption}
          </div>
          <div
            className={cn(
              "truncate text-muted-foreground",
              compact ? "text-[10px]" : "text-[11px]",
            )}
          >
            {isAuto ? "由模型决定" : `${option} 比例`}
          </div>
        </div>
        {selected && (
          <Check className="h-4 w-4 shrink-0 text-[hsl(var(--playground-accent))]" />
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={cn("truncate text-white", compact ? "text-xs" : "text-sm")}
      >
        {displayOption}
      </span>
      {selected && (
        <Check className="ml-auto h-4 w-4 shrink-0 text-[hsl(var(--playground-accent))]" />
      )}
    </div>
  );
}

function DarkSelectField({
  field,
  value,
  onChange,
  disabled,
  compact,
}: {
  field: FormFieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedValue =
    value !== undefined && value !== null && value !== ""
      ? String(value)
      : field.default !== undefined
        ? String(field.default)
        : "";
  const placeholder = !field.required && field.default === undefined;

  useEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const trigger = containerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 6;
      const estimatedHeight = Math.min(
        288,
        Math.max(
          44,
          ((field.options?.length ?? 0) + (placeholder ? 1 : 0)) * 40 + 8,
        ),
      );
      const hasRoomAbove = rect.top - viewportPadding - gap >= 80;
      const shouldOpenUpward =
        rect.bottom + gap + estimatedHeight >
        window.innerHeight - viewportPadding;
      const openUpward =
        (compact && hasRoomAbove) || (shouldOpenUpward && hasRoomAbove);
      const availableHeight = openUpward
        ? rect.top - viewportPadding - gap
        : window.innerHeight - rect.bottom - viewportPadding - gap;
      const top = openUpward
        ? Math.max(viewportPadding, rect.top - gap - estimatedHeight)
        : Math.min(
            window.innerHeight - viewportPadding - estimatedHeight,
            rect.bottom + gap,
          );

      setMenuStyle({
        left: rect.left,
        top,
        width: rect.width,
        maxHeight: Math.min(estimatedHeight, Math.max(44, availableHeight)),
      });
    };

    updateMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [compact, field.options?.length, open, placeholder]);

  const selectOption = (optionValue: string) => {
    if (optionValue === "") {
      onChange(undefined);
      setOpen(false);
      return;
    }
    const originalOption = field.options?.find(
      (option) => String(option) === optionValue,
    );
    onChange(originalOption !== undefined ? originalOption : optionValue);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        id={field.name}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-[#141414] px-3 text-left text-white transition-colors",
          compact ? "h-8 text-xs" : "h-10 text-sm",
          "hover:border-white/12 hover:bg-white/[0.04] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--playground-accent))] focus:ring-offset-0",
          disabled && "cursor-not-allowed opacity-50",
          open &&
            "border-[hsl(var(--playground-accent))] shadow-[0_0_0_1px_hsl(var(--playground-accent)),0_0_20px_hsl(var(--playground-accent)/0.18)]",
        )}
      >
        <div className="min-w-0 flex-1">
          {selectedValue ? (
            <SelectOptionBody
              field={field}
              option={selectedValue}
              compact={compact}
            />
          ) : (
            <span
              className={cn(
                "truncate text-muted-foreground",
                compact ? "text-xs" : "text-sm",
              )}
            >
              {placeholder ? `请选择${field.label}` : field.label}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180 text-white",
          )}
        />
      </button>

      {open &&
        menuStyle &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[2147483647] overflow-y-auto rounded-xl border border-white/[0.08] bg-[#111] p-1 shadow-[0_18px_48px_rgba(0,0,0,0.55)]"
            style={menuStyle}
          >
            {placeholder && (
              <button
                type="button"
                onClick={() => selectOption("")}
                className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                None
              </button>
            )}
            {field.options?.map((option) => {
              const optionValue = String(option);
              const isSelected = selectedValue === optionValue;
              return (
                <button
                  key={optionValue}
                  type="button"
                  onClick={() => selectOption(optionValue)}
                  className={cn(
                    "flex w-full items-center rounded-lg px-2.5 py-2 text-left transition-colors",
                    isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.05]",
                  )}
                >
                  <SelectOptionBody
                    field={field}
                    option={optionValue}
                    selected={isSelected}
                    compact={compact}
                  />
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function FormField({
  field,
  value,
  onChange,
  disabled = false,
  error,
  modelType,
  imageValue,
  hideLabel = false,
  formValues,
  onUploadingChange,
  tooltipDescription = false,
  onUploadFile,
  handleAnchor,
  className,
  compact = false,
}: FormFieldProps) {
  const { t } = useTranslation();
  // Check if this is a seed field
  const isSeedField = field.name.toLowerCase() === "seed";
  const isNumericField = field.type === "number" || field.type === "slider";
  const isNumberField = field.type === "number";
  const allowEmptyNumber =
    isNumberField && !field.required && field.default === undefined;
  const numericFallback =
    value !== undefined && value !== null
      ? Number(value)
      : ((field.default as number | undefined) ?? field.min ?? 0);
  const [numericInput, setNumericInput] = useState(() => {
    if (!isNumericField) return "";
    if (allowEmptyNumber && (value === undefined || value === null)) return "";
    return String(numericFallback);
  });

  useEffect(() => {
    if (!isNumericField) return;
    if (allowEmptyNumber && (value === undefined || value === null)) {
      setNumericInput("");
      return;
    }
    const next =
      value !== undefined && value !== null
        ? Number(value)
        : ((field.default as number | undefined) ?? field.min ?? 0);
    setNumericInput(String(next));
  }, [isNumericField, value, field.default, field.min, allowEmptyNumber]);

  const isIntegerField = field.schemaType === "integer";

  const clampNumeric = (n: number) => {
    let next = isIntegerField ? Math.round(n) : n;
    if (field.min !== undefined) next = Math.max(field.min, next);
    if (field.max !== undefined) next = Math.min(field.max, next);
    return next;
  };

  const commitNumeric = (raw: string) => {
    if (raw.trim() === "" || Number.isNaN(Number(raw))) {
      if (allowEmptyNumber) {
        onChange(undefined);
        setNumericInput("");
        return;
      }
      const fallback = (field.default as number | undefined) ?? field.min ?? 0;
      onChange(fallback);
      setNumericInput(String(fallback));
      return;
    }

    const parsed = Number(raw);
    const clamped = clampNumeric(parsed);
    onChange(clamped);
    setNumericInput(String(clamped));
  };

  const renderInput = () => {
    switch (field.type) {
      case "text":
        return (
          <Input
            id={field.name}
            type="text"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.description || `请输入${field.label}`}
            disabled={disabled}
          />
        );

      case "textarea":
        return (
          <Textarea
            id={field.name}
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.description || `请输入${field.label}`}
            disabled={disabled}
            rows={4}
            className="nodrag nowheel"
          />
        );

      case "number": {
        // Show slider + input when default, min, and max are all defined
        const hasSliderRange =
          field.default !== undefined &&
          field.min !== undefined &&
          field.max !== undefined;
        const currentValue =
          value !== undefined && value !== null
            ? Number(value)
            : ((field.default as number) ?? field.min ?? 0);

        if (hasSliderRange) {
          return (
            <div className="flex items-center gap-3">
              <Slider
                value={[currentValue]}
                onValueChange={([v]) => {
                  const coerced = isIntegerField ? Math.round(v) : v;
                  onChange(coerced);
                  setNumericInput(String(coerced));
                }}
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                disabled={disabled}
                className="flex-1"
              />
              <Input
                id={field.name}
                type="number"
                value={numericInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setNumericInput(val);
                  if (val === "" || Number.isNaN(Number(val))) {
                    if (allowEmptyNumber) onChange(undefined);
                    return;
                  }
                  const n = Number(val);
                  onChange(isIntegerField ? Math.round(n) : n);
                }}
                onBlur={() => commitNumeric(numericInput)}
                min={field.min}
                max={field.max}
                step={field.step}
                disabled={disabled}
                className="w-24 h-8 text-sm"
              />
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2">
            <Input
              id={field.name}
              type="number"
              value={numericInput}
              onChange={(e) => {
                const val = e.target.value;
                setNumericInput(val);
                if (val === "" || Number.isNaN(Number(val))) {
                  if (allowEmptyNumber) onChange(undefined);
                  return;
                }
                const n = Number(val);
                onChange(isIntegerField ? Math.round(n) : n);
              }}
              onBlur={() => commitNumeric(numericInput)}
              min={field.min}
              max={field.max}
              step={field.step}
              placeholder={
                field.default !== undefined
                  ? `默认值：${field.default}`
                  : undefined
              }
              disabled={disabled}
              className={isSeedField ? "flex-1" : undefined}
            />
            {isSeedField && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                title={t("playground.randomSeed")}
                onClick={() => {
                  const next = generateRandomSeed();
                  onChange(next);
                  setNumericInput(String(next));
                }}
                disabled={disabled}
              >
                <Dices className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      }

      case "slider": {
        const currentValue =
          value !== undefined && value !== null
            ? Number(value)
            : ((field.default as number) ?? field.min ?? 0);
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Slider
                value={[currentValue]}
                onValueChange={([v]) => {
                  const coerced = isIntegerField ? Math.round(v) : v;
                  onChange(coerced);
                  setNumericInput(String(coerced));
                }}
                min={field.min ?? 0}
                max={field.max ?? 100}
                step={field.step ?? 1}
                disabled={disabled}
                className="flex-1"
              />
              <Input
                type="number"
                value={numericInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setNumericInput(val);
                  if (val === "" || Number.isNaN(Number(val))) return;
                  const n = Number(val);
                  onChange(isIntegerField ? Math.round(n) : n);
                }}
                onBlur={() => commitNumeric(numericInput)}
                min={field.min}
                max={field.max}
                step={field.step}
                disabled={disabled}
                className="w-24 h-8 text-sm"
              />
            </div>
          </div>
        );
      }

      case "boolean":
        return (
          <div className="flex items-center space-x-2">
            <Switch
              id={field.name}
              checked={Boolean(value)}
              onCheckedChange={onChange}
              disabled={disabled}
            />
            <Label
              htmlFor={field.name}
              className="text-sm text-muted-foreground"
            >
              {value ? "已开启" : "已关闭"}
            </Label>
          </div>
        );

      case "select": {
        return (
          <DarkSelectField
            field={field}
            value={value}
            onChange={onChange}
            disabled={disabled}
            compact={compact}
          />
        );
      }

      case "size": {
        // Normalize size value: API may return a single number (e.g. 2048 or "2048")
        // but SizeSelector expects "W*H" format (e.g. "2048*2048")
        let sizeValue =
          (value as string) || (field.default as string) || "1024*1024";
        if (
          typeof sizeValue === "number" ||
          (typeof sizeValue === "string" &&
            !sizeValue.includes("*") &&
            !isNaN(Number(sizeValue)))
        ) {
          const n = Number(sizeValue);
          sizeValue = `${n}*${n}`;
        }
        return (
          <SizeSelector
            value={sizeValue}
            onChange={(v) => onChange(v)}
            disabled={disabled}
            min={field.min}
            max={field.max}
          />
        );
      }

      case "file":
      case "file-array":
        return (
          <FileUpload
            accept={field.accept || "*/*"}
            multiple={field.type === "file-array"}
            maxFiles={field.maxFiles || 1}
            value={
              (value as string | string[]) ||
              (field.type === "file-array" ? [] : "")
            }
            onChange={onChange}
            disabled={disabled}
            placeholder={field.placeholder}
            isMaskField={[
              "mask_image",
              "mask_image_url",
              "mask_images",
              "mask_image_urls",
            ].includes(field.name)}
            formValues={formValues}
            onUploadingChange={onUploadingChange}
            onUploadFile={onUploadFile}
          />
        );

      case "multi-select": {
        // Value is stored as plain string[] internally; wrapKey wrapping happens at submission time
        const selected = Array.isArray(value) ? (value as string[]) : [];
        const options = field.options ?? [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {options.map((opt) => {
              const optStr = String(opt);
              const isActive = selected.includes(optStr);
              return (
                <button
                  key={optStr}
                  type="button"
                  disabled={
                    disabled ||
                    (!isActive &&
                      field.max !== undefined &&
                      selected.length >= field.max)
                  }
                  onClick={() => {
                    const next = isActive
                      ? selected.filter((v) => v !== optStr)
                      : [...selected, optStr];
                    onChange(next);
                  }}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md border transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                    disabled && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {getDisplayOption(field, optStr)}
                </button>
              );
            })}
          </div>
        );
      }

      case "object-array":
        return (
          <ObjectArrayField
            itemFields={field.itemFields || []}
            value={(value as Record<string, unknown>[]) || []}
            onChange={(v) => onChange(v)}
            maxItems={field.max}
            disabled={disabled}
          />
        );

      case "loras":
        return (
          <LoraSelector
            value={(value as LoraItem[]) || []}
            onChange={onChange}
            maxItems={field.maxFiles || 3}
            disabled={disabled}
          />
        );

      case "string-array": {
        const items = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={item}
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = e.target.value;
                    onChange(next);
                  }}
                  disabled={disabled}
                  placeholder={`项目 ${i + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                  disabled={disabled}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange([...items, ""])}
              disabled={
                disabled ||
                (field.maxFiles ? items.length >= field.maxFiles : false)
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              {t("common.addItem", "添加项目")}
            </Button>
          </div>
        );
      }

      default:
        return (
          <Input
            id={field.name}
            type="text"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        );
    }
  };

  // Check if this is a prompt field that can be optimized (only main "prompt", not negative_prompt)
  const isOptimizablePrompt =
    field.name === "prompt" && field.type === "textarea";

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center">
            {handleAnchor}
            <Label
              htmlFor={field.name}
              className={cn(
                field.required &&
                  "after:content-['*'] after:ml-0.5 after:text-destructive",
                error && "text-destructive",
              )}
            >
              {field.label}
            </Label>
          </span>
          {tooltipDescription &&
            field.description &&
            field.type !== "text" &&
            field.type !== "textarea" && (
              <Info
                className="h-3.5 w-3.5 text-muted-foreground shrink-0 translate-y-px cursor-help"
                aria-label={field.description}
                title={`${field.description}${
                  field.min !== undefined && field.max !== undefined
                    ? ` (${field.min} - ${field.max})`
                    : ""
                }`}
              />
            )}
          {isOptimizablePrompt && (
            <PromptOptimizer
              currentPrompt={(value as string) || ""}
              onOptimized={(optimized) => onChange(optimized)}
              disabled={disabled}
              modelType={modelType}
              imageValue={imageValue}
            />
          )}
          {field.min !== undefined &&
            field.max !== undefined &&
            (tooltipDescription ? !field.description : true) && (
              <span className="text-xs text-muted-foreground">
                ({field.min} - {field.max})
              </span>
            )}
        </div>
      )}
      <div
        className={cn(
          field.type !== "loras" &&
            field.type !== "file" &&
            field.type !== "file-array" &&
            field.type !== "select" &&
            field.type !== "string-array" &&
            field.type !== "object-array" &&
            "overflow-hidden",
          error &&
            "[&_input]:border-destructive [&_textarea]:border-destructive",
        )}
      >
        {renderInput()}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!tooltipDescription &&
        !error &&
        field.description &&
        field.type !== "text" &&
        field.type !== "textarea" && (
          <p className="text-xs text-muted-foreground">{field.description}</p>
        )}
    </div>
  );
}
