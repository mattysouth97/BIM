import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReferenceInfoNavigation, useReferenceInfoSection } from "../reference-info-navigation";

afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

function Harness({ isKo = false, onMount = () => {} }: { isKo?: boolean; onMount?: () => void }) {
  const [activeSection, setActiveSection] = useReferenceInfoSection();
  return <ReferenceInfoNavigation activeSection={activeSection} onSectionChange={setActiveSection} isKo={isKo}>
    {{ overview: <p>Energy basis</p>, materials: <MaterialState onMount={onMount} />, layers: <button>Show ducts</button>, data: <a href="/data.json">Download source</a> }}
  </ReferenceInfoNavigation>;
}

function MaterialState({ onMount }: { onMount: () => void }) {
  const [value, setValue] = useState("outer layer");
  useEffect(() => { onMount(); }, [onMount]);
  return <input aria-label="Chosen source layer" value={value} onChange={(event) => setValue(event.target.value)} />;
}

function select(section: string) {
  fireEvent.mouseDown(screen.getByTestId(`reference-info-tab-${section}`), { button: 0, ctrlKey: false });
}

describe("reference information navigation", () => {
  it.each([false, true])("exposes four labeled tabs and only the active panel to keyboard and assistive technology (Korean: %s)", (isKo) => {
    render(<Harness isKo={isKo} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(isKo ? ["개요", "재료", "레이어", "데이터"] : ["Overview", "Materials", "Layers", "Data"]);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    const tab = screen.getByRole("tab", { selected: true });
    const panel = screen.getByRole("tabpanel");
    expect(tab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
    expect(screen.queryByRole("textbox")).toBeNull();
    select("materials");
    expect(screen.getByRole("textbox")).toBeDefined();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("restores an allowed hash and updates category links without losing path, query or router state", () => {
    window.history.replaceState({ next: "keep" }, "", "/models/fzk-haus?locale=en#materials");
    render(<Harness />);
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Materials");
    select("data");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/models/fzk-haus?locale=en#data");
    expect(window.history.state).toEqual({ next: "keep" });
    act(() => {
      window.history.replaceState({ next: "keep" }, "", "/models/fzk-haus?locale=en#layers");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Layers");
  });

  it("keeps nested edits and scroll positions mounted while switching categories", () => {
    const onMount = vi.fn();
    render(<Harness onMount={onMount} />);
    select("materials");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "insulation layer" } });
    const panel = screen.getByRole("tabpanel");
    panel.scrollTop = 120;
    select("layers");
    select("materials");
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("insulation layer");
    expect(screen.getByRole("tabpanel")).toBe(panel);
    expect(panel.scrollTop).toBe(120);
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it("falls back to Overview for an unrelated hash without rewriting it or creating history entries", () => {
    window.history.replaceState(null, "", "/models/fzk-haus#unrelated");
    const length = window.history.length;
    render(<Harness />);
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Overview");
    select("overview");
    expect(window.location.hash).toBe("#unrelated");
    expect(window.history.length).toBe(length);
  });
});
