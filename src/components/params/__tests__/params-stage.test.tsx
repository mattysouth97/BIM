/* @vitest-environment happy-dom */
// P2-24 — 정보 입력 stage: minimal manual params for a CAD-first draft.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ParamsStage } from "../params-stage";
import { useWorkflowStore } from "@/store/workflow-store";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useCadDraftStore } from "@/store/cad-draft-store";

const DRAFT_PK = "cad-test-draft";

beforeEach(() => {
  useWorkflowStore.setState({
    stage: "params",
    completion: { search: false, upload: false, params: false, twin: false, report: false },
    cadSkipped: {},
  });
  useActiveBuildingStore.getState().setActiveBuilding(DRAFT_PK);
  useCadDraftStore.setState({ drafts: {} });
});

afterEach(() => {
  cleanup();
  useActiveBuildingStore.getState().clearActiveBuilding();
});

function fillValidForm() {
  fireEvent.change(screen.getByTestId("params-floors"), { target: { value: "6" } });
  fireEvent.change(screen.getByTestId("params-year"), { target: { value: "1995" } });
  fireEvent.change(screen.getByTestId("params-sido"), { target: { value: "11" } });
  // 시군구 options populate after the 시도 pick; 11680 = 서울 강남구
  fireEvent.change(screen.getByTestId("params-sigungu"), { target: { value: "11680" } });
}

describe("ParamsStage (P2-24)", () => {
  it("renders floors, year, and region inputs with a disabled continue button", () => {
    render(<ParamsStage />);
    expect(screen.getByTestId("params-floors")).toBeDefined();
    expect(screen.getByTestId("params-year")).toBeDefined();
    expect(screen.getByTestId("params-sido")).toBeDefined();
    expect(screen.getByTestId("params-sigungu")).toBeDefined();
    expect(
      (screen.getByTestId("params-continue") as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("enables continue once floors, year, and region are valid", () => {
    render(<ParamsStage />);
    fillValidForm();
    expect(
      (screen.getByTestId("params-continue") as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("submit stores the draft params, sets sigunguCd, and advances to twin", () => {
    render(<ParamsStage />);
    fillValidForm();
    fireEvent.click(screen.getByTestId("params-continue"));

    expect(useCadDraftStore.getState().drafts[DRAFT_PK]).toEqual({
      floors: 6,
      year: 1995,
      sigunguCd: "11680",
    });
    // Region flows into the active-building store for climate lookups
    expect(useActiveBuildingStore.getState().sigunguCd).toBe("11680");
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });

  it("keeps continue disabled for a zero floor count", () => {
    render(<ParamsStage />);
    fillValidForm();
    fireEvent.change(screen.getByTestId("params-floors"), { target: { value: "0" } });
    expect(
      (screen.getByTestId("params-continue") as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByTestId("params-continue"));
    expect(useWorkflowStore.getState().stage).toBe("params");
  });
});
