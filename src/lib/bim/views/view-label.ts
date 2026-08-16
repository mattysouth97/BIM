import type { ElevationView, PlanView, ViewDefinition } from "./view-definition";

const ELEV_KO: Record<ElevationView["side"], string> = {
  front: "남측 입면",
  back: "북측 입면",
  left: "서측 입면",
  right: "동측 입면",
};

const ELEV_EN: Record<ElevationView["side"], string> = {
  front: "South elevation",
  back: "North elevation",
  left: "West elevation",
  right: "East elevation",
};

export function planSortRank(view: PlanView): number {
  const n = Number(view.levelId);
  if (!Number.isFinite(n)) return 0;
  // Ground and above first (1, 2, 3…), basements after (B1, B2…).
  return n >= 0 ? n : 1000 + Math.abs(n);
}

function planLevelLabel(view: PlanView): string {
  const n = Number(view.levelId);
  if (Number.isFinite(n) && n < 0) return `B${Math.abs(n)}F`;
  return view.name.includes("F") ? view.name : `${view.levelId}F`;
}

export function viewLabel(view: ViewDefinition, isKo: boolean): string {
  switch (view.kind) {
    case "3d":
      return "3D";
    case "plan":
      return isKo ? `평면도 ${planLevelLabel(view)}` : `Plan — ${planLevelLabel(view)}`;
    case "elevation":
      return isKo ? ELEV_KO[view.side] : ELEV_EN[view.side];
    case "section":
      return isKo ? "단면도" : "Section";
  }
}
