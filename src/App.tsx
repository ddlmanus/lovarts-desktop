import { useEffect } from "react";
import { Navigate, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { ModelsPage } from "@/pages/ModelsPage";
import { TemplatesPage } from "@/pages/TemplatesPage";
import { PlaygroundPage } from "@/pages/PlaygroundPage";
import { ImageGeneratorPage } from "@/pages/ImageGeneratorPage";
import { VideoGeneratorPage } from "@/pages/VideoGeneratorPage";
import { AvatarGeneratorPage } from "@/pages/AvatarGeneratorPage";
import { AudioGeneratorPage } from "@/pages/AudioGeneratorPage";
import { ThreeDGeneratorPage } from "@/pages/ThreeDGeneratorPage";
// HistoryPage is rendered persistently in Layout
import { SettingsPage } from "@/pages/SettingsPage";
import { SmartPlaygroundPage } from "@/pages/SmartPlaygroundPage";
import { FreeToolsPage } from "@/pages/FreeToolsPage";
import { useApiKeyStore } from "@/stores/apiKeyStore";
import { useModelsStore } from "@/stores/modelsStore";
import { useThemeStore } from "@/stores/themeStore";
import i18n, { languages } from "@/i18n";

// Placeholder for persistent pages (rendered in Layout, not via router)
const PersistentPagePlaceholder = () => null;

function App() {
  const { loadApiKey, isValidated } = useApiKeyStore();
  const { fetchModels } = useModelsStore();
  const { initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
    loadApiKey();
  }, [initTheme, loadApiKey]);

  useEffect(() => {
    const syncLanguageFromSettings = async () => {
      if (!window.electronAPI?.getSettings) return;
      const settings = await window.electronAPI.getSettings();
      const storedLanguage = settings.language;
      if (!storedLanguage) return;

      localStorage.setItem("wavespeed_language", storedLanguage);
      if (storedLanguage === "auto") return;

      const supportedLangs = languages
        .map((lang) => lang.code)
        .filter((code) => code !== "auto");
      if (!supportedLangs.includes(storedLanguage)) return;

      if (i18n.language !== storedLanguage) {
        await i18n.changeLanguage(storedLanguage);
      }
    };

    syncLanguageFromSettings();
  }, []);

  useEffect(() => {
    if (isValidated) {
      fetchModels();
    }
  }, [isValidated, fetchModels]);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<ModelsPage />} />
        <Route
          path="featured-models/:familyId"
          element={<SmartPlaygroundPage />}
        />
        <Route path="models" element={<ModelsPage />} />
        <Route path="playground" element={<PlaygroundPage />} />
        <Route path="playground/*" element={<PlaygroundPage />} />
        <Route path="image" element={<ImageGeneratorPage />} />
        <Route path="image/*" element={<ImageGeneratorPage />} />
        <Route path="xiaohongshu" element={<PersistentPagePlaceholder />} />
        <Route path="video" element={<VideoGeneratorPage />} />
        <Route path="video/*" element={<VideoGeneratorPage />} />
        <Route path="avatar" element={<AvatarGeneratorPage />} />
        <Route path="avatar/*" element={<AvatarGeneratorPage />} />
        <Route path="audio" element={<AudioGeneratorPage />} />
        <Route path="audio/*" element={<AudioGeneratorPage />} />
        <Route path="3d" element={<ThreeDGeneratorPage />} />
        <Route path="3d/*" element={<ThreeDGeneratorPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="history" element={<PersistentPagePlaceholder />} />
        <Route path="assets" element={<Navigate to="/history" replace />} />
        <Route path="z-image" element={<PersistentPagePlaceholder />} />
        <Route path="free-tools" element={<FreeToolsPage />} />
        {/* Workflow page - persistent rendered */}
        <Route path="workflow" element={<PersistentPagePlaceholder />} />
        {/* Free tools pages are rendered persistently in Layout */}
        <Route
          path="free-tools/video-enhancer"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/video-watermark-remover"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/video-eraser"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/video-fps-increaser"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/image-enhancer"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/image-colorizer"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/image-watermark-remover"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/background-remover"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/image-eraser"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/face-enhancer"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/face-swapper"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/segment-anything"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/video-converter"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/audio-converter"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/image-converter"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/media-trimmer"
          element={<PersistentPagePlaceholder />}
        />
        <Route
          path="free-tools/media-merger"
          element={<PersistentPagePlaceholder />}
        />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
