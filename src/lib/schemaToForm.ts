import type { Model, SchemaProperty } from "@/types/model";

export interface FormFieldConfig {
  name: string;
  type:
    | "text"
    | "textarea"
    | "number"
    | "slider"
    | "boolean"
    | "select"
    | "multi-select"
    | "object-array"
    | "string-array"
    | "file"
    | "file-array"
    | "size"
    | "loras";
  label: string;
  required: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: (string | number)[];
  description?: string;
  accept?: string;
  maxFiles?: number;
  placeholder?: string;
  hidden?: boolean; // x-hidden fields are optional and hidden by default
  schemaType?: string; // Original schema type (e.g. 'integer' vs 'number')
  /** For multi-select: wrap each selected value in an object with this key */
  wrapKey?: string;
  /** For object-array: sub-field definitions for each item in the array */
  itemFields?: FormFieldConfig[];
}

export function validateFormValues(
  fields: FormFieldConfig[],
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = values[field.name];
    const isEmpty =
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);

    if (field.required && isEmpty) {
      errors[field.name] = `请填写${field.label}`;
      continue;
    }

    if (isEmpty) continue;

    if (field.type === "number" || field.type === "slider") {
      const num = Number(value);
      if (Number.isNaN(num)) {
        errors[field.name] = `${field.label}必须是数字`;
        continue;
      }
      if (field.min !== undefined && num < field.min) {
        errors[field.name] = `${field.label}不能小于 ${field.min}`;
      } else if (field.max !== undefined && num > field.max) {
        errors[field.name] = `${field.label}不能大于 ${field.max}`;
      }
    }

    if (field.type === "size") {
      const raw = String(value);
      const parts = raw.split("*");
      const w = Number(parts[0]);
      const h = Number(parts[1]);
      if (parts.length !== 2 || Number.isNaN(w) || Number.isNaN(h)) {
        errors[field.name] = `${field.label}格式应为 宽度*高度`;
      } else if (
        (field.min !== undefined && (w < field.min || h < field.min)) ||
        (field.max !== undefined && (w > field.max || h > field.max))
      ) {
        errors[field.name] =
          `${field.label}必须在 ${field.min} 到 ${field.max} 之间`;
      }
    }
  }

  return errors;
}

// Detect file input type based on field name patterns
function detectFileType(
  name: string,
): { accept: string; type: "file" | "file-array" } | null {
  const lowerName = name.toLowerCase();

  // Check for plural forms (arrays)
  if (lowerName.endsWith("images") || lowerName.endsWith("image_urls")) {
    return { accept: "image/*", type: "file-array" };
  }
  if (lowerName.endsWith("videos") || lowerName.endsWith("video_urls")) {
    return { accept: "video/*", type: "file-array" };
  }
  if (lowerName.endsWith("audios") || lowerName.endsWith("audio_urls")) {
    return { accept: "audio/*", type: "file-array" };
  }

  // Check for singular patterns (matches *image, *video, *audio)
  if (lowerName.endsWith("image") || lowerName.endsWith("image_url")) {
    return { accept: "image/*", type: "file" };
  }
  if (lowerName.endsWith("video") || lowerName.endsWith("video_url")) {
    return { accept: "video/*", type: "file" };
  }
  if (lowerName.endsWith("audio") || lowerName.endsWith("audio_url")) {
    return { accept: "audio/*", type: "file" };
  }

  return null;
}

// Fields that should use textarea
const TEXTAREA_FIELDS = [
  "prompt",
  "negative_prompt",
  "text",
  "description",
  "content",
];

// Fields to hide from the form (internal API options)
const HIDDEN_FIELDS = ["enable_base64_output", "enable_sync_mode"];

