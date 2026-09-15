import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ECONOMIC_ASSUMPTIONS } from "@/lib/retrofit/cost-database";
import { useAppStore } from "@/store/app-store";
import { ScenarioRail, type ModeledBillSaving } from "../scenario-rail";

afterEach(cleanup);
const bill: ModeledBillSaving = { beforeAnnualKrw: 2_000_000, afterAnnualKrw: 1_700_000, annualSavingKrw: 300_000, tariffs: { electricity: 140, gas: 75, districtHeating: 90, districtCooling: 90 }, basis: "Annual engine comparison" };
const props = { capexBudgetKrw: null, onBudgetChange: () => {}, selection: null, assumptions: DEFAULT_ECONOMIC_ASSUMPTIONS, totalCandidateMeasures: 0 };

describe("selected-work rail", () => {
  for (const language of ["ko", "en"] as const) {
    it(`withholds unsupported currency and retains explicit user budget (${language})`, () => {
      useAppStore.setState({ language });
      const { container } = render(<ScenarioRail {...props} />);
      expect(screen.getByRole("spinbutton", { name: language === "ko" ? "투자 예산, 만원, 선택 사항" : "Budget, 만원, optional" })).toBeDefined();
      expect(screen.queryByTestId("retrofit-annual-saving")).toBeNull();
      expect(container.textContent).not.toMatch(/NPV|IRR|CAPEX|ROI|Payback/);
    });
    it(`shows paired engine bills and the same assumed tariffs (${language})`, () => {
      useAppStore.setState({ language });
      render(<ScenarioRail {...props} modeledBill={bill} />);
      const saving = screen.getByTestId("retrofit-annual-saving");
      expect(Number(saving.getAttribute("data-saving-krw"))).toBe(bill.beforeAnnualKrw - bill.afterAnnualKrw);
      expect(saving.textContent).toContain(language === "ko" ? "30만" : "300k");
      const basis = screen.getByTestId("retrofit-bill-basis").textContent!;
      for (const tariff of Object.values(bill.tariffs)) expect(basis).toContain(String(tariff));
      expect(basis).toContain(language === "ko" ? "가정 단가" : "assumed tariffs");
    });
  }
  it("does not clamp a modeled cost increase into a zero saving", () => {
    useAppStore.setState({ language: "en" });
    render(<ScenarioRail {...props} modeledBill={{ ...bill, afterAnnualKrw: 2_300_000, annualSavingKrw: -300_000 }} unsavedEditCount={2} />);
    expect(screen.getByTestId("retrofit-annual-saving").getAttribute("data-saving-krw")).toBe("-300000");
    expect(screen.getByText("A negative saving means a higher bill.")).toBeDefined();
    expect(screen.getByTestId("retrofit-unsaved-edits").textContent).toContain("2 local fields differ from the source model");
  });
});
