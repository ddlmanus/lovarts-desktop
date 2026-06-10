import { create } from "zustand";
import { persistentStorage } from "@/lib/storage";
import type { HistoryItem } from "@/types/prediction";
import type {
  XiaohongshuAspectRatio,
  XiaohongshuPageType,
} from "@/lib/xiaohongshuGenerator";

const STORAGE_KEY = "wavespeed_xiaohongshu_generation_history_v1";
const MAX_TASKS = 300;

export interface XiaohongshuGenerationTask {
  id: string;
  recordId?: string;
  topic: string;
  pageIndex: number;
  pageType: XiaohongshuPageType;
  pageContent: string;
  aspectRatio: XiaohongshuAspectRatio;
  imageModelId: string;
  referenceCount: number;
  status: "processing" | "completed" | "failed";
  url?: string;
  prompt?: string;
  error?: string;
  model?: string;
  provider?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface PersistedXiaohongshuHistory {
  version: 1;
  tasks: XiaohongshuGenerationTask[];
}

interface XiaohongshuHistoryState {
  tasks: XiaohongshuGenerationTask[];
  startTask: (
    task: Omit<
      XiaohongshuGenerationTask,
      "id" | "status" | "createdAt" | "updatedAt"
    > & { id?: string },
  ) => string;
  completeTask: (
    id: string,
    patch: Partial<
      Pick<
        XiaohongshuGenerationTask,
        "url" | "prompt" | "model" | "provider" | "recordId"
      >
    >,
  ) => void;
  failTask: (id: string, error: string) => void;
  deleteTask: (id: string) => void;
  clear: () => void;
}

function parsePersisted(value: unknown): XiaohongshuGenerationTask[] {
  if (!value || typeof value !== "object") return [];
  const tasks = (value as Partial<PersistedXiaohongshuHistory>).tasks;
  if (!Array.isArray(tasks)) return [];
  return tasks
    .map((task) => {
      const pageType: XiaohongshuPageType =
        task?.pageType === "cover" || task?.pageType === "summary"
          ? task.pageType
          : "content";
      const aspectRatio: XiaohongshuAspectRatio =
        task?.aspectRatio === "1:1" ? "1:1" : "3:4";
      const status: XiaohongshuGenerationTask["status"] =
        task?.status === "completed" || task?.status === "failed"
          ? task.status
          : "processing";
      return {
        ...task,
        id: String(task?.id || "").trim(),
        topic: String(task?.topic || "").trim(),
        pageIndex: Number.isFinite(Number(task?.pageIndex))
          ? Number(task.pageIndex)
          : 0,
        pageType,
        pageContent: String(task?.pageContent || ""),
        aspectRatio,
        imageModelId: String(task?.imageModelId || "").trim(),
        referenceCount: Number(task?.referenceCount || 0),
        status,
        url: String(task?.url || "").trim() || undefined,
        prompt: String(task?.prompt || "").trim() || undefined,
        error: String(task?.error || "").trim() || undefined,
        model: String(task?.model || "").trim() || undefined,
        provider: String(task?.provider || "").trim() || undefined,
        recordId: String(task?.recordId || "").trim() || undefined,
        createdAt: String(task?.createdAt || new Date().toISOString()),
        updatedAt: String(
          task?.updatedAt || task?.createdAt || new Date().toISOString(),
        ),
        completedAt: String(task?.completedAt || "").trim() || undefined,
      } satisfies XiaohongshuGenerationTask;
    })
    .filter((task) => task.id)
    .slice(0, MAX_TASKS);
}

function persist(tasks: XiaohongshuGenerationTask[]) {
  void persistentStorage.set(STORAGE_KEY, {
    version: 1,
    tasks: tasks.slice(0, MAX_TASKS),
  } satisfies PersistedXiaohongshuHistory);
}

function createTaskId(pageIndex: number) {
  return `xhs-${Date.now()}-${pageIndex + 1}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

const initialTasks = parsePersisted(persistentStorage.getSync(STORAGE_KEY));

export function xiaohongshuTaskToHistoryItem(
  task: XiaohongshuGenerationTask,
): HistoryItem {
  return {
    id: task.id,
    model: task.model || task.imageModelId || "xiaohongshu",
    status: task.status,
    outputs: task.url ? [task.url] : [],
    created_at: task.createdAt,
    execution_time:
      task.completedAt && task.createdAt
        ? Math.max(
            0,
            new Date(task.completedAt).getTime() -
              new Date(task.createdAt).getTime(),
          )
        : undefined,
    inputs: {
      source: "xiaohongshu",
      topic: task.topic,
      page: task.pageIndex + 1,
      pageType: task.pageType,
      aspectRatio: task.aspectRatio,
      prompt: task.prompt,
      content: task.pageContent,
    },
  };
}

export const useXiaohongshuHistoryStore = create<XiaohongshuHistoryState>(
  (set) => ({
    tasks: initialTasks,

    startTask: (task) => {
      const now = new Date().toISOString();
      const id = task.id || createTaskId(task.pageIndex);
      set((state) => {
        const next: XiaohongshuGenerationTask[] = [
          {
            ...task,
            id,
            status: "processing" as const,
            createdAt: now,
            updatedAt: now,
          },
          ...state.tasks.filter((item) => item.id !== id),
        ].slice(0, MAX_TASKS);
        persist(next);
        return { tasks: next };
      });
      return id;
    },

    completeTask: (id, patch) => {
      const now = new Date().toISOString();
      set((state) => {
        const next = state.tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                ...patch,
                status: "completed" as const,
                error: "",
                updatedAt: now,
                completedAt: now,
              }
            : task,
        );
        persist(next);
        return { tasks: next };
      });
    },

    failTask: (id, error) => {
      const now = new Date().toISOString();
      set((state) => {
        const next = state.tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                status: "failed" as const,
                error,
                updatedAt: now,
                completedAt: now,
              }
            : task,
        );
        persist(next);
        return { tasks: next };
      });
    },

    deleteTask: (id) => {
      set((state) => {
        const next = state.tasks.filter((task) => task.id !== id);
        persist(next);
        return { tasks: next };
      });
    },

    clear: () => {
      persist([]);
      set({ tasks: [] });
    },
  }),
);