export function schemaToFormFields(
  properties: Record<string, SchemaProperty>,
  required: string[] = [],
  orderProperties?: string[],
): FormFieldConfig[] {
  const fields: FormFieldConfig[] = [];

  for (const [name, prop] of Object.entries(properties)) {
    // Skip hidden fields
    if (HIDDEN_FIELDS.includes(name)) {
      continue;
    }
    const field = propertyToField(name, prop, required.includes(name));
    if (field) {
      fields.push(field);
    }
  }

  // Sort fields by x-order-properties if provided
  if (orderProperties && orderProperties.length > 0) {
    return fields.sort((a, b) => {
      const indexA = orderProperties.indexOf(a.name);
      const indexB = orderProperties.indexOf(b.name);
      // Fields not in order array go to the end
      const orderA = indexA === -1 ? Infinity : indexA;
      const orderB = indexB === -1 ? Infinity : indexB;
      return orderA - orderB;
    });
  }

  // Fallback: required first, then prompt, then alphabetically
  return fields.sort((a, b) => {
    if (a.required !== b.required) {
      return a.required ? -1 : 1;
    }
    if (a.name === "prompt") return -1;
    if (b.name === "prompt") return 1;
    return a.name.localeCompare(b.name);
  });
}

function propertyToField(
  name: string,
  prop: SchemaProperty,
  required: boolean,
): FormFieldConfig | null {
  const baseField = {
    name,
    label: localizeFieldLabel(name, prop.title),
    required: prop["x-hidden"] ? false : required, // x-hidden fields are never required
    default: prop.default,
    description: localizeFieldDescription(name, prop.description),
    hidden: !!prop["x-hidden"],
  };

  // Handle x-ui-component: uploader (single file) / uploaders (multi-file)
  if (
    prop["x-ui-component"] === "uploader" ||
    prop["x-ui-component"] === "uploaders"
  ) {
    const isMulti = prop["x-ui-component"] === "uploaders";
    // If no x-accept, try to infer from field name
    let fileAccept = prop["x-accept"];
    if (!fileAccept) {
      const inferred = detectFileType(name);
      fileAccept = inferred?.accept || "image/*";
    }
    return {
      ...baseField,
      type: isMulti ? "file-array" : "file",
      accept: fileAccept,
      maxFiles: isMulti ? prop.maxItems || 10 : 1,
      placeholder: localizeFieldDescription(name, prop["x-placeholder"]),
    };
  }

  // Check if this is a file input field (string type with matching name pattern)
  if (prop.type === "string") {
    const filePattern = detectFileType(name);
    if (filePattern) {
      return {
        ...baseField,
        type: filePattern.type,
        accept: filePattern.accept,
        maxFiles: prop.maxItems || (filePattern.type === "file-array" ? 10 : 1),
      };
    }
  }

  // Handle 'data' field as file upload (commonly used for training data)
  if (name.toLowerCase() === "data" && prop.type === "string") {
    return {
      ...baseField,
      type: "file",
      accept: prop["x-accept"] || "*/*",
      placeholder: localizeFieldDescription(name, prop["x-placeholder"]),
    };
  }

  // Handle loras fields (including high_noise_loras, low_noise_loras)
  if (
    prop["x-ui-component"] === "loras" ||
    (name.toLowerCase().includes("lora") && prop.type === "array")
  ) {
    return {
      ...baseField,
      type: "loras",
      maxFiles: prop.maxItems || 3,
    };
  }

  // Handle x-ui-component: "array" — dynamic list of structured objects
  if (
    prop.type === "array" &&
    prop["x-ui-component"] === "array" &&
    prop.items?.type === "object" &&
    prop.items.properties
  ) {
    const itemProps = prop.items.properties as Record<string, SchemaProperty>;
    const orderProps = (prop.items["x-order-properties"] as string[]) || [];
    const subFields = schemaToFormFields(itemProps, [], orderProps);
    if (subFields.length > 0) {
      return {
        ...baseField,
        type: "object-array",
        itemFields: subFields,
        max: prop.maxItems,
      };
    }
  }

  // Handle array type (could be file array)
  if (prop.type === "array") {
    const lowerName = name.toLowerCase();
    // Check if it's an array of strings that looks like URLs/files
    if (
      lowerName.includes("image") ||
      lowerName.includes("video") ||
      lowerName.includes("audio")
    ) {
      let accept = "image/*";
      if (lowerName.includes("video")) accept = "video/*";
      else if (lowerName.includes("audio")) accept = "audio/*";
      return {
        ...baseField,
        type: "file-array",
        accept,
        maxFiles: prop.maxItems || 10,
      };
    }
    // Handle array of objects with a single enum property (e.g. tag_list: [{tag_id: "o_101"}])
    if (prop.items && prop.items.type === "object" && prop.items.properties) {
      const itemProps = prop.items.properties as Record<string, SchemaProperty>;
      const keys = Object.keys(itemProps);
      if (keys.length === 1) {
        const innerProp = itemProps[keys[0]];
        const enumValues = innerProp["x-enum"] || innerProp.enum;
        if (enumValues && enumValues.length > 0) {
          return {
            ...baseField,
            type: "multi-select",
            options: enumValues,
            wrapKey: keys[0],
            max: prop.maxItems,
          };
        }
      }
    }
    // Fallback: arrays of strings with enum → multi-select
    if (prop.items?.enum && prop.items.enum.length > 0) {
      return {
        ...baseField,
        type: "multi-select",
        options: prop.items.enum,
        max: prop.maxItems,
      };
    }
    // Fallback: arrays of strings with x-enum → multi-select
    if (prop.items?.["x-enum"] && prop.items["x-enum"].length > 0) {
      return {
        ...baseField,
        type: "multi-select",
        options: prop.items["x-enum"],
        max: prop.maxItems,
      };
    }
    // Array of strings (generic)
    if (!prop.items || prop.items.type === "string") {
      return {
        ...baseField,
        type: "string-array",
        maxFiles: prop.maxItems || 10,
      };
    }
    // Unsupported array item type — skip
    return null;
  }

  // Handle enum type (including size with enum)
  if (prop.enum && prop.enum.length > 0) {
    return {
      ...baseField,
      type: "select",
      options: prop.enum,
      // If no explicit default, use the first enum value so the UI isn't blank
      default: baseField.default ?? prop.enum[0],
    };
  }

  // Handle size field without enum - use custom size selector with min/max
  if (name.toLowerCase() === "size") {
    return {
      ...baseField,
      type: "size",
      min: prop.minimum,
      max: prop.maximum,
    };
  }

  // Handle different types
  switch (prop.type) {
    case "string":
      return {
        ...baseField,
        type: TEXTAREA_FIELDS.some((f) => name.toLowerCase().includes(f))
          ? "textarea"
          : "text",
      };

    case "integer":
    case "number":
      return {
        ...baseField,
        type: prop["x-ui-component"] === "slider" ? "slider" : "number",
        schemaType: prop.type,
        min: prop.minimum,
        max: prop.maximum,
        step: prop.step,
      };

    case "boolean":
      return {
        ...baseField,
        type: "boolean",
      };

    default:
      // For unknown types, default to text
      return {
        ...baseField,
        type: "text",
      };
  }
}

