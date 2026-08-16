// src/components/twin/__tests__/capex-input.test.tsx
// P1-07 (f) — numeric CAPEX input must clamp to [min, max] so slider + number
// stay in sync.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CapexInput } from "../capex-input";
import { useAppStore } from "@/store/app-store";

// P2-06: labels now follow the language store — pin Korean so the
// getByLabelText("직접 입력 (만원)") queries stay deterministic.
beforeEach(() => useAppStore.setState({ language: "ko" }));
afterEach(cleanup);

const MIN = 10_000_000;
const MAX = 2_000_000_000;
const KRW_MAN = 10_000;

function renderInput(value = 250_000_000) {
  const onChange = vi.fn();
  render(<CapexInput value={value} onChange={onChange} min={MIN} max={MAX} />);
  const numeric = screen.getByLabelText("직접 입력 (만원)") as HTMLInputElement;
  return { onChange, numeric };
}

describe("CapexInput numeric clamp (P1-07 f)", () => {
  it("clamps a value above max down to max", () => {
    const { onChange, numeric } = renderInput();
    // Type 999,999 만원 = far above the 2B max.
    fireEvent.change(numeric, { target: { value: "999999" } });
    expect(onChange).toHaveBeenCalledWith(MAX);
  });

  it("clamps a value below min up to min", () => {
    const { onChange, numeric } = renderInput();
    fireEvent.change(numeric, { target: { value: "1" } }); // 1만원 << 10M min
    expect(onChange).toHaveBeenCalledWith(MIN);
  });

  it("passes through an in-range value unchanged", () => {
    const { onChange, numeric } = renderInput();
    fireEvent.change(numeric, { target: { value: "50000" } }); // 50,000만 = 500M
    expect(onChange).toHaveBeenCalledWith(50_000 * KRW_MAN);
  });
});
