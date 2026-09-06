import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "@/store/app-store";
import { TwinInstrumentFrame } from "../twin-instrument-frame";

beforeEach(() => useAppStore.setState({ language: "en" }));
afterEach(cleanup);

function StatefulPanel({ name }: { name: string }) {
  const [chosen, setChosen] = useState(false);
  return (
    <>
      <label>
        {name} input
        <input defaultValue="Initial value" />
      </label>
      <button type="button" aria-pressed={chosen} onClick={() => setChosen(!chosen)}>
        {name} choice
      </button>
    </>
  );
}

describe("TwinInstrumentFrame panel visibility", () => {
  for (const language of ["en", "ko"] as const) {
    it(`starts expanded with distinct, localized controls (${language})`, () => {
      useAppStore.setState({ language });
      render(<TwinInstrumentFrame top="Investment" bottom="Energy" />);

      const top = screen.getByRole("button", {
        name: language === "ko" ? "투자·공사 패널 접기" : "Collapse investment panel",
      });
      const bottom = screen.getByRole("button", {
        name: language === "ko" ? "에너지 패널 접기" : "Collapse energy panel",
      });
      for (const [position, toggle] of [["top", top], ["bottom", bottom]] as const) {
        const content = screen.getByTestId(`twin-panel-${position}-content`);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(toggle.getAttribute("aria-controls")).toBe(content.id);
        expect(content.hidden).toBe(false);
        expect(toggle.tagName).toBe("BUTTON");
        expect(toggle.getAttribute("type")).toBe("button");
      }

      fireEvent.click(top);
      fireEvent.click(bottom);
      expect(screen.getByRole("button", {
        name: language === "ko" ? "투자·공사 패널 펼치기" : "Show investment panel",
      })).toBe(top);
      expect(screen.getByRole("button", {
        name: language === "ko" ? "에너지 패널 펼치기" : "Show energy panel",
      })).toBe(bottom);
    });
  }

  it("collapses panels independently, preserving their inputs and React state on restore", () => {
    render(<TwinInstrumentFrame top={<StatefulPanel name="Investment" />} bottom={<StatefulPanel name="Energy" />} />);
    const topToggle = screen.getByTestId("twin-panel-top-toggle");
    const bottomToggle = screen.getByTestId("twin-panel-bottom-toggle");
    const topContent = screen.getByTestId("twin-panel-top-content");
    const bottomContent = screen.getByTestId("twin-panel-bottom-content");
    const investmentInput = screen.getByRole("textbox", { name: "Investment input" }) as HTMLInputElement;
    const energyInput = screen.getByRole("textbox", { name: "Energy input" }) as HTMLInputElement;
    const investmentChoice = screen.getByRole("button", { name: "Investment choice" });
    const energyChoice = screen.getByRole("button", { name: "Energy choice" });
    fireEvent.change(investmentInput, { target: { value: "120000000" } });
    fireEvent.change(energyInput, { target: { value: "Comparison" } });
    fireEvent.click(investmentChoice);
    fireEvent.click(energyChoice);

    topToggle.focus();
    fireEvent.click(topToggle);
    expect(document.activeElement).toBe(topToggle);
    expect(topToggle.getAttribute("aria-expanded")).toBe("false");
    expect(topContent.hidden).toBe(true);
    expect(bottomContent.hidden).toBe(false);
    expect(screen.queryByRole("textbox", { name: "Investment input" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Energy input" })).toBe(energyInput);
    // Hidden controls leave the accessible tree, but the actual subtree is kept.
    expect(within(topContent).getByRole("textbox", { hidden: true })).toBe(investmentInput);

    fireEvent.click(bottomToggle);
    expect(bottomContent.hidden).toBe(true);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getAllByRole("button")).toEqual([topToggle, bottomToggle]);

    fireEvent.click(topToggle);
    expect(topContent.hidden).toBe(false);
    expect(bottomContent.hidden).toBe(true);
    fireEvent.click(bottomToggle);
    expect(bottomContent.hidden).toBe(false);
    expect(screen.getByRole("textbox", { name: "Investment input" })).toBe(investmentInput);
    expect(screen.getByRole("textbox", { name: "Energy input" })).toBe(energyInput);
    expect(investmentInput.value).toBe("120000000");
    expect(energyInput.value).toBe("Comparison");
    expect(investmentChoice.getAttribute("aria-pressed")).toBe("true");
    expect(energyChoice.getAttribute("aria-pressed")).toBe("true");
  });

  it("updates language while keeping a panel collapsed", () => {
    render(<TwinInstrumentFrame top="Investment" bottom="Energy" />);
    const toggle = screen.getByRole("button", { name: "Collapse investment panel" });
    fireEvent.click(toggle);
    act(() => useAppStore.setState({ language: "ko" }));
    expect(screen.getByRole("button", { name: "투자·공사 패널 펼치기" })).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("twin-panel-top-content").hidden).toBe(true);
  });

  it("links each toggle to its own content when multiple frames are mounted", () => {
    render(<>
      <TwinInstrumentFrame top="First investment" bottom="First energy" />
      <TwinInstrumentFrame top="Second investment" bottom="Second energy" />
    </>);
    const toggles = screen.getAllByRole("button");
    const contentIds = toggles.map((toggle) => toggle.getAttribute("aria-controls"));
    expect(new Set(contentIds).size).toBe(4);
    for (const id of contentIds) expect(document.getElementById(id!)).not.toBeNull();
    fireEvent.click(toggles[0]);
    expect(contentIds.map((id) => document.getElementById(id!)!.hidden)).toEqual([true, false, false, false]);
  });

  it("only offers controls for supplied panels", () => {
    const { rerender } = render(<TwinInstrumentFrame bottom="Energy" />);
    expect(screen.queryByTestId("twin-panel-top-toggle")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Collapse energy panel" })).toBeDefined();
    rerender(<TwinInstrumentFrame top="Investment" />);
    expect(screen.queryByTestId("twin-panel-bottom-toggle")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Collapse investment panel" })).toBeDefined();
    rerender(<TwinInstrumentFrame />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