function formatLabel(name: string): string {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const FIELD_LABELS: Record<string, string> = {
  prompt: "提示词",
  negative_prompt: "反向提示词",
  image: "图像",
  images: "图像",
  image_url: "图像",
  image_urls: "图像",
  input_image: "输入图像",
  input_images: "输入图像",
  reference_image: "参考图像",
  reference_images: "参考图像",
  mask_image: "蒙版图像",
  mask_image_url: "蒙版图像",
  mask_images: "蒙版图像",
  mask_image_urls: "蒙版图像",
  video: "视频",
  video_url: "视频",
  audio: "音频",
  audio_url: "音频",
  first_frame_image: "首帧图像",
  last_frame_image: "尾帧图像",
  start_image: "起始图像",
  end_image: "结束图像",
  aspect_ratio: "宽高比",
  ratio: "宽高比",
  size: "尺寸",
  width: "宽度",
  height: "高度",
  resolution: "分辨率",
  quality: "质量",
  output_format: "格式",
  format: "格式",
  seed: "随机种子",
  guidance_scale: "提示词引导",
  cfg_scale: "提示词引导",
  num_inference_steps: "推理步数",
  steps: "步数",
  strength: "强度",
  style: "风格",
  model: "模型",
  source_lang: "源语言",
  source_language: "源语言",
  target_lang: "目标语言",
  target_language: "目标语言",
  lang: "语言",
  language: "语言",
  duration: "时长",
  fps: "帧率",
  motion_bucket_id: "运动强度",
  enable_prompt_expansion: "启用提示词扩展",
  prompt_expansion: "提示词扩展",
  loras: "LoRA",
  data: "数据文件",
};

const TITLE_LABELS: Record<string, string> = {
  prompt: "提示词",
  "negative prompt": "反向提示词",
  images: "图像",
  image: "图像",
  video: "视频",
  audio: "音频",
  "aspect ratio": "宽高比",
  size: "尺寸",
  width: "宽度",
  height: "高度",
  resolution: "分辨率",
  quality: "质量",
  "output format": "格式",
  format: "格式",
  seed: "随机种子",
  "enable prompt expansion": "启用提示词扩展",
  "source lang": "源语言",
  "source language": "源语言",
  "target lang": "目标语言",
  "target language": "目标语言",
  language: "语言",
};

function normalizeTextKey(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function localizeFieldLabel(name: string, title?: string) {
  const lowerName = name.toLowerCase();
  if (FIELD_LABELS[lowerName]) return FIELD_LABELS[lowerName];

  if (title) {
    const normalizedTitle = normalizeTextKey(title);
    if (TITLE_LABELS[normalizedTitle]) return TITLE_LABELS[normalizedTitle];
  }

  if (lowerName.includes("negative") && lowerName.includes("prompt")) {
    return "反向提示词";
  }
  if (lowerName.includes("prompt")) return "提示词";
  if (lowerName.includes("aspect") && lowerName.includes("ratio")) {
    return "宽高比";
  }
  if (lowerName.includes("image"))
    return lowerName.includes("mask") ? "蒙版图像" : "图像";
  if (lowerName.includes("video")) return "视频";
  if (lowerName.includes("audio")) return "音频";
  if (lowerName.includes("quality")) return "质量";
  if (lowerName.includes("resolution")) return "分辨率";
  if (lowerName.includes("format")) return "格式";
  if (lowerName.includes("seed")) return "随机种子";
  if (lowerName.includes("target") && lowerName.includes("lang"))
    return "目标语言";
  if (lowerName.includes("source") && lowerName.includes("lang"))
    return "源语言";
  if (lowerName.includes("lang") || lowerName.includes("language"))
    return "语言";
  if (lowerName.includes("duration")) return "时长";

  return title || formatLabel(name);
}

function localizeFieldDescription(name: string, description?: string) {
  const lowerName = name.toLowerCase();
  if (lowerName === "prompt") return "请输入用于生成的正向提示词。";
  if (lowerName.includes("negative") && lowerName.includes("prompt")) {
    return "可选，输入不希望出现在结果中的内容。";
  }
  if (lowerName.includes("image")) return "上传图片或输入图片 URL。";
  if (lowerName.includes("video")) return "上传视频或输入视频 URL。";
  if (lowerName.includes("audio")) return "上传音频或输入音频 URL。";
  if (lowerName.includes("seed")) return "相同种子可复现相近结果，留空则随机。";
  if (lowerName.includes("guidance") || lowerName.includes("cfg")) {
    return "控制提示词对结果的影响强度。";
  }
  if (lowerName.includes("steps"))
    return "推理步数越高通常越精细，但耗时更长。";
  if (lowerName.includes("prompt_expansion"))
    return "自动扩展提示词，提升细节表现。";
  if (lowerName.includes("target") && lowerName.includes("lang"))
    return "选择翻译后的目标语言。";
  if (lowerName.includes("source") && lowerName.includes("lang"))
    return "选择原始内容的语言，自动表示由模型判断。";

  return description;
}

export function getDefaultValues(
  fields: FormFieldConfig[],
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const field of fields) {
    // Skip default values for loras - let user add them manually
    if (field.type === "loras") {
      defaults[field.name] = [];
      continue;
    }
    if (field.default !== undefined) {
      // Normalize size defaults: ensure "W*H" format (API schema may provide a single number)
      if (field.type === "size") {
        const raw = String(field.default);
        if (!raw.includes("*")) {
          const n = parseInt(raw, 10);
          defaults[field.name] = !isNaN(n) ? `${n}*${n}` : field.default;
        } else {
          defaults[field.name] = field.default;
        }
      } else {
        defaults[field.name] = field.default;
      }
    } else if (field.type === "boolean") {
      defaults[field.name] = false;
    } else if (field.type === "file-array") {
      defaults[field.name] = [];
    } else if (field.type === "string-array") {
      defaults[field.name] = [];
    } else if (field.type === "object-array") {
      defaults[field.name] = [];
    }
  }

  return defaults;
}

export type MediaType = "image" | "video" | "audio";

const MEDIA_KEYS: Record<
  MediaType,
  {
    singular: string;
    plural: string;
    url: string;
    urls: string;
    suffixSingular: string;
    suffixPlural: string;
  }
> = {
  image: {
    singular: "image",
    plural: "images",
    url: "image_url",
    urls: "image_urls",
    suffixSingular: "_image",
    suffixPlural: "images",
  },
  video: {
    singular: "video",
    plural: "videos",
    url: "video_url",
    urls: "video_urls",
    suffixSingular: "_video",
    suffixPlural: "videos",
  },
  audio: {
    singular: "audio",
    plural: "audios",
    url: "audio_url",
    urls: "audio_urls",
    suffixSingular: "_audio",
    suffixPlural: "audios",
  },
};

/** Get a single media URL from form values. Treats plural (e.g. "images") as singular by taking the first. */
export function getSingleMediaFromValues(
  values: Record<string, unknown> | undefined,
  mediaType: MediaType,
): string | undefined {
  if (!values) return undefined;
  const keys = MEDIA_KEYS[mediaType];
  const v = values[keys.singular];
  if (typeof v === "string" && v) return v;
  const arr = values[keys.plural];
  if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "string")
    return arr[0];
  if (mediaType === "image") {
    const input = values["input"];
    if (typeof input === "string" && input) return input;
  }
  for (const [key, val] of Object.entries(values)) {
    const k = key.toLowerCase();
    if (
      typeof val === "string" &&
      val &&
      (k.endsWith(keys.suffixSingular) || k === keys.url)
    )
      return val;
    if (
      Array.isArray(val) &&
      val.length > 0 &&
      typeof val[0] === "string" &&
      (k.endsWith(keys.suffixPlural) || k.endsWith(keys.urls))
    )
      return val[0];
  }
  return undefined;
}

