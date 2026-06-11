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
import { OFFICIAL_WAVESPEED_API_BASE_URL, apiClient } from "@/api/client";
import { useTemplateStore } from "@/stores/templateStore";
import { usePredictionInputsStore } from "@/stores/predictionInputsStore";
import { useApiServiceStore } from "@/stores/apiServiceStore";
import { usePageActive } from "@/hooks/usePageActive";
import {
  getDefaultValues,
  normalizePayloadArrays,
  schemaToFormFields,
  type FormFieldConfig,
} from "@/lib/schemaToForm";
import {
  AUDIO_FIELD_NAMES,
  IMAGE_FIELD_NAMES,
  VIDEO_FIELD_NAMES,
  findFamilyByVariantId,
  getFilledFieldNames,
  type SmartFormFamily,
} from "@/lib/smartFormConfig";
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

function getModelFamily(modelId: string): string {
  const parts = modelId.split("/");
  if (parts.length <= 2) return modelId;
  return parts.slice(0, 2).join("/");
}

function getModelFamilyName(modelId: string): string {
  const parts = getModelFamily(modelId).split("/");
  return parts[1] || parts[0] || modelId;
}

function formatModelTitle(value: string): string {
  return value
    .split("-")
    .map((part) => {
      const lower = part.toLowerCase();
      if (["ai", "api", "gpt", "sd", "xl", "hd", "uhd", "3d"].includes(lower)) {
        return lower.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function getFriendlyModelName(model: Model | null | undefined): string {
  if (!model) return "";
  return formatModelTitle(getModelFamilyName(model.model_id));
}

function getAudioModelName(model: Model | null | undefined): string {
  if (!model) return "";
  const id = model.model_id.toLowerCase();
  if (id.includes("qwen3") && (id.includes("tts") || id.includes("speech"))) {
    return "Qwen3 TTS";
  }
  return formatModelTitle(getModelFamilyName(model.model_id))
    .replace(/\bTts\b/g, "TTS")
    .replace(/\bAi\b/g, "AI")
    .replace(/\bApi\b/g, "API");
}

function get3DModelName(model: Model | null | undefined): string {
  if (!model) return "";
  const provider = model.model_id.split("/")[0]?.toLowerCase();
  const familyName = getModelFamilyName(model.model_id);
  const formatted = formatModelTitle(familyName)
    .replace(/\b3d\b/gi, "3D")
    .replace(/\bV(\d)/g, "V$1")
    .replace(/\bH(\d)/g, "H$1");

  if (provider === "tripo3d") {
    if (familyName.toLowerCase().includes("triposplat")) return "TripoSplat";
    return `Tripo3D ${formatted}`;
  }
  return formatted;
}

function getWorkspaceModelName(
  model: Model | null | undefined,
  workspace: PlaygroundWorkspace,
): string {
  if (!model) return "";
  if (workspace === "image") return getFriendlyModelName(model);
  if (workspace === "audio") return getAudioModelName(model);
  if (workspace === "3d") return get3DModelName(model);
  return model.model_id;
}

function getAudioFamilyKey(modelId: string): string {
  const id = modelId.toLowerCase();
  const family = getModelFamily(modelId);
  if (
    id.includes("qwen3") &&
    (id.includes("tts") || id.includes("speech") || id.includes("voice"))
  ) {
    return "wavespeed-ai/qwen3-tts";
  }
  return family;
}

function get3DFamilyKey(modelId: string): string {
  const parts = modelId.split("/");
  const provider = parts[0] || modelId;
  const family = parts[1] || "";
  const variant = parts[2] || "";
  const id = modelId.toLowerCase();

  if (provider === "wavespeed-ai" && family === "hunyuan3d") {
    if (variant.startsWith("v2")) return "wavespeed-ai/hunyuan3d/v2";
    return `${provider}/${family}`;
  }

  if (id.startsWith("wavespeed-ai/hunyuan-3d-v3.1/")) {
    return "wavespeed-ai/hunyuan-3d-v3.1";
  }

  return getModelFamily(modelId);
}

function extractModelFormFields(model: Model): FormFieldConfig[] {
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
    (schema) => schema.type === "model_run",
  )?.request_schema;
  if (!requestSchema?.properties) return [];

  return schemaToFormFields(
    requestSchema.properties as Record<
      string,
      import("@/types/model").SchemaProperty
    >,
    requestSchema.required || [],
    requestSchema["x-order-properties"],
  );
}

type AudioModeDefinition = {
  value: string;
  labelKey: string;
  modelId: string;
  rank: number;
};

function getAudioModeDefinition(model: Model): AudioModeDefinition {
  const id = model.model_id.toLowerCase();
  const fields = extractModelFormFields(model);
  const fieldText = fields
    .map((field) =>
      [field.name, field.label, field.description].filter(Boolean).join(" "),
    )
    .join(" ")
    .toLowerCase();

  if (id.includes("voice-design") || fieldText.includes("voice_description")) {
    return {
      value: "voice-design",
      labelKey: "smartPlayground.modeVoiceDesign",
      modelId: model.model_id,
      rank: 30,
    };
  }
  if (
    id.includes("voice-clone") ||
    id.includes("clone") ||
    fieldText.includes("reference_audio")
  ) {
    return {
      value: "voice-clone",
      labelKey: "smartPlayground.modeVoiceClone",
      modelId: model.model_id,
      rank: 20,
    };
  }
  if (
    id.includes("speech-to-speech") ||
    id.includes("audio-to-audio") ||
    id.includes("voice-conversion")
  ) {
    return {
      value: "audio-to-audio",
      labelKey: "smartPlayground.modeAudioToAudio",
      modelId: model.model_id,
      rank: 40,
    };
  }
  if (id.includes("cover")) {
    return {
      value: "music-cover",
      labelKey: "smartPlayground.modeMusicCover",
      modelId: model.model_id,
      rank: 70,
    };
  }
  if (
    id.includes("text-to-music") ||
    id.includes("music-generation") ||
    id.includes("music")
  ) {
    return {
      value: "music",
      labelKey: "smartPlayground.modeMusic",
      modelId: model.model_id,
      rank: 60,
    };
  }
  if (id.includes("text-to-audio")) {
    return {
      value: "text-to-audio",
      labelKey: "smartPlayground.modeTextToAudio",
      modelId: model.model_id,
      rank: 50,
    };
  }
  return {
    value: "text-to-speech",
    labelKey: "smartPlayground.modeTextToSpeech",
    modelId: model.model_id,
    rank: 10,
  };
}

function buildDynamicAudioSmartFamily(
  models: Model[],
  selectedModel: Model | null | undefined,
): SmartFormFamily | undefined {
  if (!selectedModel) return undefined;
  const familyKey = getAudioFamilyKey(selectedModel.model_id);
  const familyModels = models.filter(
    (model) => getAudioFamilyKey(model.model_id) === familyKey,
  );
  if (familyModels.length === 0) return undefined;

  const modeDefinitions = familyModels
    .map(getAudioModeDefinition)
    .sort((a, b) => a.rank - b.rank || a.modelId.localeCompare(b.modelId));
  const modeByValue = new Map<string, AudioModeDefinition>();
  for (const mode of modeDefinitions) {
    if (!modeByValue.has(mode.value)) {
      modeByValue.set(mode.value, mode);
    }
  }

  const selectedMode = getAudioModeDefinition(selectedModel);
  const primaryVariant =
    modeByValue.get("text-to-speech")?.modelId ??
    modeByValue.get(selectedMode.value)?.modelId ??
    selectedModel.model_id;
  const toggleOptions = Array.from(modeByValue.values());

  return {
    id: `audio:${familyKey}`,
    name: getAudioModelName(selectedModel),
    provider: selectedModel.model_id.split("/")[0] || "audio",
    poster: "",
    category: "audio",
    variantIds: familyModels.map((model) => model.model_id),
    primaryVariant,
    toggles:
      toggleOptions.length > 1
        ? [
            {
              key: "mode",
              labelKey: "smartPlayground.toggleMode",
              options: toggleOptions.map((mode) => ({
                value: mode.value,
                labelKey: mode.labelKey,
              })),
              default: selectedMode.value,
            },
          ]
        : [],
    resolveVariant(filledFields, toggleValues) {
      const requestedMode = toggleValues.mode ?? selectedMode.value;
      if (
        requestedMode !== "text-to-speech" &&
        modeByValue.has(requestedMode)
      ) {
        return modeByValue.get(requestedMode)!.modelId;
      }
      if (
        hasFilledAnyField(filledFields, AUDIO_FIELD_NAMES) &&
        modeByValue.has("voice-clone")
      ) {
        return modeByValue.get("voice-clone")!.modelId;
      }
      return (
        modeByValue.get(requestedMode)?.modelId ??
        modeByValue.get("text-to-speech")?.modelId ??
        primaryVariant
      );
    },
  };
}

type ThreeDModeDefinition = {
  value: string;
  labelKey: string;
  modelId: string;
  rank: number;
};

function get3DModeDefinition(model: Model): ThreeDModeDefinition {
  const id = model.model_id.toLowerCase();
  const modelType = (model.type ?? "").toLowerCase();
  const fields = extractModelFormFields(model);
  const fieldNames = fields.map((field) => field.name.toLowerCase());
  const requiredFieldNames = new Set(
    fields
      .filter((field) => field.required)
      .map((field) => field.name.toLowerCase()),
  );
  const hasRequiredPrompt = requiredFieldNames.has("prompt");
  const hasRequiredImage = fieldNames.some(
    (name) =>
      requiredFieldNames.has(name) &&
      (name === "image" ||
        name === "image_url" ||
        name === "images" ||
        name === "image_urls" ||
        name.endsWith("_image") ||
        name.endsWith("_image_url")),
  );
  const hasMultiViewInput = fieldNames.some((name) =>
    [
      "images",
      "image_urls",
      "front_image_url",
      "front_image",
      "back_image_url",
      "back_image",
      "left_image_url",
      "left_image",
      "right_image_url",
      "right_image",
    ].includes(name),
  );

  if (id.includes("sketch-to-3d")) {
    return {
      value: "sketch",
      labelKey: "smartPlayground.modeSketch",
      modelId: model.model_id,
      rank: 25,
    };
  }

  if (
    id.includes("multi-view") ||
    id.includes("multiview") ||
    id.includes("multi-image") ||
    id.includes("images-to-3d") ||
    hasMultiViewInput
  ) {
    return {
      value: "multi-view",
      labelKey: "smartPlayground.modeMultiView",
      modelId: model.model_id,
      rank: 30,
    };
  }
  if (
    id.includes("text-to-3d") ||
    modelType === "text-to-3d" ||
    (hasRequiredPrompt && !hasRequiredImage)
  ) {
    return {
      value: "text",
      labelKey: "smartPlayground.modeText",
      modelId: model.model_id,
      rank: 10,
    };
  }
  if (
    id.includes("image-to-3d") ||
    id.includes("image-to-mesh") ||
    id.includes("image-to-model") ||
    hasRequiredImage ||
    fieldNames.includes("image") ||
    fieldNames.includes("image_url")
  ) {
    return {
      value: "image",
      labelKey: "smartPlayground.modeImage",
      modelId: model.model_id,
      rank: 20,
    };
  }
  return {
    value: "text",
    labelKey: "smartPlayground.modeText",
    modelId: model.model_id,
    rank: 10,
  };
}

function buildDynamic3DSmartFamily(
  models: Model[],
  selectedModel: Model | null | undefined,
): SmartFormFamily | undefined {
  if (!selectedModel) return undefined;
  const familyKey = get3DFamilyKey(selectedModel.model_id);
  const familyModels = models.filter(
    (model) => get3DFamilyKey(model.model_id) === familyKey,
  );
  if (familyModels.length === 0) return undefined;

  const modeDefinitions = familyModels
    .map(get3DModeDefinition)
    .sort((a, b) => a.rank - b.rank || a.modelId.localeCompare(b.modelId));
  const modeByValue = new Map<string, ThreeDModeDefinition>();
  for (const mode of modeDefinitions) {
    if (!modeByValue.has(mode.value)) {
      modeByValue.set(mode.value, mode);
    }
  }

  const selectedMode = get3DModeDefinition(selectedModel);
  const primaryVariant =
    modeByValue.get("text")?.modelId ??
    modeByValue.get("image")?.modelId ??
    modeByValue.get(selectedMode.value)?.modelId ??
    selectedModel.model_id;
  const toggleOptions = Array.from(modeByValue.values());

  return {
    id: `3d:${familyKey}`,
    name: get3DModelName(selectedModel),
    provider: selectedModel.model_id.split("/")[0] || "3d",
    poster: "",
    category: "3d",
    variantIds: familyModels.map((model) => model.model_id),
    primaryVariant,
    toggles:
      toggleOptions.length > 1
        ? [
            {
              key: "mode",
              labelKey: "smartPlayground.toggleMode",
              options: toggleOptions.map((mode) => ({
                value: mode.value,
                labelKey: mode.labelKey,
              })),
              default: selectedMode.value,
            },
          ]
        : [],
    resolveVariant(filledFields, toggleValues) {
      const requestedMode = toggleValues.mode ?? selectedMode.value;
      if (modeByValue.has(requestedMode)) {
        return modeByValue.get(requestedMode)!.modelId;
      }
      if (
        hasFilledAnyField(filledFields, [
          "images",
          "image_urls",
          "front_image",
          "front_image_url",
          "back_image",
          "back_image_url",
          "left_image",
          "left_image_url",
          "right_image",
          "right_image_url",
        ]) &&
        modeByValue.has("multi-view")
      ) {
        return modeByValue.get("multi-view")!.modelId;
      }
      if (
        hasFilledAnyField(filledFields, IMAGE_FIELD_NAMES) &&
        modeByValue.has("image")
      ) {
        return modeByValue.get("image")!.modelId;
      }
      return (
        modeByValue.get(requestedMode)?.modelId ??
        modeByValue.get("text")?.modelId ??
        modeByValue.get("image")?.modelId ??
        primaryVariant
      );
    },
  };
}

function tune3DFields(
  fields: FormFieldConfig[],
  mode: string,
  modelId: string,
): FormFieldConfig[] {
  const normalizedMode = mode || "image";
  const id = modelId.toLowerCase();
  const fieldNotes: Record<string, { label: string; description: string }> = {
    image: {
      label: id.includes("sketch") ? "草图" : "单张参考图",
      description: id.includes("sketch")
        ? "上传草图或概念图，用于生成 3D 模型。"
        : "上传单张物体参考图，适合图生 3D 模型。",
    },
    image_url: {
      label: "单张参考图",
      description: "上传单张物体参考图，适合图生 3D 模型。",
    },
    front_image: {
      label: "前视图",
      description: "上传物体正面视角图片，这是多视图生成的主要参考图。",
    },
    back_image: {
      label: "后视图",
      description: "上传物体背面视角图片，用于补全背部结构。",
    },
    left_image: {
      label: "左视图",
      description: "上传物体左侧视角图片，用于补全侧面结构。",
    },
    right_image: {
      label: "右视图",
      description: "上传物体右侧视角图片，用于补全侧面结构。",
    },
    images: {
      label: "多视图图像",
      description:
        "上传同一物体的 2-4 张多角度图片，建议顺序为：前视图、左视图、后视图、右视图。",
    },
    image_urls: {
      label: "多视图图像",
      description:
        "上传同一物体的 2-4 张多角度图片，建议顺序为：前视图、左视图、后视图、右视图。",
    },
    front_image_url: {
      label: "前视图",
      description: "上传物体正面视角图片，这是多视图生成的主要参考图。",
    },
    back_image_url: {
      label: "后视图",
      description: "上传物体背面视角图片，用于补全背部结构。",
    },
    left_image_url: {
      label: "左视图",
      description: "上传物体左侧视角图片，用于补全侧面结构。",
    },
    right_image_url: {
      label: "右视图",
      description: "上传物体右侧视角图片，用于补全侧面结构。",
    },
    mask_image: {
      label: "区域蒙版",
      description: "可选，上传蒙版以指定需要处理的区域。",
    },
    texture_image: {
      label: "纹理参考图",
      description: "可选，上传 2D 图片作为纹理风格或纹理细节参考。",
    },
    prompt: {
      label: normalizedMode === "text" ? "3D 描述" : "补充提示词",
      description:
        normalizedMode === "text"
          ? "描述你想创建的 3D 模型、材质、风格和细节。"
          : "可选，补充说明模型结构、材质、风格或需要强调的细节。",
    },
    negative_prompt: {
      label: "反向提示词",
      description: "可选，描述需要避免的形状、材质或瑕疵。",
    },
    texture_prompt: {
      label: "纹理提示词",
      description: "可选，描述希望生成的纹理风格或材质细节。",
    },
    addons: {
      label: "高清扩展包",
      description: "可选，生成更高分辨率纹理或更高面数网格。",
    },
    material: {
      label: "材质类型",
      description: "选择输出模型的材质类型。",
    },
    geometry_instruct_mode: {
      label: "几何指令模式",
      description: "控制提示词如何影响几何结构。",
    },
    texture_mode: {
      label: "纹理模式",
      description: "选择纹理生成方式。",
    },
    texture_delight: {
      label: "去光照纹理",
      description: "尝试去除参考图中的环境光照，让纹理更干净。",
    },
    hd_texture: {
      label: "高清纹理",
      description: "生成更高分辨率纹理，通常耗时和成本更高。",
    },
    is_micro: {
      label: "微型模型",
      description: "生成更轻量的模型文件。",
    },
    is_symmetric: {
      label: "对称模型",
      description: "按对称结构生成模型，适合正面对称物体。",
    },
    tier: {
      label: "生成档位",
      description: "选择生成速度和质量档位。",
    },
    quality_and_mesh: {
      label: "质量与网格",
      description: "选择生成质量和网格类型，面数越高通常细节越多。",
    },
    geometry_file_format: {
      label: "模型格式",
      description: "选择导出的 3D 模型文件格式。",
    },
    geometry_quality: {
      label: "几何质量",
      description: "控制模型几何细节，详细模式会增加生成成本和耗时。",
    },
    texture_quality: {
      label: "纹理质量",
      description: "控制纹理清晰度，详细模式会生成更高分辨率纹理。",
    },
    texture_alignment: {
      label: "纹理对齐",
      description: "选择纹理按原图对齐，还是按生成后的几何结构对齐。",
    },
    face_limit: {
      label: "面数限制",
      description: "目标网格面数，留空则由模型自适应决定。",
    },
    face_count: {
      label: "目标面数",
      description: "控制输出模型的面数范围，面数越高细节越多。",
    },
    target_polycount: {
      label: "目标多边形数",
      description: "控制输出模型的多边形数量。",
    },
    octree_resolution: {
      label: "八叉树分辨率",
      description: "控制 3D 重建精度，数值越高细节越多。",
    },
    num_inference_steps: {
      label: "推理步数",
      description: "推理步数越高通常更精细，但耗时更长。",
    },
    guidance_scale: {
      label: "引导强度",
      description: "控制输入图片或提示词对 3D 结果的影响强度。",
    },
    generate_type: {
      label: "生成类型",
      description: "选择生成带纹理模型、低多边形模型或白模。",
    },
    polygon_type: {
      label: "面片类型",
      description: "选择三角面或四边面拓扑。",
    },
    topology: {
      label: "拓扑类型",
      description: "选择四边面或三角面拓扑。",
    },
    symmetry_mode: {
      label: "对称模式",
      description: "控制模型是否按对称结构生成。",
    },
    art_style: {
      label: "艺术风格",
      description: "选择生成模型的整体风格。",
    },
    orientation: {
      label: "模型朝向",
      description: "控制模型默认朝向，或自动对齐输入图片。",
    },
    auto_size: {
      label: "自动尺寸",
      description: "根据真实世界比例自动缩放模型尺寸。",
    },
    texture: {
      label: "生成纹理",
      description: "开启后会为模型生成纹理贴图。",
    },
    pbr: {
      label: "PBR 材质",
      description: "开启后生成适合物理渲染的材质贴图。",
    },
    enable_pbr: {
      label: "PBR 材质",
      description: "开启后生成适合物理渲染的材质贴图。",
    },
    quad: {
      label: "四边面网格",
      description: "开启后生成四边面拓扑，适合后续编辑。",
    },
    ta_pose: {
      label: "T/A 姿态",
      description: "适合角色模型绑定或后续动画制作。",
    },
    should_remesh: {
      label: "重新拓扑",
      description: "开启后会优化网格拓扑，让模型更干净。",
    },
    should_texture: {
      label: "生成纹理",
      description: "开启后会为模型生成纹理贴图。",
    },
    enable_prompt_expansion: {
      label: "扩展提示词",
      description: "自动扩展提示词以增强 3D 细节。",
    },
    use_original_alpha: {
      label: "使用原图透明通道",
      description: "处理图片输入时保留原图透明通道。",
    },
    preview_render: {
      label: "生成预览图",
      description: "在下载列表中附带模型预览渲染图。",
    },
    seed: {
      label: "随机种子",
      description: "相同种子可复现相近结果，留空则随机。",
    },
    model_seed: {
      label: "模型种子",
      description: "控制几何结构生成的随机性。",
    },
    texture_seed: {
      label: "纹理种子",
      description: "控制纹理生成的随机性。",
    },
    image_seed: {
      label: "图片种子",
      description: "控制参考图解析阶段的随机性。",
    },
  };

  const hiddenByDefault = new Set([
    "image_seed",
    "model_seed",
    "texture_seed",
    "face_limit",
    "bbox_condition",
  ]);
  const compactOrder = new Map<string, number>([
    ["prompt", 0],
    ["negative_prompt", 1],
    ["image", 2],
    ["image_url", 2],
    ["images", 3],
    ["image_urls", 3],
    ["front_image_url", 4],
    ["front_image", 4],
    ["left_image_url", 5],
    ["left_image", 5],
    ["back_image_url", 6],
    ["back_image", 6],
    ["right_image_url", 7],
    ["right_image", 7],
    ["mask_image", 8],
    ["texture_quality", 20],
    ["geometry_quality", 21],
    ["texture_alignment", 22],
    ["orientation", 23],
    ["texture", 30],
    ["pbr", 31],
    ["enable_pbr", 31],
    ["auto_size", 32],
    ["quad", 33],
  ]);

  return fields
    .filter((field) => {
      const name = field.name.toLowerCase();
      return !field.hidden && !hiddenByDefault.has(name);
    })
    .map((field) => {
      const name = field.name.toLowerCase();
      const note = fieldNotes[name];
      return {
        ...field,
        ...(note ?? {}),
        hidden: field.hidden || hiddenByDefault.has(name),
      };
    })
    .sort((a, b) => {
      const orderA = compactOrder.get(a.name.toLowerCase()) ?? 100;
      const orderB = compactOrder.get(b.name.toLowerCase()) ?? 100;
      if (orderA !== orderB) return orderA - orderB;
      if (a.required !== b.required) return a.required ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function mergeVariantFormFields(
  models: Model[],
  primaryVariantId: string,
): FormFieldConfig[] {
  const primaryModel =
    models.find((model) => model.model_id === primaryVariantId) ?? models[0];
  if (!primaryModel) return [];

  const result: FormFieldConfig[] = [];
  const added = new Set<string>();
  for (const field of extractModelFormFields(primaryModel)) {
    result.push(field);
    added.add(field.name);
  }

  for (const model of models) {
    if (model.model_id === primaryModel.model_id) continue;
    for (const field of extractModelFormFields(model)) {
      if (added.has(field.name)) continue;
      result.push({ ...field, required: false });
      added.add(field.name);
    }
  }

  return result;
}

function getVariantSuffix(modelId: string): string {
  const parts = modelId.split("/");
  return parts.length > 2 ? parts.slice(2).join("/") : "";
}

function findResolvedSmartModel(
  models: Model[],
  resolvedVariantId: string,
  primaryVariantId: string,
): Model | null {
  const exact = models.find((model) => model.model_id === resolvedVariantId);
  if (exact) return exact;

  const suffix = getVariantSuffix(resolvedVariantId);
  if (suffix) {
    const suffixMatch = models.find((model) =>
      model.model_id.endsWith(`/${suffix}`),
    );
    if (suffixMatch) return suffixMatch;
  }

  const primary = models.find((model) => model.model_id === primaryVariantId);
  if (primary) return primary;

  const primarySuffix = getVariantSuffix(primaryVariantId);
  if (primarySuffix) {
    const primarySuffixMatch = models.find((model) =>
      model.model_id.endsWith(`/${primarySuffix}`),
    );
    if (primarySuffixMatch) return primarySuffixMatch;
  }

  return models[0] ?? null;
}

function filterValuesForFields(
  values: Record<string, unknown>,
  fields: FormFieldConfig[],
): Record<string, unknown> {
  if (fields.length === 0) return { ...values };
  const allowed = new Set(fields.map((field) => field.name));
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => allowed.has(key)),
  );
}

function buildNormalizedInput(
  values: Record<string, unknown>,
  fields: FormFieldConfig[],
): Record<string, unknown> {
  const cleanedInput: Record<string, unknown> = {};
  const integerFields = new Set(
    fields
      .filter((field) => field.schemaType === "integer")
      .map((field) => field.name),
  );

  for (const [key, value] of Object.entries(values)) {
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

  return normalizePayloadArrays(cleanedInput, fields);
}

function hasFilledAnyField(
  filledFields: Set<string>,
  names: string[],
): boolean {
  return names.some((name) => filledFields.has(name));
}

function isSmartTriggerField(
  field: FormFieldConfig,
  category: "image" | "video" | "audio" | "3d" | "other",
): boolean {
  const name = field.name.toLowerCase();
  if (name.includes("mask")) return false;
  const isImageField =
    IMAGE_FIELD_NAMES.includes(name) ||
    ((field.type === "file" || field.type === "file-array") &&
      name.includes("image"));
  const isVideoField =
    VIDEO_FIELD_NAMES.includes(name) ||
    ((field.type === "file" || field.type === "file-array") &&
      name.includes("video"));
  const isAudioField =
    AUDIO_FIELD_NAMES.includes(name) ||
    ((field.type === "file" || field.type === "file-array") &&
      name.includes("audio"));

  if (category === "image") return isImageField;
  if (category === "video") return isImageField || isVideoField || isAudioField;
  if (category === "audio") return isAudioField;
  if (category === "3d") return isImageField;
  return isImageField || isVideoField || isAudioField;
}

function tuneSeedance20Fields(
  fields: FormFieldConfig[],
  mode: string,
): FormFieldConfig[] {
  const isEdit = mode === "edit";
  const editVideoNames = [
    "video",
    "videos",
    "video_url",
    "video_urls",
    "input_video",
    "input_videos",
    "input_video_url",
    "input_video_urls",
  ];
  const genericAudioNames = [
    "audio",
    "audios",
    "audio_url",
    "audio_urls",
    "input_audio",
    "input_audios",
    "input_audio_url",
    "input_audio_urls",
  ];
  const hiddenNames = new Set(
    isEdit
      ? [
          "image",
          "images",
          "image_url",
          "image_urls",
          "input_image",
          "input_images",
          "input_image_url",
          "input_image_urls",
          "first_frame_image",
          "first_frame_image_url",
          "last_image",
          "last_image_url",
          "last_frame_image",
          "last_frame_image_url",
          "start_image",
          "start_image_url",
          "end_image",
          "end_image_url",
          "reference_image",
          "reference_images",
          "reference_image_url",
          "reference_image_urls",
          "reference_video",
          "reference_videos",
          "reference_video_url",
          "reference_video_urls",
          "reference_audio",
          "reference_audios",
          "reference_audio_url",
          "reference_audio_urls",
          ...genericAudioNames,
        ]
      : [...editVideoNames, ...genericAudioNames],
  );

  const getCanonicalName = (field: FormFieldConfig) => {
    const name = field.name.toLowerCase();
    if (
      [
        "image",
        "images",
        "image_url",
        "image_urls",
        "input_image",
        "input_images",
        "input_image_url",
        "input_image_urls",
        "start_image",
        "start_image_url",
        "first_frame_image",
        "first_frame_image_url",
      ].includes(name)
    ) {
      return "seedance-start-image";
    }
    if (
      [
        "last_image",
        "last_image_url",
        "last_frame_image",
        "last_frame_image_url",
        "end_image",
        "end_image_url",
      ].includes(name)
    ) {
      return "seedance-end-image";
    }
    if (
      [
        "reference_image",
        "reference_images",
        "reference_image_url",
        "reference_image_urls",
      ].includes(name)
    ) {
      return "seedance-reference-image";
    }
    if (editVideoNames.includes(name)) return "seedance-edit-video";
    if (genericAudioNames.includes(name)) return "seedance-audio";
    return name;
  };

  const rank = (field: FormFieldConfig) => {
    const name = field.name.toLowerCase();
    const canonicalName = getCanonicalName(field);
    if (name === "prompt") return 0;
    if (canonicalName === "seedance-edit-video") return 1;
    if (canonicalName === "seedance-start-image") return 1;
    if (canonicalName === "seedance-end-image") return 2;
    if (canonicalName === "seedance-reference-image") return 3;
    if (
      [
        "reference_video",
        "reference_videos",
        "reference_video_url",
        "reference_video_urls",
      ].includes(name)
    )
      return 4;
    if (
      [
        "reference_audio",
        "reference_audios",
        "reference_audio_url",
        "reference_audio_urls",
      ].includes(name)
    )
      return 5;
    if (name.includes("aspect") || name === "resolution" || name === "duration")
      return 10;
    if (name.includes("web_search") || name.includes("generate_audio"))
      return 11;
    return 8;
  };

  return fields
    .filter((field) => !hiddenNames.has(field.name.toLowerCase()))
    .filter((field, index, visibleFields) => {
      const canonicalName = getCanonicalName(field);
      return (
        visibleFields.findIndex(
          (candidate) => getCanonicalName(candidate) === canonicalName,
        ) === index
      );
    })
    .map((field) => {
      const name = field.name.toLowerCase();
      if (getCanonicalName(field) === "seedance-edit-video") {
        return {
          ...field,
          label: "待编辑视频",
          description: "上传需要编辑的视频。",
        };
      }
      if (getCanonicalName(field) === "seedance-start-image") {
        return {
          ...field,
          label: "起始图像",
          description: "可选，上传起始图后自动切换为图生视频。",
        };
      }
      if (getCanonicalName(field) === "seedance-end-image") {
        return {
          ...field,
          label: "末帧图像",
          description: "可选，用于定义视频结束帧。",
        };
      }
      if (getCanonicalName(field) === "seedance-reference-image") {
        return {
          ...field,
          label: "参考图像",
          description: "可选，用于引导视觉风格、人物或场景。",
        };
      }
      if (
        [
          "reference_video",
          "reference_videos",
          "reference_video_url",
          "reference_video_urls",
        ].includes(name)
      ) {
        return {
          ...field,
          label: "参考视频",
          description: "可选，总时长不能超过 15 秒。",
        };
      }
      if (
        [
          "reference_audio",
          "reference_audios",
          "reference_audio_url",
          "reference_audio_urls",
        ].includes(name)
      ) {
        return {
          ...field,
          label: "参考音频",
          description: "可选，用于声音引导的音频参考。",
        };
      }
      return field;
    })
    .sort((a, b) => rank(a) - rank(b));
}

function tuneInfiniteTalkFields(
  fields: FormFieldConfig[],
  mode: string,
): FormFieldConfig[] {
  const isVideoMode = mode === "video";
  const hiddenNames = new Set(
    isVideoMode
      ? [
          "image",
          "images",
          "image_url",
          "image_urls",
          "input_image",
          "input_images",
          "input_image_url",
          "input_image_urls",
          "mask_image",
          "mask_image_url",
          "mask_images",
          "mask_image_urls",
        ]
      : [
          "video",
          "videos",
          "video_url",
          "video_urls",
          "input_video",
          "input_videos",
          "input_video_url",
          "input_video_urls",
        ],
  );

  const rank = (field: FormFieldConfig) => {
    const name = field.name.toLowerCase();
    if (name === "prompt") return 0;
    if (name.includes("image") && !name.includes("mask")) return 1;
    if (name.includes("video")) return 1;
    if (name.includes("audio")) return 2;
    if (name.includes("mask")) return 3;
    return 8;
  };

  return fields
    .filter((field) => !hiddenNames.has(field.name.toLowerCase()))
    .sort((a, b) => rank(a) - rank(b));
}

function getSmartToggleFallback(labelKey: string, value: string): string {
  if (labelKey.endsWith("modeGenerate")) return "生成";
  if (labelKey.endsWith("modeEdit")) return "编辑";
  if (labelKey.endsWith("modeTextToSpeech")) return "文字转语音";
  if (labelKey.endsWith("modeVoiceClone")) return "音色克隆";
  if (labelKey.endsWith("modeVoiceDesign")) return "音色设计";
  if (labelKey.endsWith("modeTextToAudio")) return "文生音频";
  if (labelKey.endsWith("modeAudioToAudio")) return "音频转换";
  if (labelKey.endsWith("modeMusic")) return "音乐生成";
  if (labelKey.endsWith("modeMusicCover")) return "音乐翻唱";
  if (labelKey.endsWith("modeText")) return "文本";
  if (labelKey.endsWith("modeImage")) return "图像";
  if (labelKey.endsWith("modeSketch")) return "草图";
  if (labelKey.endsWith("modeMultiView")) return "多视图";
  if (labelKey.endsWith("modeImageToVideo")) return "图生视频";
  if (labelKey.endsWith("modeVideoToVideo")) return "视频生视频";
  if (labelKey.endsWith("qualityStd")) return "标准";
  if (labelKey.endsWith("speedFast")) return "快速";
  if (labelKey.endsWith("speedNormal")) return "标准";
  if (labelKey.endsWith("qualityPro")) return "专业";
  return value;
}

function canUseSmartFamilyForWorkspace(
  category: "image" | "video" | "audio" | "3d" | "other" | undefined,
  workspace: PlaygroundWorkspace,
) {
  return (
    (workspace === "image" && category === "image") ||
    (workspace === "video" && category === "video") ||
    (workspace === "audio" && category === "audio") ||
    (workspace === "3d" && category === "3d") ||
    (workspace === "avatar" && category === "other")
  );
}

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
  audio: [
    "wavespeed-ai/qwen3-tts/text-to-speech",
    "wavespeed-ai/qwen3-tts",
    "qwen3-tts/text-to-speech",
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

  if (workspace === "audio") {
    if (id.includes("qwen3") && id.includes("text-to-speech")) return 0;
    if (id.includes("qwen3") && id.includes("tts")) return 1;
    if (id.includes("text-to-speech") || id.includes("tts")) return 2;
    if (id.includes("voice-clone")) return 3;
    if (id.includes("voice-design")) return 4;
    if (id.includes("music")) return 5;
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

function isOfficialWaveSpeedBaseUrl(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname === "api.wavespeed.ai";
  } catch {
    return baseUrl.replace(/\/+$/, "") === OFFICIAL_WAVESPEED_API_BASE_URL;
  }
}

function isPredictionRunningStatus(status: string | undefined | null) {
  return (
    status === "created" ||
    status === "pending" ||
    status === "processing" ||
    status === "queued" ||
    status === "running" ||
    status === "starting"
  );
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
  const apiBaseUrl = useApiServiceStore((state) => state.baseUrl);
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
    setSelectedModelPreservingForm,
    setFormValue,
    setFormValues,
    setFormFields,
    resetForm,
    runPrediction,
    runBatch,
    clearBatchResults,
    setUploading,
    reorderTab,
    consumePendingFormValues,
    removeGenerationHistoryItem,
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
  const preferRemoteGenerationHistory = !isOfficialWaveSpeedBaseUrl(apiBaseUrl);
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
        if (workspace === "3d")
          return id.includes("3d") || id.includes("tripo");
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
      const items = response.items || [];
      const refreshedItems = await Promise.all(
        items.map(async (item) => {
          if (!isPredictionRunningStatus(item.status)) return item;
          try {
            const refreshed = await apiClient.getPredictionDetails(item.id);
            return {
              ...item,
              ...refreshed,
              id: item.id,
              created_at: refreshed.created_at || item.created_at,
              inputs: item.inputs,
              input: item.input,
            };
          } catch {
            return item;
          }
        }),
      );
      setRemoteGenerationHistory(filterHistoryForWorkspace(refreshedItems));
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
  const [smartToggleOverrides, setSmartToggleOverrides] = useState<
    Record<string, Record<string, string>>
  >({});
  const pricingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pricingModelRef = useRef<string | null>(null);

  const activeSmartFamily = useMemo(() => {
    if (workspace === "audio") {
      return buildDynamicAudioSmartFamily(
        filteredModels,
        activeTab?.selectedModel,
      );
    }
    if (workspace === "3d") {
      return buildDynamic3DSmartFamily(
        filteredModels,
        activeTab?.selectedModel,
      );
    }
    const family = findFamilyByVariantId(activeTab?.selectedModel?.model_id);
    return canUseSmartFamilyForWorkspace(family?.category, workspace)
      ? family
      : undefined;
  }, [activeTab?.selectedModel, filteredModels, workspace]);

  const smartVariantModels = useMemo(() => {
    if (!activeSmartFamily) return [];
    return activeSmartFamily.variantIds
      .map((id) => filteredModels.find((model) => model.model_id === id))
      .filter((model): model is Model => Boolean(model));
  }, [activeSmartFamily, filteredModels]);

  const smartFilledFields = useMemo(
    () => getFilledFieldNames(activeTab?.formValues ?? {}),
    [activeTab?.formValues],
  );

  const smartToggleDefaults = useMemo(() => {
    if (!activeSmartFamily) return {};
    return Object.fromEntries(
      activeSmartFamily.toggles.map((toggle) => [toggle.key, toggle.default]),
    );
  }, [activeSmartFamily]);

  const activeSmartToggleValues = useMemo(() => {
    if (!activeSmartFamily) return {};
    return {
      ...smartToggleDefaults,
      ...(smartToggleOverrides[activeSmartFamily.id] ?? {}),
    };
  }, [activeSmartFamily, smartToggleDefaults, smartToggleOverrides]);

  const smartResolvedModel = useMemo(() => {
    if (!activeSmartFamily) return null;
    const resolvedVariantId = activeSmartFamily.resolveVariant(
      smartFilledFields,
      activeSmartToggleValues,
    );
    return findResolvedSmartModel(
      smartVariantModels,
      resolvedVariantId,
      activeSmartFamily.primaryVariant,
    );
  }, [
    activeSmartFamily,
    activeSmartToggleValues,
    smartFilledFields,
    smartVariantModels,
  ]);

  const currentPricingKey = useMemo(
    () =>
      JSON.stringify({
        modelId:
          smartResolvedModel?.model_id ??
          activeTab?.selectedModel?.model_id ??
          null,
        values: activeTab?.formValues ?? null,
        smart: activeSmartFamily ? (activeSmartToggleValues ?? null) : null,
      }),
    [
      activeSmartFamily,
      activeSmartToggleValues,
      activeTab?.selectedModel?.model_id,
      activeTab?.formValues,
      smartResolvedModel?.model_id,
    ],
  );

  const smartVisibleFields = useMemo(() => {
    if (!activeSmartFamily || smartVariantModels.length === 0) return undefined;
    if (activeSmartFamily.category === "3d" && smartResolvedModel) {
      return tune3DFields(
        extractModelFormFields(smartResolvedModel),
        activeSmartToggleValues.mode ??
          get3DModeDefinition(smartResolvedModel).value,
        smartResolvedModel.model_id,
      );
    }

    const mergedFields = mergeVariantFormFields(
      smartVariantModels,
      activeSmartFamily.primaryVariant,
    ).filter(
      (field) => !(activeSmartFamily.excludeFields ?? []).includes(field.name),
    );
    if (!smartResolvedModel) return mergedFields;

    const resolvedFields = extractModelFormFields(smartResolvedModel);
    const resolvedFieldMap = new Map(
      resolvedFields.map((field) => [field.name, field]),
    );
    const visibleFields: FormFieldConfig[] = [];
    const added = new Set<string>();

    for (const mergedField of mergedFields) {
      const resolvedField = resolvedFieldMap.get(mergedField.name);
      if (resolvedField) {
        visibleFields.push(resolvedField);
        added.add(resolvedField.name);
      } else if (isSmartTriggerField(mergedField, activeSmartFamily.category)) {
        visibleFields.push({ ...mergedField, required: false });
        added.add(mergedField.name);
      }
    }

    for (const resolvedField of resolvedFields) {
      if (added.has(resolvedField.name)) continue;
      visibleFields.push(resolvedField);
    }

    if (activeSmartFamily.id === "seedance-2.0") {
      return tuneSeedance20Fields(
        visibleFields,
        activeSmartToggleValues.mode ?? "generate",
      );
    }

    if (activeSmartFamily.id === "infinitetalk") {
      return tuneInfiniteTalkFields(
        visibleFields,
        activeSmartToggleValues.mode ?? "image",
      );
    }

    return visibleFields;
  }, [
    activeSmartFamily,
    activeSmartToggleValues.mode,
    smartResolvedModel,
    smartVariantModels,
  ]);

  const runModel = smartResolvedModel ?? activeTab?.selectedModel ?? null;

  const runFields = useMemo(() => {
    if (!activeTab) return [];
    return smartResolvedModel
      ? extractModelFormFields(smartResolvedModel)
      : activeTab.formFields;
  }, [activeTab, smartResolvedModel]);

  const runFormValues = useMemo(() => {
    if (!activeTab) return {};
    const mappedValues =
      activeSmartFamily?.mapValues && runModel
        ? activeSmartFamily.mapValues(activeTab.formValues, runModel.model_id)
        : activeTab.formValues;
    return filterValuesForFields(mappedValues, runFields);
  }, [activeSmartFamily, activeTab, runFields, runModel]);

  const buildRunPricingInput = useCallback(() => {
    if (!activeTab) return null;
    return buildNormalizedInput(
      { ...getDefaultValues(runFields), ...runFormValues },
      runFields,
    );
  }, [activeTab, runFields, runFormValues]);

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

  useEffect(() => {
    if (!activeSmartFamily || !activeTab?.selectedModel || !smartResolvedModel)
      return;
    if (activeTab.selectedModel.model_id === smartResolvedModel.model_id)
      return;
    setSelectedModelPreservingForm(smartResolvedModel);
  }, [
    activeSmartFamily,
    activeTab?.selectedModel,
    setSelectedModelPreservingForm,
    smartResolvedModel,
  ]);

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

    const selectedModel = runModel;
    if (!selectedModel) return;
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
        const price = await apiClient.calculatePricing(
          selectedModelId,
          buildNormalizedInput(
            { ...getDefaultValues(runFields), ...runFormValues },
            runFields,
          ),
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
    runFields,
    runFormValues,
    runModel,
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
    const selectedModel = filteredModels.find(
      (model) => model.model_id === modelId,
    );
    const dynamicFamily =
      workspace === "audio"
        ? buildDynamicAudioSmartFamily(filteredModels, selectedModel)
        : workspace === "3d"
          ? buildDynamic3DSmartFamily(filteredModels, selectedModel)
          : undefined;
    const family =
      workspace === "image" || workspace === "video" || workspace === "avatar"
        ? findFamilyByVariantId(modelId)
        : undefined;
    const targetModelId =
      dynamicFamily &&
      filteredModels.some(
        (model) => model.model_id === dynamicFamily.primaryVariant,
      )
        ? dynamicFamily.primaryVariant
        : canUseSmartFamilyForWorkspace(family?.category, workspace) &&
            filteredModels.some(
              (model) => model.model_id === family.primaryVariant,
            )
          ? family.primaryVariant
          : modelId;
    const model = filteredModels.find((m) => m.model_id === targetModelId);
    if (model) {
      if (activeTab) {
        setSelectedModel(model);
      } else {
        createTab(model, undefined, undefined, null, workspace);
      }
      navigate(`${routeBase}/${encodeURIComponent(targetModelId)}`, {
        replace: true,
      });
      if (rightPanelTab !== "result") {
        setRightPanelTab("result");
        sessionStorage.setItem("pg_rightPanelTab", "result");
      }
    }
  };

  const handleSmartToggleChange = useCallback(
    (key: string, value: string) => {
      if (!activeSmartFamily) return;
      const nextToggleValues = {
        ...activeSmartToggleValues,
        [key]: value,
      };
      const resolvedVariantId = activeSmartFamily.resolveVariant(
        smartFilledFields,
        nextToggleValues,
      );
      const resolvedModel = findResolvedSmartModel(
        smartVariantModels,
        resolvedVariantId,
        activeSmartFamily.primaryVariant,
      );

      setSmartToggleOverrides((prev) => ({
        ...prev,
        [activeSmartFamily.id]: {
          ...(prev[activeSmartFamily.id] ?? {}),
          [key]: value,
        },
      }));

      if (
        resolvedModel &&
        activeTab?.selectedModel?.model_id !== resolvedModel.model_id
      ) {
        setSelectedModelPreservingForm(resolvedModel);
        navigate(`${routeBase}/${encodeURIComponent(resolvedModel.model_id)}`, {
          replace: true,
        });
      }
    },
    [
      activeSmartFamily,
      activeSmartToggleValues,
      activeTab?.selectedModel?.model_id,
      navigate,
      routeBase,
      setSelectedModelPreservingForm,
      smartFilledFields,
      smartVariantModels,
    ],
  );

  // Bind activeTabId into the onChange callback so that async operations
  // (e.g. file uploads) update the correct tab even if the user switches tabs
  // while the upload is in progress.
  const handleFormValueChange = useCallback(
    (key: string, value: unknown) => {
      setFormValue(key, value, activeTabId ?? undefined);
    },
    [setFormValue, activeTabId],
  );

  const ensureSufficientBalanceForRun = useCallback(async () => {
    if (!activeTab?.selectedModel || !runModel) return false;
    const modelForRun = runModel;
    if (modelForRun.model_id !== activeTab.selectedModel.model_id) {
      setSelectedModelPreservingForm(modelForRun);
    }

    const pricingInput = buildRunPricingInput();
    if (!pricingInput) return false;

    const repeatCount =
      activeTab.batchConfig.enabled && activeTab.batchConfig.repeatCount > 1
        ? activeTab.batchConfig.repeatCount
        : 1;

    setIsPricingLoading(true);
    try {
      const price = await apiClient.calculatePricing(
        modelForRun.model_id,
        pricingInput,
      );
      const discountRate =
        price.discountRate ?? getModelDiscountRate(modelForRun);
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
  }, [
    activeTab,
    buildRunPricingInput,
    currentPricingKey,
    runModel,
    setSelectedModelPreservingForm,
  ]);

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
    const runOptions = {
      model: runModel,
      formFields: runFields,
      formValues: runFormValues,
    };
    if (batchConfig.enabled && batchConfig.repeatCount > 1) {
      await runBatch(runOptions);
    } else {
      await runPrediction(runOptions);
    }
    void fetchMyGenerations();
  }, [
    activeTab,
    ensureSufficientBalanceForRun,
    runFields,
    runFormValues,
    runModel,
    switchTab,
    runBatch,
    runPrediction,
    fetchMyGenerations,
  ]);

  const handleDeleteGeneration = useCallback(
    async (item: { id: string; source: "local" | "remote" }) => {
      try {
        if (item.source === "remote") {
          await apiClient.deletePrediction(item.id);
          setRemoteGenerationHistory((items) =>
            items.filter((historyItem) => historyItem.id !== item.id),
          );
        } else {
          removeGenerationHistoryItem(item.id);
        }
        toast({ title: "记录已删除" });
      } catch (error) {
        toast({
          title: "删除失败",
          description:
            error instanceof Error
              ? error.message
              : "删除记录失败，请稍后重试。",
          variant: "destructive",
        });
      }
    },
    [removeGenerationHistoryItem],
  );

  // Ctrl+Enter / Cmd+Enter to run; Ctrl+W / Cmd+W to close active tab
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (activeTab?.selectedModel) {
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
          navigate(
            `${routeBase}/${encodeURIComponent(template.playgroundData.modelId)}`,
            {
              replace: true,
            },
          );
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
                hideVariantSelector={
                  workspace === "image" ||
                  workspace === "video" ||
                  workspace === "avatar" ||
                  workspace === "audio" ||
                  workspace === "3d"
                }
                variant={
                  workspace === "video"
                    ? "video"
                    : workspace === "avatar"
                      ? "avatar"
                      : workspace === "audio"
                        ? "audio"
                        : workspace === "3d"
                          ? "3d"
                          : "default"
                }
              />
              {activeSmartFamily && activeSmartFamily.toggles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeSmartFamily.toggles.map((toggle) => (
                    <div
                      key={toggle.key}
                      className="flex overflow-hidden rounded-lg border border-white/[0.08] bg-[#141414]"
                    >
                      {toggle.options.map((option) => {
                        const isSelected =
                          activeSmartToggleValues[toggle.key] === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              handleSmartToggleChange(toggle.key, option.value)
                            }
                            className={cn(
                              "px-3 py-1.5 text-xs font-medium transition-colors",
                              isSelected
                                ? "bg-white/[0.12] text-white"
                                : "text-[#9ca3af] hover:bg-white/[0.04] hover:text-white",
                            )}
                          >
                            {t(
                              option.labelKey,
                              getSmartToggleFallback(
                                option.labelKey,
                                option.value,
                              ),
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Parameters */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
              {activeTab?.selectedModel ? (
                <DynamicForm
                  model={runModel ?? activeTab.selectedModel}
                  values={activeTab.formValues}
                  validationErrors={activeTab.validationErrors}
                  onChange={handleFormValueChange}
                  onSetDefaults={handleSetDefaults}
                  collapsible
                  onFieldsChange={setFormFields}
                  onUploadingChange={setUploading}
                  scrollable={false}
                  fieldsOverride={smartVisibleFields}
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
                    isUploading={(activeTab?.uploadingCount ?? 0) > 0}
                    onRun={handleRun}
                    runLabel={t("playground.run")}
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
                  disabled={!activeTab}
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
                        workspaceTabs.map((tab) => {
                          const tabTitle = tab.selectedModel
                            ? getWorkspaceModelName(
                                tab.selectedModel,
                                workspace,
                              )
                            : t("playground.tabs.newTab");
                          return (
                            <div
                              key={tab.id}
                              title={tab.selectedModel?.model_id || tabTitle}
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
                                  {tabTitle}
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
                          );
                        })
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
                    const tabTitle = tab.selectedModel
                      ? getWorkspaceModelName(tab.selectedModel, workspace)
                      : t("playground.tabs.newTab");
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
                        title={tab.selectedModel?.model_id || tabTitle}
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
                        <span className="truncate flex-1">{tabTitle}</span>
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
                  preferRemoteHistory={preferRemoteGenerationHistory}
                  onRefresh={fetchMyGenerations}
                  onShowExamples={() => switchTab("featured")}
                  onDelete={handleDeleteGeneration}
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
