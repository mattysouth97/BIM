"use client";

import { useEffect, useMemo } from "react";
import { useTwinDocument } from "@/hooks/use-twin-document";
import { useBimModelStore } from "@/store/bim-model-store";

export function useBimModel(buildingPk: string, locale: "ko" | "en" = "ko") {
  const twin = useTwinDocument(buildingPk, locale);
  const hydrate = useBimModelStore((s) => s.hydrate);
  const snapshot = useBimModelStore((s) => s.snapshot);

  useEffect(() => {
    if (!twin.recipe || !twin.elements || !buildingPk) return;
    hydrate({ buildingPk, recipe: twin.recipe, derived: twin.elements });
  }, [buildingPk, twin.recipe, twin.elements, hydrate]);

  const live = snapshot?.buildingPk === buildingPk ? snapshot : null;

  return useMemo(
    () => ({
      ...twin,
      model: live,
    }),
    [twin, live],
  );
}