/** Get media URL array from form values. Treats singular (e.g. "image") as array by wrapping. */
export function getMediaArrayFromValues(
  values: Record<string, unknown> | undefined,
  mediaType: MediaType,
): string[] {
  if (!values) return [];
  const keys = MEDIA_KEYS[mediaType];
  const arr = values[keys.plural];
  if (Array.isArray(arr))
    return arr.filter((x): x is string => typeof x === "string");
  const single = values[keys.singular];
  if (typeof single === "string" && single) return [single];
  const url = values[keys.url];
  if (typeof url === "string" && url) return [url];
  const urls = values[keys.urls];
  if (Array.isArray(urls))
    return urls.filter((x): x is string => typeof x === "string");
  for (const [key, val] of Object.entries(values)) {
    const k = key.toLowerCase();
    if (k.endsWith(keys.suffixPlural) && Array.isArray(val))
      return val.filter((x): x is string => typeof x === "string");
    if (
      (k.endsWith(keys.suffixSingular) || k === keys.url) &&
      typeof val === "string" &&
      val
    )
      return [val];
  }
  return [];
}

/** Field names that the API typically expects as arrays (plural / _urls). */
const ARRAY_FIELD_PATTERNS = [
  "images",
  "image_urls",
  "videos",
  "video_urls",
  "audios",
  "audio_urls",
];

