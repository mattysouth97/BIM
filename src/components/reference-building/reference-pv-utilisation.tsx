import {
  PV_FIXED_RACK_TILT_DEG,
  PV_MODULE_LENGTH_M,
  PV_MODULE_WIDTH_M,
  PV_OBSTRUCTION_CLEARANCE_M,
  PV_PANEL_RATED_KWP,
  PV_SETBACK_FLAT_M,
  PV_SETBACK_PITCHED_M,
  type PlaneExclusionReason,
  type PlaneLayout,
  type PvLayoutResult,
} from "@/lib/retrofit/pv-layout";

const EXCLUSION_LABELS: Record<PlaneExclusionReason, { ko: string; en: string }> = {
  "tilt-above-60": { ko: "경사 60° 초과", en: "Tilt above 60°" },
  "smaller-than-one-module": { ko: "투영면적이 모듈 1장 미만", en: "Projected area below one module" },
  "north-facing-pitch": { ko: "북향 경사면", en: "North-facing pitch" },
  // A positive usable area can still be too narrow to fit a whole module.
  "no-usable-area-after-setback": { ko: "이격·여유거리 적용 후 모듈 배치 불가", en: "No module fits after setbacks / clearances" },
  "outline-shape-not-trustworthy": { ko: "외곽선 형상 미확정", en: "Outline shape not established" },
  "outline-area-disagrees-with-stated": { ko: "외곽선과 명시 면적 불일치", en: "Outline disagrees with stated area" },
};

function planeStatus(plane: PlaneLayout, locale: "ko" | "en") {
  if (plane.excludedReason) {
    return `${locale === "ko" ? "제외" : "Excluded"} · ${EXCLUSION_LABELS[plane.excludedReason][locale]}`;
  }
  return plane.mounting === "racked"
    ? locale === "ko" ? "경사 거치대" : "Tilted racks"
    : locale === "ko" ? "지붕면 밀착" : "Flush mounted";
}

