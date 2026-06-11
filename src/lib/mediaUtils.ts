export function isUrl(str: string): boolean {
  return (
    str.startsWith("http://") ||
    str.startsWith("https://") ||
    str.startsWith("local-asset://")
  );
}

export function extractOutputUrl(output: unknown): string | null {
  if (typeof output === "string") return output.trim() || null;
  if (!output || typeof output !== "object") return null;

  const record = output as Record<string, unknown>;
  const directOutputKeys = [
    "url",
    "download_url",
    "file_url",
    "image_url",
    "video_url",
    "audio_url",
    "output_url",
    "output",
    "image",
    "video",
    "audio",
    "file",
  ];
  const modelOutputKeys = [
    "model_url",
    "modelUrl",
    "model_file",
    "modelFile",
    "glb_url",
    "gltf_url",
    "mesh_url",
    "pbr_model",
    "base_model",
    "glb",
    "gltf",
    "model",
  ];

  for (const key of directOutputKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nested = extractOutputUrl(value);
      if (nested) return nested;
    }
  }

  for (const key of modelOutputKeys) {
    const value = record[key];
    if (typeof value === "string" && looksLikeFileReference(value)) {
      return value.trim();
    }
    if (value && typeof value === "object") {
      const nested = extractOutputUrl(value);
      if (nested) return nested;
    }
  }

  return null;
}

function looksLikeFileReference(value: string): boolean {
  const str = value.trim();
  return isUrl(str) || /\.(?:glb|gltf)(?:[?#].*)?$/i.test(str);
}

export function getUrlExtension(url: string): string | null {
  try {
    // For custom protocols like local-asset://, new URL() misparses the path as hostname.
    // Decode and use regex fallback for these.
    if (/^local-asset:\/\//i.test(url)) {
      const decoded = decodeURIComponent(url);
      const match = decoded.match(/\.([a-z0-9]+)(?:\?.*)?$/i);
      return match ? match[1].toLowerCase() : null;
    }
    // Parse URL and get pathname (ignoring query params)
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    // Get the last segment and extract extension
    const lastSegment = pathname.split("/").pop() || "";
    const match = lastSegment.match(/\.([a-z0-9]+)$/);
    return match ? match[1] : null;
  } catch {
    // Fallback for invalid URLs
    const match = url.match(/\.([a-z0-9]+)(?:\?.*)?$/i);
    return match ? match[1].toLowerCase() : null;
  }
}

export function isImageUrl(url: string): boolean {
  if (!isUrl(url)) return false;
  const ext = getUrlExtension(url);
  return (
    ext !== null &&
    ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"].includes(ext)
  );
}

export function isVideoUrl(url: string): boolean {
  if (!isUrl(url)) return false;
  const ext = getUrlExtension(url);
  return (
    ext !== null &&
    ["mp4", "webm", "mov", "avi", "mkv", "ogv", "m4v"].includes(ext)
  );
}

export function isAudioUrl(url: string): boolean {
  if (!isUrl(url)) return false;
  const ext = getUrlExtension(url);
  return (
    ext !== null &&
    ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus"].includes(ext)
  );
}

export function is3DUrl(url: string): boolean {
  if (!isUrl(url)) return false;
  const ext = getUrlExtension(url);
  return ext !== null && ["glb", "gltf"].includes(ext);
}
