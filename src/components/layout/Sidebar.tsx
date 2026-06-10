import { useState, useEffect, useRef, memo, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Home,
  LayoutDashboard,
  FolderOpen,
  History,
  Settings,
  Zap,
  PanelLeftClose,
  PanelLeft,
  FolderHeart,
  Sparkles,
  GitBranch,
  Layers,
  X,
  Image as ImageIcon,
  NotebookPen,
  Video,
  User,
  Music2,
  Box,
  Wrench,
} from "lucide-react";

interface NavItem {
  titleKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: boolean;
  aliases?: string[];
  label?: string;
}

// Static nav data — defined outside component to avoid re-creation on every render
const createItems: NavItem[] = [
  { titleKey: "nav.home", href: "/", icon: Home },
  { titleKey: "nav.models", href: "/models", icon: Layers },
  {
    titleKey: "nav.image",
    href: "/image",
    icon: ImageIcon,
    matchPrefix: true,
  },
];

const manageItems: NavItem[] = [
  { titleKey: "nav.templates", href: "/templates", icon: FolderOpen },
  { titleKey: "nav.history", href: "/history", icon: History },
  { titleKey: "nav.assets", href: "/assets", icon: FolderHeart },
];

const toolsItems: NavItem[] = [
  {
    titleKey: "nav.workflow",
    href: "/workflow",
    icon: GitBranch,
    matchPrefix: true,
  },
  {
    titleKey: "nav.freeTools",
    href: "/free-tools",
    icon: Sparkles,
    matchPrefix: true,
  },
  { titleKey: "nav.xiaohongshu", href: "/xiaohongshu", icon: NotebookPen },
  { titleKey: "nav.zImage", href: "/z-image", icon: Zap },
];

const navGroups = [
  { key: "create", label: "Create", items: createItems },
  { key: "manage", label: "Manage", items: manageItems },
  { key: "tools", label: "Tools", items: toolsItems },
];

