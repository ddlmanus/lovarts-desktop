export interface SmartFormToggle {
  key: string;
  labelKey: string;
  options: { value: string; labelKey: string }[];
  default: string;
}

export interface SmartFormFamily {
  id: string;
  name: string;
  provider: string;
  poster: string;
  category: "image" | "video" | "audio" | "3d" | "other";
  variantIds: string[];
  primaryVariant: string;
  toggles: SmartFormToggle[];
  resolveVariant: (
    filledFields: Set<string>,
    toggleValues: Record<string, string>,
  ) => string;
  mapValues?: (
    values: Record<string, unknown>,
    resolvedVariantId: string,
  ) => Record<string, unknown>;
  excludeFields?: string[];
}

export const IMAGE_FIELD_NAMES = [
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
];

export const VIDEO_FIELD_NAMES = [
  "video",
  "videos",
  "video_url",
  "video_urls",
  "input_video",
  "input_videos",
  "input_video_url",
  "input_video_urls",
  "reference_video",
  "reference_videos",
  "reference_video_url",
  "reference_video_urls",
];

export const AUDIO_FIELD_NAMES = [
  "audio",
  "audios",
  "audio_url",
  "audio_urls",
  "input_audio",
  "input_audios",
  "input_audio_url",
  "input_audio_urls",
  "reference_audio",
  "reference_audios",
  "reference_audio_url",
  "reference_audio_urls",
];

// Helper to check if any file-like field is filled
function hasFileField(filledFields: Set<string>, ...names: string[]): boolean {
  return names.some((n) => filledFields.has(n));
}

function hasImageFilled(filledFields: Set<string>): boolean {
  return hasFileField(filledFields, ...IMAGE_FIELD_NAMES);
}

function hasVideoFilled(filledFields: Set<string>): boolean {
  return hasFileField(filledFields, ...VIDEO_FIELD_NAMES);
}

function hasAudioFilled(filledFields: Set<string>): boolean {
  return hasFileField(filledFields, ...AUDIO_FIELD_NAMES);
}

function hasLorasFilled(filledFields: Set<string>): boolean {
  for (const name of filledFields) {
    if (name.toLowerCase().includes("lora")) return true;
  }
  return false;
}

