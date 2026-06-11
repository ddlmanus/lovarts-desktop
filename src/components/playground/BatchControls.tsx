import { useTranslation } from "react-i18next";
import { usePlaygroundStore } from "@/stores/playgroundStore";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Play, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PriceDisplay } from "@/lib/pricing";

interface BatchControlsProps {
  disabled?: boolean;
  isUploading?: boolean;
  onRun: () => void;
  runLabel: string;
  price?: string | PriceDisplay;
}

export function BatchControls({
  disabled,
  isUploading,
  onRun,
  runLabel,
  price,
}: BatchControlsProps) {
  const { t } = useTranslation();
  const { getActiveTab, setBatchConfig } = usePlaygroundStore();
  const activeTab = getActiveTab();

  if (!activeTab) return null;

  const { batchConfig } = activeTab;
  const { enabled, repeatCount, randomizeSeed } = batchConfig;

  const handleEnabledChange = (checked: boolean) => {
    setBatchConfig({ enabled: checked });
  };

  const handleCountChange = (value: number[]) => {
    setBatchConfig({ repeatCount: value[0] });
  };

  const handleRandomizeSeedChange = (checked: boolean) => {
    setBatchConfig({ randomizeSeed: checked });
  };

  const displayLabel =
    enabled && repeatCount > 1 ? `${runLabel} (${repeatCount})` : runLabel;

  const priceMultiplier = enabled && repeatCount > 1 ? repeatCount : 1;
  const formatPrice = (value: number) => value.toFixed(4);
  const renderPrice = () => {
    if (!price) return null;

    if (typeof price === "string") {
      if (price === "...") {
        return <Loader2 className="ml-1.5 h-3 w-3 animate-spin opacity-80" />;
      }
      const numeric = Number(price.replace(/^[¥$]/, ""));
      const display = Number.isFinite(numeric)
        ? formatPrice(numeric * priceMultiplier)
        : price;
      return <span className="ml-1.5 text-xs opacity-80">¥{display}</span>;
    }

    const original = price.price * priceMultiplier;
    const discounted = price.discountedPrice * priceMultiplier;
    const hasDiscount = discounted > 0 && discounted < original;

    if (!hasDiscount) {
      return (
        <span className="ml-1.5 text-xs opacity-80">
          ¥{formatPrice(original)}
        </span>
      );
    }

    return (
      <span className="ml-1.5 inline-flex items-baseline gap-1.5 text-xs">
        <span className="line-through opacity-55">
          ¥{formatPrice(original)}
        </span>
        <span className="font-semibold opacity-95">
          ¥{formatPrice(discounted)}
        </span>
      </span>
    );
  };

  return (
    <div className="flex rounded-lg border border-transparent shadow-sm">
      {/* Main Run Button */}
      <Button
        className={cn(
          "playground-run-button flex-1 h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors",
          "rounded-r-none border-r border-r-white/20 shadow-none",
        )}
        onClick={onRun}
        disabled={disabled || isUploading}
        title={isUploading ? t("playground.capture.uploading") : undefined}
      >
        <Play className="mr-2 h-4 w-4" />
        {displayLabel}
        {renderPrice()}
      </Button>

      {/* Dropdown Trigger */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className={cn(
              "playground-run-button bg-blue-600 hover:bg-blue-700 text-white transition-colors",
              "rounded-l-none px-1.5 h-9 shadow-none",
            )}
            disabled={disabled || isUploading}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-64 rounded-xl border border-border/80 p-4 shadow-xl"
        >
          <div className="space-y-4">
            {/* Header */}
            <div className="font-medium text-sm">
              {t("playground.batch.settings")}
            </div>

            {/* Animated batch settings */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                enabled ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="space-y-4 pt-1">
                  {/* Repeat Count */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">
                        {t("playground.batch.repeatCount")}
                      </Label>
                      <span className="text-sm font-medium">{repeatCount}</span>
                    </div>
                    <Slider
                      value={[repeatCount]}
                      onValueChange={handleCountChange}
                      min={2}
                      max={16}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Randomize Seed */}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="randomize-seed"
                      className="text-sm cursor-pointer"
                    >
                      {t("playground.batch.randomizeSeed")}
                    </Label>
                    <Switch
                      id="randomize-seed"
                      checked={randomizeSeed}
                      onCheckedChange={handleRandomizeSeedChange}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Enable Batch - at bottom so position stays fixed */}
            <div className="flex items-center justify-between pt-2 border-t">
              <Label htmlFor="batch-enabled" className="text-sm cursor-pointer">
                {t("playground.batch.enable")}
              </Label>
              <Switch
                id="batch-enabled"
                checked={enabled}
                onCheckedChange={handleEnabledChange}
              />
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
