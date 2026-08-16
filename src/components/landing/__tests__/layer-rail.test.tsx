/* @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { landingCopy } from "@/lib/landing/copy";
import { LayerRail } from "../layer-rail";

afterEach(() => cleanup());

describe("LayerRail", () => {
  it("names every discipline and reports the selected layer", () => {
    const onChange = vi.fn();
    render(
      <LayerRail layer="structure" onChange={onChange} copy={landingCopy.ko} />,
    );
    expect(screen.getByTestId("landing-layer-rail")).toBeTruthy();
    expect(screen.getByTestId("landing-layer-structure").getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByText("슬래브 · 기둥 · 코어")).toBeTruthy();
    fireEvent.click(screen.getByTestId("landing-layer-mechanical"));
    expect(onChange).toHaveBeenCalledWith("mechanical");
  });
});
