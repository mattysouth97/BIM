/* @vitest-environment happy-dom */
// The toolbar must clearly label the demo building (데모모드) so visitors
// know they are looking at bundled sample data, not a real ledger record.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BuildingToolbar } from "../building-toolbar";
import { demoTitle } from "@/lib/demo/demo-building";
import type { BrTitleInfo } from "@/lib/types";

afterEach(cleanup);

const realTitle: BrTitleInfo = {
  ...demoTitle,
  mgmBldrgstPk: "11680-12345678",
  bldNm: "실제 건물",
};

describe("BuildingToolbar demo badge", () => {
  it("shows the 데모 badge for the demo building", () => {
    render(
      <BuildingToolbar
        title={demoTitle}
        exportData={[]}
        exportFilename="demo"
        loading={false}
      />,
    );
    expect(screen.getByText("데모 데이터")).toBeTruthy();
  });

  it("does not show the badge for a real building", () => {
    render(
      <BuildingToolbar
        title={realTitle}
        exportData={[]}
        exportFilename="real"
        loading={false}
      />,
    );
    expect(screen.queryByText("데모 데이터")).toBeNull();
  });
});
