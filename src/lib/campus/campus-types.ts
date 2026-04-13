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
}

export interface CampusData {
  bounds: CampusBounds;
  buildings: CampusBuilding[];
  center: { lat: number; lng: number };
}
