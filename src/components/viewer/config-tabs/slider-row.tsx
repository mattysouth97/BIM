"use client";

import { Slider } from "@/components/ui/slider";

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  decimals?: number;
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  decimals = 2,
}: SliderRowProps) {
  const display = Number.isInteger(step) && step >= 1
    ? value.toFixed(0)
    : value.toFixed(decimals);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">
          {display}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
