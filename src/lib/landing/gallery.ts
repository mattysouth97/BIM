/** Gallery editorial metadata joins a generated, hash-checked manifest projection.
 * Regenerate with node scripts/build-gallery-catalogue.mjs; no card quantity is hand-typed.
 */
import registry from '@/lib/reference-buildings/registry.json';
import data from './gallery-data.json';
import { REFERENCE_BUILDING_IDS } from '@/lib/reference-buildings/manifest';

export type GalleryItemStatus = "modelling" | "published";

/** One storey datum, drawn as a line and a bar in the card's section diagram. */
export type GalleryDatum = Readonly<{
  /** The storey's own name in the model — never a translated invention. */
  name: string;
  elevationM: number;
  /** Spaces on this storey that are rooms. 0 means a datum, not a floor. */
  rooms: number;
  /** Floor area of those rooms. Drives the bar length. */
  roomAreaSqm: number;
  /** ROOF and OPEN TO BELOW spaces dropped from the two figures above. */
  excludedSpaces: number;
}>;

/** A stated figure and the thing in the model that states it. */
export type GalleryFigure = Readonly<{
  id: string;
  ko: string;
  en: string;
  value: string;
  /** e.g. "IfcWindow" — what was counted, and what was left out. */
  read: string;
}>;

export type GalleryItem = Readonly<{
  id: string;
  koTitle: string;
  enTitle: string;
  koUse: string;
  enUse: string;
  status: GalleryItemStatus;
  /** The source file, named as the model names itself. */
  modelFile: string;
  ifcSchema: string;
  viewDefinition: string;
  authoringTool: string;
  /** ISO-8601 date carried in the IFC header, not a clock reading. */
  modelDate: string;
  /** e.g. "CC BY 4.0". Rendered on the card because the licence requires it. */
  licence: string;
  /**
   * The credit line, rendered verbatim — or `null` when the rights holder is
   * not established.
   *
   * Null is not "we did not get round to it". Schependomlaan's LICENSE.MD
   * grants CC BY 4.0 but names the holder only as "original owners", while the
   * IFC header names ROOT bv as author and a README in the same repository
   * says permission was given for scientific and academic purposes. CC BY
   * grants only what the licensor actually had authority to license, so a
   * credit naming the wrong holder would be worse than none — and under CC BY
   * the credit is a condition, not a courtesy. The card says the credit is
   * unresolved rather than inventing one.
   */
  attribution: string | null;
  measuredConsumption: Readonly<{ status: 'none'; ko: string; en: string }>;
  datums: readonly GalleryDatum[];
  figures: readonly GalleryFigure[];
  /**
   * Where the card opens, or null while there is nothing to open. A gallery
   * card that navigates to a *different* building would be the same lie as a
   * card illustrated with a different building's render.
   */
  href: string | null;
}>;


export const GALLERY_ITEMS: readonly GalleryItem[] = REFERENCE_BUILDING_IDS.map(id => ({
  ...registry[id],
  ...data[id],
  status: registry[id].status as GalleryItemStatus,
  measuredConsumption: { ...registry[id].measuredConsumption, status: 'none' as const },
  href: '/models/' + id,
}));

/** Lowest and highest datum, for the section diagram's vertical range. */
export function datumRange(datums: readonly GalleryDatum[]) {
  const elevations = datums.map((d) => d.elevationM);
  return { minM: Math.min(...elevations), maxM: Math.max(...elevations) };
}

/** Storeys that hold rooms — the ones drawn as bars. */
export function occupiedDatums(datums: readonly GalleryDatum[]) {
  return datums.filter((d) => d.rooms > 0);
}

/** The largest storey floor area, which the diagram scales its bars against. */
export function widestStoreyAreaSqm(datums: readonly GalleryDatum[]) {
  return Math.max(0, ...datums.map((d) => d.roomAreaSqm));
}