/** The proposed array, independent of whether the user has selected PV. */
export function ReferencePvUtilisation({
  layout,
  locale,
}: {
  layout: PvLayoutResult | null;
  locale: "ko" | "en";
}) {
  const isKo = locale === "ko";
  if (!layout) {
    return (
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground" data-testid="reference-pv-unavailable">
        {isKo
          ? "지붕면 데이터를 아직 사용할 수 없어 태양광 용량은 산정하지 않습니다."
          : "Roof-plane data is not available yet; no PV capacity is priced."}
      </p>
    );
  }

  // This is module SURFACE area. It must never read as occupied plan area:
  // a tilted module's projected footprint is smaller than its own surface.
  const moduleSurfaceSqm = layout.planes.reduce((sum, plane) => sum + plane.moduleAreaSqm, 0);
  const title = isKo ? "태양광 · 지붕면별 배치" : "PV · layout by roof plane";
  return (
    <details className="mt-3 rounded-[8px] border border-border bg-card" data-testid="reference-pv-utilisation">
      <summary className="cursor-pointer px-3 py-2 text-[11px] text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <span>{title}</span>
        <span className="mt-1 block font-mono text-[10px] text-muted-foreground" data-testid="reference-pv-summary">
          {isKo
            ? `배치안 ${layout.totalModules}장 · ${layout.totalKWp.toFixed(1)} kWp · 지붕 ${layout.planes.length}면 중 ${layout.excludedPlanes}면 제외`
            : `Proposed ${layout.totalModules} modules · ${layout.totalKWp.toFixed(1)} kWp · ${layout.excludedPlanes} of ${layout.planes.length} planes excluded`}
        </span>
      </summary>
      <div className="border-t border-border px-3 py-2">
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {isKo
            ? "전체는 지붕 외곽선의 수평 투영면적, 사용 가능은 이격·제외 조건 적용 후 면적, 모듈은 패널 표면적입니다. 제외된 면도 모두 표시합니다."
            : "Gross is the roof outline's horizontal plan area; usable applies setbacks and exclusions; module area is panel surface area. Every excluded plane remains listed."}
        </p>
        <div
          className="mt-2 max-h-80 overflow-auto rounded border border-border focus-visible:outline-2 focus-visible:outline-ring"
          role="region"
          aria-label={title}
          tabIndex={0}
        >
          <table className="w-full min-w-[530px] border-collapse text-[10px] tabular-nums" data-testid="reference-pv-table">
            <caption className="sr-only">{isKo ? "지붕면별 태양광 배치 추정치. 면적 단위 m², 용량 단위 kWp." : "PV layout estimates by roof plane. Areas in m², capacity in kWp."}</caption>
            <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-2 text-left font-medium">{isKo ? "지붕면 · 배치 상태" : "Roof plane · status"}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{isKo ? "전체 m²" : "Gross m²"}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{isKo ? "사용 가능 m²" : "Usable m²"}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{isKo ? "모듈 표면 m²" : "Module surface m²"}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{isKo ? "모듈 수" : "Modules"}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">kWp</th>
              </tr>
            </thead>
            <tbody>
              {layout.planes.map((plane) => (
                <tr key={plane.planeId} className="border-t border-border align-top" data-pv-plane={plane.planeId} data-pv-excluded={plane.excludedReason ?? ""}>
                  <th scope="row" className="max-w-52 px-2 py-2 text-left font-normal">
                    <span className="block break-words font-medium text-foreground">{plane.elementName}</span>
                    <span className="block break-all text-[9px] text-muted-foreground">{plane.planeId}</span>
                    <span className="block text-muted-foreground">
                      {isKo ? "경사" : "Tilt"} {plane.tiltDeg.toFixed(1)}°
                      {plane.azimuthDeg !== null ? ` · ${isKo ? "방위각" : "Azimuth"} ${plane.azimuthDeg.toFixed(0)}°` : ""}
                    </span>
                    <span className={`mt-0.5 block ${plane.excludedReason ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                      {planeStatus(plane, locale)}
                    </span>
                  </th>
                  <td className="px-2 py-2 text-right">{plane.grossProjectedSqm.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right">{plane.usableSqm.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right">{plane.moduleAreaSqm.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right">{plane.moduleCount}</td>
                  <td className="px-2 py-2 text-right">{plane.kWp.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted font-medium" data-testid="reference-pv-totals">
              <tr>
                <th scope="row" className="px-2 py-2 text-left">{isKo ? "합계" : "Total"}</th>
                <td className="px-2 py-2 text-right">{layout.totalGrossProjectedSqm.toFixed(1)}</td>
                <td className="px-2 py-2 text-right">{layout.totalUsableSqm.toFixed(1)}</td>
                <td className="px-2 py-2 text-right">{moduleSurfaceSqm.toFixed(1)}</td>
                <td className="px-2 py-2 text-right">{layout.totalModules}</td>
                <td className="px-2 py-2 text-right">{layout.totalKWp.toFixed(1)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-muted-foreground" data-testid="reference-pv-assumptions">
          <p>{isKo
            ? `IFC에서 측정한 지붕 형상에 배치한 추정치입니다. 모듈 ${PV_MODULE_LENGTH_M.toFixed(2)} × ${PV_MODULE_WIDTH_M.toFixed(2)} m · 장당 ${PV_PANEL_RATED_KWP.toFixed(2)} kWp 가정: ${layout.totalModules}장 × ${PV_PANEL_RATED_KWP.toFixed(2)} = ${layout.totalKWp.toFixed(1)} kWp를 경제성 계산에 사용합니다.`
            : `Estimated placement on roof geometry measured from IFC. Assumed modules ${PV_MODULE_LENGTH_M.toFixed(2)} × ${PV_MODULE_WIDTH_M.toFixed(2)} m at ${PV_PANEL_RATED_KWP.toFixed(2)} kWp each: ${layout.totalModules} × ${PV_PANEL_RATED_KWP.toFixed(2)} = ${layout.totalKWp.toFixed(1)} kWp is the capacity priced in the economics.`}</p>
          <p>{isKo
            ? `이격 가정: 평지붕 ${PV_SETBACK_FLAT_M.toFixed(1)} m / 경사지붕 ${PV_SETBACK_PITCHED_M.toFixed(1)} m (A-PV-SETBACK), 장애물 여유거리 ${PV_OBSTRUCTION_CLEARANCE_M.toFixed(1)} m (A-PV-CLEARANCE). 평지붕 거치대 ${PV_FIXED_RACK_TILT_DEG}° · 열 간격 ${layout.rackRowPitchM.toFixed(2)} m, 서울 위도 ${layout.latitudeDeg.toFixed(2)}°의 동지 정오 기준 (A-CLIMATE).`
            : `Assumed setbacks: flat ${PV_SETBACK_FLAT_M.toFixed(1)} m / pitched ${PV_SETBACK_PITCHED_M.toFixed(1)} m (A-PV-SETBACK); obstruction clearance ${PV_OBSTRUCTION_CLEARANCE_M.toFixed(1)} m (A-PV-CLEARANCE). Flat-roof racks ${PV_FIXED_RACK_TILT_DEG}° at ${layout.rackRowPitchM.toFixed(2)} m row pitch, using winter-solstice noon at Seoul latitude ${layout.latitudeDeg.toFixed(2)}° (A-CLIMATE).`}</p>
          <p>{layout.northAssumed
            ? isKo ? "진북 정보가 없어 프로젝트 북쪽을 가정합니다. 방위각은 이 북쪽 기준입니다." : "True north is unavailable; project north is assumed. Azimuths use this north reference."
            : isKo ? "방위각은 지붕 데이터의 북쪽 기준입니다." : "Azimuths use the roof data's north reference."}</p>
          <p>{isKo
            ? "옥상 설비·파라펫 장애물은 아직 반영되지 않았습니다. 추가 측정 시 배치 용량이 줄어들 수 있습니다. 면적은 반올림 전 값으로 합산합니다."
            : "Roof plant and parapet obstructions are not yet included. Measuring them may reduce capacity. Area totals are summed before rounding."}</p>
        </div>
      </div>
    </details>
  );
}
