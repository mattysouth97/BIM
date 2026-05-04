"use client";

// src/components/twin/twin-stage-overlay.tsx
// Composes the data-product surface that overlays the 3D viewport on the Twin
// stage. Pulls the release manifest + calibration from /releases/<version>/
// and derives the per-twin feature vector + preview prediction purely from
// building-ledger + footprint data — no user inputs, no editable sliders.

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { BrTitleInfo, BuildingRecord } from "@/lib/types";
import { usePredictionRelease } from "@/hooks/use-prediction-release";
import { extractFeatures } from "@/lib/portfolio/feature-extractor";
import type { FootprintGeometry } from "@/lib/portfolio/types";
import type { PortfolioFeatureVector } from "@/lib/portfolio/features";
import { derivePreviewPrediction } from "@/lib/twin/preview-prediction";
import { ReleaseRail } from "./release-rail";
import { PredictionReadout } from "./prediction-readout";
import { FeatureVectorPanel } from "./feature-vector-panel";

interface TwinStageOverlayProps {
  title: BrTitleInfo;
  /** Pre-projected footprint geometry info (area/perimeter/aspect) from VWorld. */
  footprintGeometry: FootprintGeometry | null;
}

function toBuildingRecord(title: BrTitleInfo): BuildingRecord {
  return {
    pk: title.mgmBldrgstPk ?? "",
    name: title.bldNm ?? "",
    address: title.platPlcNm ?? title.newPlatPlc ?? "",
    useCode: title.mainPurpsCd ?? "",
    useName: title.mainPurpsCdNm ?? "",
    structureCode: title.strctCd ?? "",
    structureName: title.strctCdNm ?? "",
    floorsAbove: title.grndFlrCnt ?? 0,
    floorsBelow: title.ugrndFlrCnt ?? 0,
    totalArea: title.totArea ?? 0,
    buildingArea: title.archArea ?? 0,
    siteArea: title.platArea ?? 0,
    coverageRatio: title.bcRat ?? 0,
    floorAreaRatio: title.vlRat ?? 0,
    approvalDate: title.useAprDay ?? "",
    permitDate: title.pmsDay ?? "",
    constructionDate: title.stcnsDay ?? "",
    roofType: title.roofCdNm ?? "",
    height: title.heit ?? 0,
  };
}

export function TwinStageOverlay({
  title,
  footprintGeometry,
}: TwinStageOverlayProps) {
  const router = useRouter();
  const release = usePredictionRelease();

  // Derive the feature vector if we have the footprint geometry. If the user
  // is on a twin before the VWorld footprint resolves, the feature panel
  // displays — marks individual fields.
  const features: PortfolioFeatureVector | null = useMemo(() => {
    if (!footprintGeometry) return null;
    const record = toBuildingRecord(title);
    return extractFeatures(record, footprintGeometry);
  }, [title, footprintGeometry]);

  // Derive the preview prediction.
  const prediction = useMemo(() => {
    if (!features || !release.data) return null;
    return derivePreviewPrediction(
      features,
      release.data.manifest,
      release.data.calibration
    );
  }, [features, release.data]);

  return (
    <>
      <ReleaseRail
        manifest={release.data?.manifest}
        calibration={release.data?.calibration}
        isLoading={release.isLoading}
        onOpenReleaseExplorer={() => router.push("/releases")}
      />

      <PredictionReadout
        prediction={prediction}
        isLoading={release.isLoading || !features}
      />

      <FeatureVectorPanel
        features={features}
        calibration={release.data?.calibration}
        schemaVersion={release.data?.manifest.featureSchemaVersion}
      />
    </>
  );
}
