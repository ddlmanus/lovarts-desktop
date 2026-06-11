import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Model3DViewerProps {
  src: string;
  className?: string;
  rounded?: boolean;
  onClick?: () => void;
}

export function Model3DViewer({
  src,
  className,
  rounded = true,
  onClick,
}: Model3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    import("@google/model-viewer").catch(() => {
      setStatus("error");
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setStatus("loading");
    setProgress(0);

    const el = document.createElement("model-viewer") as HTMLElement;
    el.setAttribute("src", src);
    el.setAttribute("camera-controls", "");
    el.setAttribute("auto-rotate", "");
    el.setAttribute("shadow-intensity", "1");
    el.setAttribute("environment-image", "neutral");
    el.setAttribute("touch-action", "pan-y");
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.display = "block";
    el.style.opacity = "0";
    el.style.transition = "opacity 180ms ease";
    el.style.background =
      "radial-gradient(circle at 50% 20%, #2b2b31 0%, #151515 48%, #050505 100%)";
    if (rounded) el.style.borderRadius = "inherit";

    const handleLoad = () => {
      el.style.opacity = "1";
      setProgress(1);
      setStatus("ready");
    };
    const handleError = () => setStatus("error");
    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ totalProgress?: number }>).detail;
      const totalProgress =
        typeof detail?.totalProgress === "number" ? detail.totalProgress : 0;
      setProgress(Math.max(0, Math.min(1, totalProgress)));
    };

    el.addEventListener("load", handleLoad);
    el.addEventListener("error", handleError);
    el.addEventListener("progress", handleProgress);

    container.innerHTML = "";
    container.appendChild(el);

    return () => {
      el.removeEventListener("load", handleLoad);
      el.removeEventListener("error", handleError);
      el.removeEventListener("progress", handleProgress);
      container.innerHTML = "";
    };
  }, [rounded, src]);

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-[#050505]",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <div ref={containerRef} className="h-full w-full" />

      {status !== "ready" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_20%,#242428_0%,#101010_56%,#050505_100%)] px-6 text-center">
          {status === "error" ? (
            <>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10 text-red-300">
                <AlertCircle className="h-6 w-6" />
              </span>
              <p className="mt-4 text-sm font-semibold text-white">
                3D 模型加载失败
              </p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-white/50">
                请检查模型文件链接是否有效，或稍后重新打开预览。
              </p>
            </>
          ) : (
            <>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white">
                <Loader2 className="h-6 w-6 animate-spin" />
              </span>
              <p className="mt-4 text-sm font-semibold text-white">
                正在加载 3D 模型
              </p>
              <p className="mt-1 text-xs text-white/50">模型文件较大，请稍等</p>
              <div className="mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#c8ff00] transition-all duration-200"
                  style={{
                    width: `${Math.max(8, Math.round(progress * 100))}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] font-medium text-white/45">
                {Math.round(progress * 100)}%
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
