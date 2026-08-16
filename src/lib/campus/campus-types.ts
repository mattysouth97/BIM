import type { BrTitleInfo } from "@/lib/types";

/** GeoJSON Polygon geometry (inline — no @types/geojson required) */
export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface CampusBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface CampusBuilding {
  building: BrTitleInfo;
  footprint?: GeoJsonPolygon;
  position?: { x: number; y: number }; // relative position in meters from campus center
  /**
   * Measured building height in meters from VWorld GIS건물통합정보 (buld_hg).
   * Null when the building layer had no feature for this PNU or the field was absent/zero.
   * Feeds the ledger → measured → era fallback chain in generateBuildingGeometry (AFF-6).
   */
  measuredHeightM?: number | null;
}

export interface CampusData {
  bounds: CampusBounds;
  buildings: CampusBuilding[];
  center: { lat: number; lng: number };
}
