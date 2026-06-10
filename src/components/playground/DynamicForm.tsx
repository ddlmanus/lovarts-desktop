import { useMemo, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Model } from "@/types/model";
import {
  schemaToFormFields,
  getDefaultValues,
  getSingleImageFromValues,
  type FormFieldConfig,
} from "@/lib/schemaToForm";
import { FormField } from "./FormField";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface DynamicFormProps {
  model: Model;
  values: Record<string, unknown>;
  validationErrors?: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
  onSetDefaults: (defaults: Record<string, unknown>) => void;
  onFieldsChange?: (fields: FormFieldConfig[]) => void;
  disabled?: boolean;
  onUploadingChange?: (isUploading: boolean) => void;
  collapsible?: boolean;
  /** When false, render form content only (no ScrollArea); parent is the scroll container. Used in Playground for mobile. */
  scrollable?: boolean;
}

function getSettingsFieldSlot(field: FormFieldConfig) {
  if (field.hidden) return null;

  const name = field.name.toLowerCase();
  const label = field.label.toLowerCase();
  const haystack = `${name} ${label}`;

  if (
    haystack.includes("aspect_ratio") ||
    haystack.includes("aspect ratio") ||
    name === "size"
  ) {
    return "hero";
  }

  if (
    haystack.includes("resolution") ||
    haystack.includes("quality") ||
    haystack.includes("output_format") ||
    haystack.includes("output format") ||
    name === "format"
  ) {
    return "compact";
  }

  return null;
}

function getSettingsFieldLabel(field: FormFieldConfig) {
  const name = field.name.toLowerCase();
  const label = field.label.toLowerCase();
  const haystack = `${name} ${label}`;

  if (
    haystack.includes("aspect_ratio") ||
    haystack.includes("aspect ratio") ||
    name === "size"
  ) {
    return "宽高比";
  }

  if (haystack.includes("resolution")) return "分辨率";
  if (haystack.includes("quality")) return "质量";
  if (
    haystack.includes("output_format") ||
    haystack.includes("output format") ||
    name === "format"
  ) {
    return "格式";
  }

  return field.label;
}

function getSettingsField(field: FormFieldConfig) {
  return {
    ...field,
    label: getSettingsFieldLabel(field),
  };
}

