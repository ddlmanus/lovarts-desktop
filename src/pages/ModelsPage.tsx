import { useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApiKeyStore } from "@/stores/apiKeyStore";
import { useModelsStore } from "@/stores/modelsStore";
import {
  getModelWorkspace,
  getWorkspaceRoute,
  usePlaygroundStore,
} from "@/stores/playgroundStore";
import { ExplorePanel } from "@/components/playground/ExplorePanel";
import { Layers } from "lucide-react";

type ModelKind = "avatar" | "audio" | "3d";

function parseModelKind(kind: string | null): ModelKind | null {
  return kind === "avatar" || kind === "audio" || kind === "3d" ? kind : null;
}

export function ModelsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { apiKey, hasAttemptedLoad } = useApiKeyStore();
  const { models, isLoading, fetchModels } = useModelsStore();
  const setSelectedType = useModelsStore((s) => s.setSelectedType);
  const { createTab } = usePlaygroundStore();
  const modelKind = parseModelKind(searchParams.get("kind"));

  useEffect(() => {
    if (modelKind) setSelectedType(null);
  }, [modelKind, setSelectedType]);

  useEffect(() => {
    if (!hasAttemptedLoad || !apiKey || isLoading || models.length > 0) return;
    fetchModels(true);
  }, [apiKey, fetchModels, hasAttemptedLoad, isLoading, models.length]);

  const handleSelectModel = useCallback(
    (modelId: string) => {
      const model = models.find((m) => m.model_id === modelId);
      if (model) {
        const workspace = getModelWorkspace(model);
        createTab(model, undefined, undefined, null, workspace);
        navigate(getWorkspaceRoute(workspace, modelId));
      }
    },
    [models, createTab, navigate],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page Title */}
      <div className="px-4 md:px-6 py-4 pt-14 md:pt-4 border-b border-border shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          {modelKind === "avatar"
            ? "数字人模型"
            : modelKind === "audio"
              ? "音频模型"
              : modelKind === "3d"
                ? "3D 模型"
                : t("playground.rightPanel.models", "All Models")}
        </h1>
      </div>
      {/* ExplorePanel fills the rest */}
      <div
        className="flex-1 overflow-hidden animate-in fade-in duration-300 fill-mode-both"
        style={{ animationDelay: "100ms" }}
      >
        <ExplorePanel onSelectModel={handleSelectModel} modelKind={modelKind} />
      </div>
    </div>
  );
}