function isArrayFieldName(key: string): boolean {
  const k = key.toLowerCase();
  // Skip fields that are clearly numeric (e.g. num_images, num_videos)
  if (
    k.startsWith("num_") ||
    k.startsWith("number_") ||
    k.startsWith("count_") ||
    k.startsWith("total_") ||
    k.startsWith("max_") ||
    k.startsWith("min_")
  )
    return false;
  return ARRAY_FIELD_PATTERNS.some(
    (p) =>
      k === p ||
      k.endsWith("_images") ||
      k.endsWith("_image_urls") ||
      k.endsWith("_videos") ||
      k.endsWith("_video_urls") ||
      k.endsWith("_audios") ||
      k.endsWith("_audio_urls"),
  );
}

/**
 * Ensure payload values for array-type fields are arrays. APIs often return
 * "value must be an array" when a field like `images` is sent as a string.
 * Use before calling the run/prediction API.
 */
export function normalizePayloadArrays(
  payload: Record<string, unknown>,
  formFields: FormFieldConfig[],
): Record<string, unknown> {
  const out = { ...payload };

  // Handle multi-select wrapKey: transform ["a","b"] → [{key: "a"}, {key: "b"}]
  for (const f of formFields) {
    if (f.type === "multi-select" && f.wrapKey && Array.isArray(out[f.name])) {
      out[f.name] = (out[f.name] as string[]).map((v) => ({
        [f.wrapKey!]: v,
      }));
    }
  }

  const arrayFieldNames = new Set<string>(
    formFields
      .filter(
        (f) =>
          f.type === "file-array" ||
          f.type === "string-array" ||
          f.type === "object-array",
      )
      .map((f) => f.name),
  );
  for (const key of Object.keys(out)) {
    if (!arrayFieldNames.has(key) && !isArrayFieldName(key)) continue;
    const v = out[key];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) continue;
    out[key] = [v];
  }
  // If API expects "images" but form only has "image", add images array (same for video/audio)
  const singularToPlural: [string, string][] = [
    ["image", "images"],
    ["image_url", "image_urls"],
    ["video", "videos"],
    ["video_url", "video_urls"],
    ["audio", "audios"],
    ["audio_url", "audio_urls"],
  ];
  for (const [singular, plural] of singularToPlural) {
    if (out[plural] !== undefined) continue;
    const single = out[singular];
    if (single === undefined || single === null || single === "") continue;
    out[plural] = Array.isArray(single) ? single : [single];
  }
  return out;
}

