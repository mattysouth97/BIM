"use client";

import { useMemo } from "react";
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
  /** Optional validator — return warning/error string, or null if valid */
  validate?: (value: number) => string | null;
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
  validate,
}: SliderRowProps) {
  const display = Number.isInteger(step) && step >= 1
    ? value.toFixed(0)
    : value.toFixed(decimals);

  const validationMsg = useMemo(
    () => validate?.(value) ?? null,
    [validate, value]
  );

  const handleValueChange = ([v]: number[]) => {
    // Clamp to min/max as safety net
    const clamped = Math.min(max, Math.max(min, v));
    onChange(clamped);
  };

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
        onValueChange={handleValueChange}
        aria-invalid={!!validationMsg}
        aria-label={label}
      />
      {validationMsg && (
        <p className="text-[10px] leading-tight text-amber-600 dark:text-amber-400">
          {validationMsg}
        </p>
      )}
    </div>
  );
}
