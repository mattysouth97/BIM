import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ECONOMIC_ASSUMPTIONS } from "@/lib/retrofit/cost-database";
import { useAppStore } from "@/store/app-store";
import { ScenarioRail } from "../scenario-rail";

afterEach(cleanup);

describe("investment rail after funding-program removal", () => {
  for (const language of ["ko", "en"] as const) {
    it(`describes work cost and retains the optional budget (${language})`, () => {
      useAppStore.setState({ language });
      const { container } = render(<ScenarioRail
        capexBudgetKrw={null}
        onBudgetChange={() => {}}
        selection={null}
        assumptions={DEFAULT_ECONOMIC_ASSUMPTIONS}
        totalCandidateMeasures={0}
      />);
      expect(screen.getByText(language === "ko" ? "선택한 공사 비용" : "Cost of chosen work")).toBeDefined();
      expect(screen.getByRole("spinbutton", {
        name: language === "ko" ? "투자 예산, 만원, 선택 사항" : "Budget, 만원, optional",
      })).toBeDefined();
      expect(container.textContent).not.toMatch(/Post-subsidy|보조금 반영|지원 재원|Financing/);
      const rate = container.textContent!.match(language === "ko" ? /유효할인율 ([\d.]+)%/ : /([\d.]+)% eff\. rate/);
      expect(Number(rate?.[1]) / 100).toBe(DEFAULT_ECONOMIC_ASSUMPTIONS.discountRate);
    });
  }
});
