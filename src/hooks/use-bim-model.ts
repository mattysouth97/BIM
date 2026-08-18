"use client";

import { useEffect, useMemo, useState } from "react";
import { useTwinDocument } from "@/hooks/use-twin-document";
import { useBimModelStore } from "@/store/bim-model-store";
import { DEMO_BUILDING_PK } from "@/lib/constants";
import { getDemoBimSnapshot } from "@/lib/demo/demo-design";
import { getOrBuildDesign, isGeneratedPk } from "@/lib/generative/design-storage";
import type { BimModelSnapshot } from "@/lib/bim/model";

export function useBimModel(buildingPk: string, locale: "ko" | "en" = "ko") {
  const twin = useTwinDocument(buildingPk, locale);
  const hydrate = useBimModelStore((s) => s.hydrate);
  const hydrateFromSnapshot = useBimModelStore((s) => s.hydrateFromSnapshot);
  const snapshot = useBimModelStore((s) => s.snapshot);

  // A generated building's model is the one the engine emitted — columns,
  // stairs, cores, provenance and locks included. Re-deriving it from the
  // recipe would produce a generic twin that throws all of that away, so the
  // stored design is loaded and ingested whole. The reserved demo office is
  // the same shape: its floor plan lives in `getDemoBimSnapshot`, not in the
  // ledger-derived recipe. Every other pk class (ledger, CAD draft) keeps
  // the recipe path unchanged.
  const generated = isGeneratedPk(buildingPk);
  const demo = buildingPk === DEMO_BUILDING_PK;
  // The pk is carried alongside the snapshot so a design loaded for the
  // previous building can never be hydrated under the current one.
  const [loaded, setLoaded] = useState<{
    buildingPk: string;
    snapshot: BimModelSnapshot | null;
  } | null>(null);

  useEffect(() => {
    if (!generated || !buildingPk) return;
    let cancelled = false;
    void getOrBuildDesign(buildingPk)
      .then((design) => {
        if (!cancelled) setLoaded({ buildingPk, snapshot: design?.snapshot ?? null });
      })
      .catch(() => {
        // A design that cannot be loaded leaves the model empty rather than
        // silently falling back to a recipe-derived stand-in for it.
        if (!cancelled) setLoaded({ buildingPk, snapshot: null });
      });
    return () => {
      cancelled = true;
    };
  }, [buildingPk, generated]);

  const designSnapshot = loaded?.buildingPk === buildingPk ? loaded.snapshot : null;

  useEffect(() => {
    if (!buildingPk) return;
    if (demo) {
      hydrateFromSnapshot({ buildingPk, snapshot: getDemoBimSnapshot() });
      return;
    }
    if (generated) {
      if (designSnapshot) hydrateFromSnapshot({ buildingPk, snapshot: designSnapshot });
      return;
    }
    if (!twin.recipe || !twin.elements) return;
    hydrate({ buildingPk, recipe: twin.recipe, derived: twin.elements });
  }, [
    buildingPk,
    generated,
    demo,
    designSnapshot,
    twin.recipe,
    twin.elements,
    hydrate,
    hydrateFromSnapshot,
  ]);

  const live = snapshot?.buildingPk === buildingPk ? snapshot : null;

  return useMemo(
    () => ({
      ...twin,
      model: live,
    }),
    [twin, live],
  );
}