const bottomNavItems: NavItem[] = [
  { titleKey: "nav.settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  lastFreeToolsPage: string | null;
  playgroundMode?: boolean;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

function SidebarTooltip({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  return (
    <Tooltip
      delayDuration={0}
      open={enabled ? open : false}
      onOpenChange={(nextOpen) => setOpen(enabled ? nextOpen : false)}
    >
      {children}
    </Tooltip>
  );
}

export const Sidebar = memo(function Sidebar({
  collapsed,
  onToggle,
  lastFreeToolsPage,
  playgroundMode = false,
  isMobileOpen,
  onMobileClose,
}: SidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const primaryRailItems: NavItem[] = [
    { titleKey: "nav.home", label: "首页", href: "/", icon: LayoutDashboard },
    {
      titleKey: "nav.image",
      label: "图像",
      href: "/image",
      icon: ImageIcon,
      matchPrefix: true,
      aliases: ["/playground"],
    },
    {
      titleKey: "nav.video",
      label: "视频",
      href: "/video",
      icon: Video,
      matchPrefix: true,
    },
    {
      titleKey: "nav.avatar",
      label: "数字人",
      href: "/avatar",
      icon: User,
      matchPrefix: true,
    },
    {
      titleKey: "nav.audio",
      label: "音频",
      href: "/audio",
      icon: Music2,
      matchPrefix: true,
    },
    {
      titleKey: "nav.3d",
      label: "3D",
      href: "/3d",
      icon: Box,
      matchPrefix: true,
    },
    {
      titleKey: "nav.freeTools",
      label: "工具",
      href: "/free-tools",
      icon: Wrench,
      matchPrefix: true,
    },
    {
      titleKey: "nav.xiaohongshu",
      label: "小红书",
      href: "/xiaohongshu",
      icon: NotebookPen,
    },
    {
      titleKey: "nav.workflow",
      label: "应用",
      href: "/workflow",
      icon: Sparkles,
      matchPrefix: true,
    },
  ];

  const secondaryRailItems: NavItem[] = [
    { titleKey: "nav.history", label: "历史", href: "/history", icon: History },
    {
      titleKey: "nav.assets",
      label: "资产",
      href: "/assets",
      icon: FolderHeart,
    },
    { titleKey: "nav.zImage", label: "Z-Image", href: "/z-image", icon: Zap },
  ];

  // Suppress tooltips during collapse/expand animation to prevent stale popups
  const [tooltipReady, setTooltipReady] = useState(true);
  const prevCollapsed = useRef(collapsed);
  useEffect(() => {
    if (prevCollapsed.current !== collapsed) {
      setTooltipReady(false);
      const timer = setTimeout(() => setTooltipReady(true), 350);
      prevCollapsed.current = collapsed;
      return () => clearTimeout(timer);
    }
  }, [collapsed]);

  // Dismiss stale tooltips after Alt+Tab: suppress on blur, re-enable on next mouse move
  const blurredRef = useRef(false);
  useEffect(() => {
    const handleBlur = () => {
      blurredRef.current = true;
      setTooltipReady(false);
    };
    const handleFocus = () => {
      if (!blurredRef.current) return;
      // Keep suppressed — will be re-enabled by mousemove after a short grace period
      // The delay prevents tooltips from flashing when the OS synthesizes a
      // mousemove event immediately upon window focus (common in Electron).
      const onMove = () => {
        blurredRef.current = false;
        setTooltipReady(true);
        window.removeEventListener("mousemove", onMove);
      };
      setTimeout(() => {
        window.addEventListener("mousemove", onMove, { once: true });
      }, 150);
    };
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Check if a nav item is active
  const isActive = (item: NavItem) => {
    const searchParams = new URLSearchParams(location.search);
    if (item.href === "/models") {
      return location.pathname === "/models" && !searchParams.get("kind");
    }
    if (item.aliases?.some((alias) => location.pathname.startsWith(alias))) {
      return true;
    }
    if (item.matchPrefix) {
      return (
        location.pathname === item.href ||
        location.pathname.startsWith(item.href + "/")
      );
    }
    return location.pathname === item.href;
  };

  const navRef = useRef<HTMLElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({
    opacity: 0,
  });
  const hasPositioned = useRef(false);

  useEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      if (!nav) return;
      const activeBtn = nav.querySelector(
        "[data-nav-active]",
      ) as HTMLElement | null;
      if (!activeBtn) {
        setIndicatorStyle((s) => ({ ...s, opacity: 0 }));
        return;
      }
      const nr = nav.getBoundingClientRect();
      const br = activeBtn.getBoundingClientRect();
      setIndicatorStyle({
        top: br.top - nr.top,
        left: br.left - nr.left,
        width: br.width,
        height: br.height,
        opacity: 1,
      });
      hasPositioned.current = true;
    };

    requestAnimationFrame(measure);
    // Re-measure after sidebar collapse/expand transition completes
    const timer = setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", measure);
    };
  }, [location.pathname, collapsed, isMobileOpen]);

  if (playgroundMode) {
    const navigateToItem = (item: NavItem) => {
      if (item.href === "/free-tools" && lastFreeToolsPage) {
        navigate(lastFreeToolsPage);
        return;
      }
      navigate(item.href);
    };

    const renderRailItem = (item: NavItem) => {
      const active = isActive(item);
      const showTooltip = tooltipReady;
      const label = item.label || t(item.titleKey);
      return (
        <SidebarTooltip
          key={`${item.href}-${item.label}`}
          enabled={showTooltip}
        >
          <TooltipTrigger asChild>
            <button
              onClick={() => navigateToItem(item)}
              className={cn(
                "group relative flex h-12 w-12 flex-col items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20",
                active && "bg-white/[0.08] text-white",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-white" />
              )}
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="mt-1 text-[10px] leading-none">{label}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </SidebarTooltip>
      );
    };

    return (
      <aside
        className={cn(
          "flex h-full w-20 flex-shrink-0 flex-col items-center border-r border-white/[0.06] bg-[#141414] py-2 electron-drag",
          isMobileOpen && "!fixed inset-y-0 left-0 z-50 shadow-2xl",
        )}
      >
        {isMobileOpen && (
          <button
            className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-white/6 md:hidden"
            onClick={onMobileClose}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div className="w-full flex-1 overflow-y-auto electron-no-drag">
          <nav className="flex flex-col items-center gap-2">
            {primaryRailItems.slice(0, 1).map(renderRailItem)}
            <div className="my-0.5 w-6 border-t border-white/[0.06]" />
            {primaryRailItems.slice(1).map(renderRailItem)}
            <div className="my-0.5 w-6 border-t border-white/[0.06]" />
            {secondaryRailItems.map(renderRailItem)}
          </nav>
        </div>

        <div className="w-full border-t border-white/[0.06] py-2 electron-no-drag">
          <SidebarTooltip enabled={tooltipReady}>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate("/settings")}
                className={cn(
                  "mx-auto flex h-12 w-12 flex-col items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-white/[0.08] hover:text-white",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20",
                  location.pathname === "/settings"
                    ? "bg-white/[0.08] text-white"
                    : "text-[#9ca3af]",
                )}
              >
                <Settings className="h-5 w-5 shrink-0" />
                <span className="mt-1 text-[10px] leading-none">设置</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">设置</TooltipContent>
          </SidebarTooltip>
        </div>
      </aside>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-background/95 backdrop-blur transition-all duration-300 shrink-0 electron-drag",
        playgroundMode &&
          "bg-[hsl(var(--playground-sidebar))] text-[hsl(var(--playground-sidebar-foreground))] border-r border-[hsl(var(--playground-border))]",
        collapsed ? "w-12" : "w-48",
        // Mobile overlay when hamburger opens
        isMobileOpen && "!fixed inset-y-0 left-0 z-50 w-72 shadow-2xl",
      )}
    >
      {/* Mobile close button */}
      {isMobileOpen && (
        <button
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted md:hidden"
          onClick={onMobileClose}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {/* Navigation */}
      <ScrollArea className="flex-1 px-1.5 py-2">
        <nav
          ref={navRef}
          className="relative flex flex-col gap-5 px-0.5 electron-no-drag"
        >
          {/* Sliding active indicator */}
          <div
            className={cn(
              "absolute rounded-lg bg-primary shadow-sm pointer-events-none",
              playgroundMode &&
                "bg-[hsl(var(--playground-sidebar-active))] shadow-none",
              hasPositioned.current &&
                "transition-[top,left,width,height,opacity] duration-300 ease-out",
            )}
            style={indicatorStyle}
          />
          {navGroups.map((group) => (
            <div
              key={group.key}
              className={collapsed && !isMobileOpen ? "contents" : "space-y-5"}
            >
              {(!collapsed || isMobileOpen) && (
                <div
                  className={cn(
                    "px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80",
                    playgroundMode &&
                      "text-[hsl(var(--playground-sidebar-muted))]",
                  )}
                >
                  {group.label}
                </div>
              )}

              {group.items.map((item) => {
                const active = isActive(item);
                const showTooltip = collapsed && !isMobileOpen && tooltipReady;
                const isNewFeature = item.href === "/workflow";
                return (
                  <SidebarTooltip key={item.href} enabled={showTooltip}>
                    <TooltipTrigger asChild>
                      <button
                        data-nav-active={active || undefined}
                        onClick={() => {
                          if (
                            item.matchPrefix &&
                            location.pathname.startsWith(item.href + "/")
                          ) {
                            return;
                          }
                          if (
                            item.href === "/free-tools" &&
                            lastFreeToolsPage
                          ) {
                            navigate(lastFreeToolsPage);
                            return;
                          }
                          navigate(item.href);
                        }}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "h-8 w-full rounded-lg text-xs transition-colors duration-200 relative overflow-visible",
                          collapsed && !isMobileOpen
                            ? "justify-center px-0"
                            : "justify-start gap-2.5 px-2.5",
                          active
                            ? "!bg-transparent text-primary-foreground hover:!bg-transparent hover:text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          playgroundMode &&
                            (active
                              ? "text-white"
                              : "text-[hsl(var(--playground-sidebar-muted))] hover:bg-white/6 hover:text-white"),
                          isNewFeature &&
                            !active &&
                            "ring-2 ring-blue-500/20 hover:ring-blue-500/30",
                        )}
                      >
                        {/* Glow effect for new feature */}
                        {isNewFeature && !active && (
                          <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 animate-pulse" />
                        )}

                        <item.icon className="h-5 w-5 shrink-0 relative z-10" />
                        {(!collapsed || isMobileOpen) && (
                          <>
                            <span className="relative z-10">
                              {t(item.titleKey)}
                            </span>
                            {isNewFeature && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-sm ml-auto relative z-10 animate-in fade-in zoom-in-75 duration-500">
                                NEW
                              </span>
                            )}
                          </>
                        )}
                        {/* Blue dot for collapsed state — only when not active */}
                        {isNewFeature &&
                          !active &&
                          collapsed &&
                          !isMobileOpen && (
                            <span className="absolute top-1 right-1 flex h-2 w-2 z-10 animate-in fade-in zoom-in-50 duration-500">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                          )}
                      </button>
                    </TooltipTrigger>
                    {showTooltip && (
                      <TooltipContent
                        side="right"
                        className="flex items-center gap-2"
                      >
                        <span>{t(item.titleKey)}</span>
                        {isNewFeature && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                            NEW
                          </span>
                        )}
                      </TooltipContent>
                    )}
                  </SidebarTooltip>
                );
              })}
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Bottom Navigation */}
      <div className="mt-auto p-1.5 electron-no-drag">
        <nav className="flex flex-col gap-1">
          {bottomNavItems.map((item) => {
            const active = location.pathname === item.href;
            const showTooltip = collapsed && !isMobileOpen && tooltipReady;
            return (
              <SidebarTooltip key={item.href} enabled={showTooltip}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate(item.href)}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "h-8 w-full rounded-lg transition-all",
                      collapsed && !isMobileOpen
                        ? "justify-center px-0"
                        : "justify-start gap-2.5 px-2.5",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/95 hover:text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      playgroundMode &&
                        (active
                          ? "bg-[hsl(var(--playground-sidebar-active))] text-white shadow-none hover:bg-[hsl(var(--playground-sidebar-active))]"
                          : "text-[hsl(var(--playground-sidebar-muted))] hover:bg-white/6 hover:text-white"),
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {(!collapsed || isMobileOpen) && (
                      <span>{t(item.titleKey)}</span>
                    )}
                  </button>
                </TooltipTrigger>
                {showTooltip && (
                  <TooltipContent side="right">
                    {t(item.titleKey)}
                  </TooltipContent>
                )}
              </SidebarTooltip>
            );
          })}
        </nav>

        {/* Collapse/expand: bottom button toggles; state also syncs to window width on resize */}
        {!isMobileOpen && (
          <SidebarTooltip enabled={collapsed && tooltipReady}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
                className={cn(
                  "mt-3 h-8 w-full rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground",
                  playgroundMode &&
                    "text-[hsl(var(--playground-sidebar-muted))] hover:bg-white/6 hover:text-white",
                  collapsed
                    ? "justify-center px-0"
                    : "justify-start gap-2.5 px-2.5",
                )}
              >
                {collapsed ? (
                  <PanelLeft className="h-5 w-5" />
                ) : (
                  <>
                    <PanelLeftClose
                      className="h-5 w-5"
                      style={{ flexShrink: 0 }}
                    />
                    <span>{t("nav.collapse")}</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t("nav.expand", "Expand")}
            </TooltipContent>
          </SidebarTooltip>
        )}
      </div>
    </div>
  );
});