export function DynamicForm({
  model,
  values,
  validationErrors = {},
  onChange,
  onSetDefaults,
  onFieldsChange,
  disabled = false,
  onUploadingChange,
  collapsible = false,
  scrollable = true,
}: DynamicFormProps) {
  const { t } = useTranslation();
  // Track which hidden fields are enabled
  const [enabledHiddenFields, setEnabledHiddenFields] = useState<Set<string>>(
    new Set(),
  );

  // Track if we've initialized defaults for this model instance
  const initializedRef = useRef<string | null>(null);

  // Extract schema from model
  const fields = useMemo<FormFieldConfig[]>(() => {
    // The API returns schema in api_schema.api_schemas[0].request_schema
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiSchemas = (model.api_schema as any)?.api_schemas as
      | Array<{
          type: string;
          request_schema?: {
            properties?: Record<string, unknown>;
            required?: string[];
            "x-order-properties"?: string[];
          };
        }>
      | undefined;

    const requestSchema = apiSchemas?.find(
      (s) => s.type === "model_run",
    )?.request_schema;
    if (!requestSchema?.properties) {
      return [];
    }
    return schemaToFormFields(
      requestSchema.properties as Record<
        string,
        import("@/types/model").SchemaProperty
      >,
      requestSchema.required || [],
      requestSchema["x-order-properties"],
    );
  }, [model]);

  // Reset enabled hidden fields when model changes
  useEffect(() => {
    setEnabledHiddenFields(new Set());
  }, [model.model_id]);

  // Register fields and set defaults when model changes
  useEffect(() => {
    onFieldsChange?.(fields);

    // Only set defaults if this is a new model (not just remount)
    // Check if we already have values for this model
    const hasExistingValues = Object.keys(values).some(
      (key) =>
        values[key] !== undefined &&
        values[key] !== "" &&
        !(Array.isArray(values[key]) && values[key].length === 0),
    );

    // Set defaults only if model changed AND no existing values
    if (initializedRef.current !== model.model_id && !hasExistingValues) {
      const defaults = getDefaultValues(fields);
      onSetDefaults(defaults);
    }
    initializedRef.current = model.model_id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, model.model_id, onFieldsChange, onSetDefaults]);

  // Toggle a hidden field
  const toggleHiddenField = (fieldName: string) => {
    setEnabledHiddenFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldName)) {
        next.delete(fieldName);
        // Clear the value when disabling
        onChange(fieldName, undefined);
      } else {
        next.add(fieldName);
      }
      return next;
    });
  };

  const renderField = (field: FormFieldConfig, index?: number) => {
    const animStyle =
      index !== undefined ? { animationDelay: `${index * 50}ms` } : undefined;

    // Hidden fields render with a toggle
    if (field.hidden) {
      const isEnabled = enabledHiddenFields.has(field.name);
      return (
        <div
          key={field.name}
          className={cn("space-y-2", collapsible && "field-animate")}
          style={animStyle}
        >
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => toggleHiddenField(field.name)}
              disabled={disabled}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
                "border shadow-sm",
                isEnabled
                  ? "bg-primary text-primary-foreground border-primary shadow-primary/20 shadow-md"
                  : "bg-background hover:bg-muted border-input hover:shadow-md",
              )}
            >
              <div
                className={cn(
                  "w-3 h-3 rounded-full border-2 transition-all duration-200",
                  isEnabled
                    ? "bg-primary-foreground border-primary-foreground scale-110"
                    : "border-muted-foreground",
                )}
              />
              {field.label}
            </button>
            {field.description && !isEnabled && (
              <p className="text-xs text-muted-foreground">
                {field.description}
              </p>
            )}
          </div>
          {isEnabled && (
            <div className="pl-4 border-l-2 border-primary/50 ml-2">
              <FormField
                field={field}
                value={values[field.name]}
                onChange={(value) => onChange(field.name, value)}
                disabled={disabled}
                error={validationErrors[field.name]}
                modelType={model.type}
                imageValue={
                  field.name === "prompt"
                    ? getSingleImageFromValues(values)
                    : undefined
                }
                hideLabel
                formValues={values}
                onUploadingChange={onUploadingChange}
                tooltipDescription
              />
            </div>
          )}
        </div>
      );
    }

    // Regular visible fields - wrap in hover card when collapsible
    if (collapsible) {
      return (
        <div
          key={field.name}
          className={cn("field-hover", animStyle && "field-animate")}
          style={animStyle}
        >
          <FormField
            field={field}
            value={values[field.name]}
            onChange={(value) => onChange(field.name, value)}
            disabled={disabled}
            error={validationErrors[field.name]}
            modelType={model.type}
            imageValue={
              field.name === "prompt"
                ? getSingleImageFromValues(values)
                : undefined
            }
            formValues={values}
            onUploadingChange={onUploadingChange}
            tooltipDescription
          />
        </div>
      );
    }

    return (
      <FormField
        key={field.name}
        field={field}
        value={values[field.name]}
        onChange={(value) => onChange(field.name, value)}
        disabled={disabled}
        error={validationErrors[field.name]}
        modelType={model.type}
        imageValue={
          field.name === "prompt" ? getSingleImageFromValues(values) : undefined
        }
        formValues={values}
        onUploadingChange={onUploadingChange}
      />
    );
  };

  const settingsFieldNames = useMemo(() => {
    if (!collapsible) return new Set<string>();
    return new Set(
      fields
        .filter((field) => getSettingsFieldSlot(field) !== null)
        .map((field) => field.name),
    );
  }, [collapsible, fields]);

  const firstSettingsFieldIndex = useMemo(() => {
    if (!collapsible) return -1;
    return fields.findIndex((field) => settingsFieldNames.has(field.name));
  }, [collapsible, fields, settingsFieldNames]);

  const settingsHeroFields = useMemo(
    () => fields.filter((field) => getSettingsFieldSlot(field) === "hero"),
    [fields],
  );

  const settingsCompactFields = useMemo(
    () => fields.filter((field) => getSettingsFieldSlot(field) === "compact"),
    [fields],
  );

  const settingsBlock =
    collapsible && firstSettingsFieldIndex >= 0 ? (
      <div
        key="settings-panel"
        className="field-animate space-y-3"
        style={{ animationDelay: `${firstSettingsFieldIndex * 50}ms` }}
      >
        <span className="block text-sm font-semibold text-[#d1d5db]">
          {t("common.settings", "设置")}
        </span>

        <div className="space-y-3">
          {settingsHeroFields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <FormField
                field={getSettingsField(field)}
                value={values[field.name]}
                onChange={(value) => onChange(field.name, value)}
                disabled={disabled}
                error={validationErrors[field.name]}
                modelType={model.type}
                imageValue={
                  field.name === "prompt"
                    ? getSingleImageFromValues(values)
                    : undefined
                }
                formValues={values}
                onUploadingChange={onUploadingChange}
                tooltipDescription
                compact
                className="[&_label]:text-xs [&_label]:font-medium [&_label]:text-[#d1d5db]"
              />
            </div>
          ))}

          {settingsCompactFields.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {settingsCompactFields.map((field) => (
                <div key={field.name} className="min-w-0 space-y-1.5">
                  <FormField
                    field={getSettingsField(field)}
                    value={values[field.name]}
                    onChange={(value) => onChange(field.name, value)}
                    disabled={disabled}
                    error={validationErrors[field.name]}
                    modelType={model.type}
                    imageValue={
                      field.name === "prompt"
                        ? getSingleImageFromValues(values)
                        : undefined
                    }
                    formValues={values}
                    onUploadingChange={onUploadingChange}
                    tooltipDescription
                    compact
                    className="[&_label]:text-xs [&_label]:font-medium [&_label]:text-[#d1d5db]"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ) : null;

  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>当前模型没有可配置参数。</p>
        <p className="text-sm mt-2">可以直接运行这个模型。</p>
      </div>
    );
  }

  // When not collapsible, render all fields flat (original behavior)
  if (!collapsible) {
    const formContent = (
      <div className="space-y-4 py-2">{fields.map(renderField)}</div>
    );
    if (!scrollable) return formContent;
    return <ScrollArea className="h-full">{formContent}</ScrollArea>;
  }

  // Collapsible: render all fields flat (primary + advanced together)
  const formContent = (
    <div className="space-y-4 py-2">
      {fields.map((field, index) => {
        if (settingsFieldNames.has(field.name)) {
          if (index === firstSettingsFieldIndex) {
            return settingsBlock;
          }
          return null;
        }
        return renderField(field, index);
      })}
    </div>
  );

  if (!scrollable) return formContent;
  return <ScrollArea className="h-full">{formContent}</ScrollArea>;
}
