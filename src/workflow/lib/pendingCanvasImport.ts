export type CanvasImportMediaType = "image" | "video" | "audio" | "file";

export interface PendingCanvasImport {
  id: string;
  url: string;
  mediaType: CanvasImportMediaType;
  fileName?: string;
  label?: string;
  source?: "generation";
}

const STORAGE_KEY = "lovartsPendingCanvasImports";
export const CANVAS_IMPORT_EVENT = "lovarts:canvas-import";

function createImportId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readQueue(): PendingCanvasImport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is PendingCanvasImport =>
            item &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.url === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function writeQueue(items: PendingCanvasImport[]) {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Session storage is best-effort only.
  }
}

export function queueCanvasImport(
  item: Omit<PendingCanvasImport, "id"> & { id?: string },
) {
  const next: PendingCanvasImport = {
    ...item,
    id: item.id || createImportId(),
  };
  writeQueue([...readQueue(), next]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CANVAS_IMPORT_EVENT));
  }
  return next;
}

export function consumeCanvasImports() {
  const items = readQueue();
  writeQueue([]);
  return items;
}
