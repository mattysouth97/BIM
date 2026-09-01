"use client";

import type { ReactNode } from "react";
import { useRenderStore } from "@/store/render-store";
import { useT } from "@/lib/i18n";
import { CAMERA_PRESETS } from "@/lib/rendering/camera-presets";
import { QUALITY_TIER_LABELS } from "@/lib/rendering/quality-tiers";
import type {
  CameraPresetId,
  QualityTier,
  RenderMode,
  TimeOfDayPreset,
  WeatherPreset,
} from "@/lib/rendering/types";

const MODES: { id: RenderMode; ko: string; en: string }[] = [
  { id: "bim", ko: "BIM", en: "BIM" },
  { id: "realistic", ko: "실사", en: "Realistic" },
  { id: "hyperreal", ko: "하이퍼", en: "Hyperreal" },
];

const TIMES: { id: TimeOfDayPreset; ko: string; en: string }[] = [
  { id: "08:00", ko: "08:00", en: "08:00" },
  { id: "12:00", ko: "12:00", en: "12:00" },
  { id: "16:00", ko: "16:00", en: "16:00" },
  { id: "golden", ko: "골든아워", en: "Golden" },
  { id: "overcast", ko: "흐림", en: "Overcast" },
  { id: "night", ko: "야간", en: "Night" },
];

const WEATHER: { id: WeatherPreset; ko: string; en: string }[] = [
  { id: "clear", ko: "맑음", en: "Clear" },
  { id: "overcast", ko: "구름", en: "Cloud" },
  { id: "rain", ko: "비", en: "Rain" },
  { id: "fog", ko: "안개", en: "Fog" },
];

const QUALITY: QualityTier[] = ["performance", "balanced", "high", "ultra", "presentation"];

export function RenderModeOverlay() {
  const { t } = useT();
  const mode = useRenderStore((s) => s.mode);
  const quality = useRenderStore((s) => s.quality);
  const timeOfDay = useRenderStore((s) => s.timeOfDay);
  const weather = useRenderStore((s) => s.weather);
  const cameraPreset = useRenderStore((s) => s.cameraPreset);
  const setMode = useRenderStore((s) => s.setMode);
  const setQuality = useRenderStore((s) => s.setQuality);
  const setTimeOfDay = useRenderStore((s) => s.setTimeOfDay);
  const setWeather = useRenderStore((s) => s.setWeather);
  const setCameraPreset = useRenderStore((s) => s.setCameraPreset);

  return (
    <div
      className="pointer-events-auto absolute right-3 bottom-32 z-30 flex max-w-[min(100%,380px)] flex-col gap-1 rounded-md border bg-card/92 p-2 text-[10px] shadow-sm backdrop-blur"
      data-testid="render-mode-overlay"
    >
      <Row label={t("표시", "View")}>
        {MODES.map((item) => (
          <Chip
            key={item.id}
            active={mode === item.id}
            onClick={() => setMode(item.id)}
            label={t(item.ko, item.en)}
            testId={`render-mode-${item.id}`}
          />
        ))}
      </Row>
      <Row label={t("시간", "Time")}>
        {TIMES.map((item) => (
          <Chip
            key={item.id}
            active={timeOfDay === item.id}
            onClick={() => setTimeOfDay(item.id)}
            label={t(item.ko, item.en)}
          />
        ))}
      </Row>
      <Row label={t("날씨", "Weather")}>
        {WEATHER.map((item) => (
          <Chip
            key={item.id}
            active={weather === item.id}
            onClick={() => setWeather(item.id)}
            label={t(item.ko, item.en)}
          />
        ))}
      </Row>
      <Row label={t("품질", "Quality")}>
        {QUALITY.map((id) => (
          <Chip
            key={id}
            active={quality === id}
            onClick={() => setQuality(id)}
            label={t(QUALITY_TIER_LABELS[id].ko, QUALITY_TIER_LABELS[id].en)}
          />
        ))}
      </Row>
      <label className="flex items-center gap-2 text-muted-foreground">
        <span className="w-10 shrink-0">{t("카메라", "Camera")}</span>
        <select
          className="h-6 flex-1 rounded border bg-background px-1"
          value={cameraPreset}
          onChange={(e) => setCameraPreset(e.target.value as CameraPresetId)}
          data-testid="render-camera-preset"
        >
          {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((id) => (
            <option key={id} value={id}>
              {t(CAMERA_PRESETS[id].nameKo, CAMERA_PRESETS[id].nameEn)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-10 shrink-0 text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={
        active
          ? "h-6 rounded px-1.5 bg-primary text-primary-foreground"
          : "h-6 rounded px-1.5 hover:bg-muted"
      }
    >
      {label}
    </button>
  );
}