export const SMART_FORM_FAMILIES: SmartFormFamily[] = [
  {
    id: "qwen3-tts",
    name: "Qwen3 TTS",
    provider: "wavespeed-ai",
    poster:
      "https://static.wavespeed.ai/media/images/1763649945119973876_WvMIEAxu.jpg",
    category: "audio",
    variantIds: [
      "wavespeed-ai/qwen3-tts/text-to-speech",
      "wavespeed-ai/qwen3-tts/voice-clone",
      "wavespeed-ai/qwen3-tts/voice-design",
      "wavespeed-ai/qwen3-tts",
      "qwen3-tts/text-to-speech",
      "qwen3-tts/voice-clone",
      "qwen3-tts/voice-design",
    ],
    primaryVariant: "wavespeed-ai/qwen3-tts/text-to-speech",
    toggles: [
      {
        key: "mode",
        labelKey: "smartPlayground.toggleMode",
        options: [
          {
            value: "text",
            labelKey: "smartPlayground.modeTextToSpeech",
          },
          {
            value: "clone",
            labelKey: "smartPlayground.modeVoiceClone",
          },
          {
            value: "design",
            labelKey: "smartPlayground.modeVoiceDesign",
          },
        ],
        default: "text",
      },
    ],
    resolveVariant(filledFields, toggleValues) {
      if (toggleValues.mode === "design") {
        return "wavespeed-ai/qwen3-tts/voice-design";
      }
      if (toggleValues.mode === "clone" || hasAudioFilled(filledFields)) {
        return "wavespeed-ai/qwen3-tts/voice-clone";
      }
      return "wavespeed-ai/qwen3-tts/text-to-speech";
    },
  },

  {
    id: "gpt-image-2",
    name: "GPT Image 2",
    provider: "openai",
    poster:
      "https://static.wavespeed.ai/media/images/1763649945119973876_WvMIEAxu.jpg",
    category: "image",
    variantIds: [
      "openai/gpt-image-2/text-to-image",
      "openai/gpt-image-2",
      "openai/gpt-image-2/edit",
    ],
    primaryVariant: "openai/gpt-image-2/text-to-image",
    toggles: [],
    resolveVariant(filledFields) {
      return hasImageFilled(filledFields)
        ? "openai/gpt-image-2/edit"
        : "openai/gpt-image-2/text-to-image";
    },
  },

  {
    id: "seedance-2.0",
    name: "Seedance 2.0",
    provider: "bytedance",
    poster:
      "https://static.wavespeed.ai/media/images/1766494048998434655_qEMLsAI0.png",
    category: "video",
    variantIds: [
      "bytedance/seedance-2.0/text-to-video",
      "bytedance/seedance-2.0/image-to-video",
      "bytedance/seedance-2.0/video-edit",
      "bytedance/seedance-2.0/text-to-video-turbo",
      "bytedance/seedance-2.0/image-to-video-turbo",
      "bytedance/seedance-2.0/video-edit-turbo",
      "bytedance/seedance-2.0-fast/text-to-video",
      "bytedance/seedance-2.0-fast/image-to-video",
      "bytedance/seedance-2.0-fast/video-edit",
      "bytedance/seedance-2.0-fast/text-to-video-turbo",
      "bytedance/seedance-2.0-fast/image-to-video-turbo",
      "bytedance/seedance-2.0-fast/video-edit-turbo",
      "bytedance/seedance-v2.0/text-to-video",
      "bytedance/seedance-v2.0/image-to-video",
      "bytedance/seedance-v2.0/video-edit",
      "bytedance/seedance-v2/text-to-video",
      "bytedance/seedance-v2/image-to-video",
      "bytedance/seedance-v2/video-edit",
    ],
    primaryVariant: "bytedance/seedance-2.0/text-to-video",
    toggles: [
      {
        key: "mode",
        labelKey: "smartPlayground.toggleMode",
        options: [
          {
            value: "image",
            labelKey: "smartPlayground.modeImageToVideo",
          },
          {
            value: "video",
            labelKey: "smartPlayground.modeVideoToVideo",
          },
        ],
        default: "image",
      },
      {
        key: "speed",
        labelKey: "smartPlayground.toggleSpeed",
        options: [
          { value: "normal", labelKey: "smartPlayground.qualityStd" },
          { value: "fast", labelKey: "smartPlayground.speedFast" },
        ],
        default: "normal",
      },
      {
        key: "mode",
        labelKey: "smartPlayground.toggleMode",
        options: [
          { value: "generate", labelKey: "smartPlayground.modeGenerate" },
          { value: "edit", labelKey: "smartPlayground.modeEdit" },
        ],
        default: "generate",
      },
    ],
    resolveVariant(filledFields, toggleValues) {
      const hasImage = hasImageFilled(filledFields);
      const isEdit = toggleValues.mode === "edit";
      const isFast = toggleValues.speed === "fast";
      const base = isFast
        ? "bytedance/seedance-2.0-fast"
        : "bytedance/seedance-2.0";
      if (isEdit || hasVideoFilled(filledFields)) {
        return `${base}/video-edit`;
      }
      if (hasImage) {
        return `${base}/image-to-video`;
      }
      return `${base}/text-to-video`;
    },
  },

  // 1. Seedream 4.5
  {
    id: "seedream-4.5",
    name: "Seedream 4.5",
    provider: "bytedance",
    poster:
      "https://static.wavespeed.ai/media/images/1764761216479761378_Yy864da9.png",
    category: "image",
    variantIds: [
      "bytedance/seedream-v4.5",
      "bytedance/seedream-v4.5/sequential",
      "bytedance/seedream-v4.5/edit",
      "bytedance/seedream-v4.5/edit-sequential",
    ],
    primaryVariant: "bytedance/seedream-v4.5",
    toggles: [
      {
        key: "mode",
        labelKey: "smartPlayground.toggleMode",
        options: [
          { value: "normal", labelKey: "smartPlayground.modeNormal" },
          { value: "sequential", labelKey: "smartPlayground.modeSequential" },
        ],
        default: "normal",
      },
    ],
    resolveVariant(filledFields, toggleValues) {
      const hasImage = hasImageFilled(filledFields);
      const isSequential = toggleValues.mode === "sequential";
      if (hasImage && isSequential)
        return "bytedance/seedream-v4.5/edit-sequential";
      if (hasImage) return "bytedance/seedream-v4.5/edit";
      if (isSequential) return "bytedance/seedream-v4.5/sequential";
      return "bytedance/seedream-v4.5";
    },
  },

  // 2. Seedance 1.5 Pro
  {
    id: "seedance-1.5-pro",
    name: "Seedance 1.5 Pro",
    provider: "bytedance",
    poster:
      "https://static.wavespeed.ai/media/images/1766494048998434655_qEMLsAI0.png",
    category: "video",
    variantIds: [
      "bytedance/seedance-v1.5-pro/image-to-video",
      "bytedance/seedance-v1.5-pro/image-to-video-fast",
      "bytedance/seedance-v1.5-pro/text-to-video",
      "bytedance/seedance-v1.5-pro/text-to-video-fast",
      "bytedance/seedance-v1.5-pro/video-extend",
      "bytedance/seedance-v1.5-pro/video-extend-fast",
    ],
    primaryVariant: "bytedance/seedance-v1.5-pro/image-to-video",
    toggles: [
      {
        key: "speed",
        labelKey: "smartPlayground.toggleSpeed",
        options: [
          { value: "normal", labelKey: "smartPlayground.speedNormal" },
          { value: "fast", labelKey: "smartPlayground.speedFast" },
        ],
        default: "normal",
      },
    ],
    resolveVariant(filledFields, toggleValues) {
      const hasVideo = hasVideoFilled(filledFields);
      const hasImage = hasImageFilled(filledFields);
      const isFast = toggleValues.speed === "fast";
      if (hasVideo)
        return isFast
          ? "bytedance/seedance-v1.5-pro/video-extend-fast"
          : "bytedance/seedance-v1.5-pro/video-extend";
      if (hasImage)
        return isFast
          ? "bytedance/seedance-v1.5-pro/image-to-video-fast"
          : "bytedance/seedance-v1.5-pro/image-to-video";
      return isFast
        ? "bytedance/seedance-v1.5-pro/text-to-video-fast"
        : "bytedance/seedance-v1.5-pro/text-to-video";
    },
  },

  // 3. Wan Spicy
  {
    id: "wan-spicy",
    name: "Wan Spicy",
    provider: "wavespeed-ai",
    poster:
      "https://static.wavespeed.ai/media/images/1766298334453523753_f975da96.png",
    category: "video",
    variantIds: [
      "wavespeed-ai/wan-2.2-spicy/image-to-video",
      "wavespeed-ai/wan-2.2-spicy/image-to-video-lora",
      "wavespeed-ai/wan-2.2-spicy/video-extend",
      "wavespeed-ai/wan-2.2-spicy/video-extend-lora",
    ],
    primaryVariant: "wavespeed-ai/wan-2.2-spicy/image-to-video",
    toggles: [],
    resolveVariant(filledFields) {
      const hasVideo = hasVideoFilled(filledFields);
      const hasAudio = hasAudioFilled(filledFields);
      const hasLoras = hasLorasFilled(filledFields);
      if (hasVideo && hasLoras)
        return "wavespeed-ai/wan-2.2-spicy/video-extend-lora";
      if (hasVideo) return "wavespeed-ai/wan-2.2-spicy/video-extend";
      if (hasAudio) return "wavespeed-ai/wan-2.2-spicy/image-to-video";
      if (hasLoras) return "wavespeed-ai/wan-2.2-spicy/image-to-video-lora";
      return "wavespeed-ai/wan-2.2-spicy/image-to-video";
    },
  },

  // 4. Wan Animate
  {
    id: "wan-animate",
    name: "Wan Animate",
    provider: "wavespeed-ai",
    poster:
      "https://static.wavespeed.ai/media/images/1758433474532574441_SkTQLIEA.jpeg",
    category: "other",
    variantIds: ["wavespeed-ai/wan-2.2/animate"],
    primaryVariant: "wavespeed-ai/wan-2.2/animate",
    toggles: [],
    resolveVariant() {
      return "wavespeed-ai/wan-2.2/animate";
    },
  },

  // 5. InfiniteTalk
  {
    id: "infinitetalk",
    name: "InfiniteTalk",
    excludeFields: ["audio"],
    provider: "wavespeed-ai",
    poster:
      "https://static.wavespeed.ai/media/images/1766575571686877852_Sckigeck.png",
    category: "other",
    variantIds: [
      "wavespeed-ai/infinitetalk",
      "wavespeed-ai/infinitetalk/multi",
      "wavespeed-ai/infinitetalk/video-to-video",
      "wavespeed-ai/infinitetalk-fast",
      "wavespeed-ai/infinitetalk-fast/multi",
      "wavespeed-ai/infinitetalk-fast/video-to-video",
    ],
    primaryVariant: "wavespeed-ai/infinitetalk",
    toggles: [
      {
        key: "mode",
        labelKey: "smartPlayground.toggleMode",
        options: [
          {
            value: "image",
            labelKey: "smartPlayground.modeImageToVideo",
          },
          {
            value: "video",
            labelKey: "smartPlayground.modeVideoToVideo",
          },
        ],
        default: "image",
      },
      {
        key: "speed",
        labelKey: "smartPlayground.toggleSpeed",
        options: [
          { value: "normal", labelKey: "smartPlayground.speedNormal" },
          { value: "fast", labelKey: "smartPlayground.speedFast" },
        ],
        default: "normal",
      },
    ],
    resolveVariant(filledFields, toggleValues) {
      const hasVideo = hasVideoFilled(filledFields);
      const isVideoMode = toggleValues.mode === "video";
      const isFast = toggleValues.speed === "fast";
      const hasLeftAudio = filledFields.has("left_audio");
      const hasRightAudio = filledFields.has("right_audio");
      const hasBothAudios = hasLeftAudio && hasRightAudio;

      if (isVideoMode || hasVideo)
        return isFast
          ? "wavespeed-ai/infinitetalk-fast/video-to-video"
          : "wavespeed-ai/infinitetalk/video-to-video";
      if (hasBothAudios)
        return isFast
          ? "wavespeed-ai/infinitetalk-fast/multi"
          : "wavespeed-ai/infinitetalk/multi";
      return isFast
        ? "wavespeed-ai/infinitetalk-fast"
        : "wavespeed-ai/infinitetalk";
    },
    mapValues(values, resolvedVariantId) {
      // For single variant: map left_audio/right_audio → audio
      if (
        resolvedVariantId.includes("/multi") ||
        resolvedVariantId.includes("/video-to-video")
      )
        return values;
      const mapped = { ...values };
      if (!mapped.audio) {
        if (mapped.left_audio) mapped.audio = mapped.left_audio;
        else if (mapped.right_audio) mapped.audio = mapped.right_audio;
      }
      delete mapped.left_audio;
      delete mapped.right_audio;
      return mapped;
    },
  },

  // 6. Kling 2.6 Motion Control
  {
    id: "kling-2.6-motion-control",
    name: "Kling 2.6 Motion Control",
    provider: "kwaivgi",
    poster:
      "https://static.wavespeed.ai/media/images/1766519115490596160_Smusqomu.png",
    category: "other",
    variantIds: [
      "kwaivgi/kling-v2.6-pro/motion-control",
      "kwaivgi/kling-v2.6-std/motion-control",
    ],
    primaryVariant: "kwaivgi/kling-v2.6-pro/motion-control",
    toggles: [
      {
        key: "quality",
        labelKey: "smartPlayground.toggleQuality",
        options: [
          { value: "pro", labelKey: "smartPlayground.qualityPro" },
          { value: "std", labelKey: "smartPlayground.qualityStd" },
        ],
        default: "pro",
      },
    ],
    resolveVariant(_filledFields, toggleValues) {
      return toggleValues.quality === "std"
        ? "kwaivgi/kling-v2.6-std/motion-control"
        : "kwaivgi/kling-v2.6-pro/motion-control";
    },
  },

  // 7. Nano Banana Pro
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    provider: "google",
    poster:
      "https://static.wavespeed.ai/media/images/1763649945119973876_WvMIEAxu.jpg",
    category: "image",
    variantIds: [
      "google/nano-banana-pro/text-to-image",
      "google/nano-banana-pro/text-to-image-ultra",
      "google/nano-banana-pro/text-to-image-multi",
      "google/nano-banana-pro/edit",
      "google/nano-banana-pro/edit-ultra",
      "google/nano-banana-pro/edit-multi",
    ],
    primaryVariant: "google/nano-banana-pro/text-to-image",
    toggles: [
      {
        key: "quality",
        labelKey: "smartPlayground.toggleQuality",
        options: [
          { value: "standard", labelKey: "smartPlayground.qualityStd" },
          { value: "ultra", labelKey: "smartPlayground.qualityUltra" },
          { value: "multi", labelKey: "smartPlayground.qualityMulti" },
        ],
        default: "standard",
      },
    ],
    resolveVariant(filledFields, toggleValues) {
      const hasImage = hasImageFilled(filledFields);
      const quality = toggleValues.quality || "standard";
      if (hasImage) {
        if (quality === "ultra") return "google/nano-banana-pro/edit-ultra";
        if (quality === "multi") return "google/nano-banana-pro/edit-multi";
        return "google/nano-banana-pro/edit";
      }
      if (quality === "ultra")
        return "google/nano-banana-pro/text-to-image-ultra";
      if (quality === "multi")
        return "google/nano-banana-pro/text-to-image-multi";
      return "google/nano-banana-pro/text-to-image";
    },
  },
];

export function findFamilyById(id: string): SmartFormFamily | undefined {
  return SMART_FORM_FAMILIES.find((f) => f.id === id);
}

export function findFamilyByVariantId(
  modelId: string | undefined | null,
): SmartFormFamily | undefined {
  if (!modelId) return undefined;
  return SMART_FORM_FAMILIES.find((f) => f.variantIds.includes(modelId));
}

export function getFilledFieldNames(
  values: Record<string, unknown>,
): Set<string> {
  const filled = new Set<string>();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    filled.add(key);
  }
  return filled;
}