/** @deprecated Use getSingleMediaFromValues(values, 'image') */
export function getSingleImageFromValues(
  values: Record<string, unknown> | undefined,
): string | undefined {
  return getSingleMediaFromValues(values, "image");
}

/** @deprecated Use getMediaArrayFromValues(values, 'image') */
export function getImageArrayFromValues(
  values: Record<string, unknown> | undefined,
): string[] {
  return getMediaArrayFromValues(values, "image");
}

/** @deprecated Use getSingleMediaFromValues(values, 'video') */
export function getSingleVideoFromValues(
  values: Record<string, unknown> | undefined,
): string | undefined {
  return getSingleMediaFromValues(values, "video");
}

/** @deprecated Use getMediaArrayFromValues(values, 'video') */
export function getVideoArrayFromValues(
  values: Record<string, unknown> | undefined,
): string[] {
  return getMediaArrayFromValues(values, "video");
}

/** @deprecated Use getSingleMediaFromValues(values, 'audio') */
export function getSingleAudioFromValues(
  values: Record<string, unknown> | undefined,
): string | undefined {
  return getSingleMediaFromValues(values, "audio");
}

/** @deprecated Use getMediaArrayFromValues(values, 'audio') */
export function getAudioArrayFromValues(
  values: Record<string, unknown> | undefined,
): string[] {
  return getMediaArrayFromValues(values, "audio");
}

/** Extract form fields from a Desktop API Model using the same logic as the Playground (DynamicForm). */
export function getFormFieldsFromModel(model: Model): FormFieldConfig[] {
  const apiSchemas = (model.api_schema as Record<string, unknown> | undefined)
    ?.api_schemas as
    | Array<{
        type: string;
        request_schema?: {
          properties?: Record<string, SchemaProperty>;
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
    requestSchema.properties,
    requestSchema.required ?? [],
    requestSchema["x-order-properties"],
  );
}

/**
 * Normalize raw API inputs to match the form value format expected by the Playground.
 * Specifically handles the "size" field which the API may return as a single number
 * (e.g. 2048 or "2048") but the form expects "W*H" format (e.g. "2048*2048").
 */
export function normalizeApiInputsToFormValues(
  inputs: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...inputs };

  // Normalize "size" field: single number → "W*H" format
  if (normalized.size !== undefined) {
    const raw = String(normalized.size);
    if (!raw.includes("*")) {
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) {
        normalized.size = `${n}*${n}`;
      }
    }
  }

  return normalized;
}
