"use client";

import { useEffect, useState } from "react";

export interface BjdongOption {
  code: string;
  name: string;
}

export type BjdongMap = Record<string, BjdongOption[]>;

type BjdongModule = {
  default: BjdongMap;
};

type BjdongImporter = () => Promise<BjdongModule>;
export type BjdongLoader = () => Promise<BjdongMap>;

const EMPTY_OPTIONS: BjdongOption[] = [];

/**
 * Creates a lazy, cached dataset loader. Keeping the importer injectable makes
 * the cache contract directly testable without loading the production JSON.
 */
export function createBjdongDataLoader(importer: BjdongImporter) {
  let cachedPromise: Promise<BjdongMap> | null = null;

  return () => {
    if (!cachedPromise) {
      cachedPromise = importer()
        .then((module) => module.default)
        .catch((error: unknown) => {
          cachedPromise = null;
          throw error;
        });
    }
    return cachedPromise;
  };
}

export const loadBjdongData = createBjdongDataLoader(
  () => import("@/data/bjdong-codes.json") as Promise<BjdongModule>,
);

export function useBjdongOptions(
  sigunguCd: string,
  loadBjdong: BjdongLoader = loadBjdongData,
) {
  const [loaded, setLoaded] = useState<{
    sigunguCd: string;
    options: BjdongOption[];
  } | null>(null);

  useEffect(() => {
    if (!sigunguCd) return;

    let cancelled = false;

    loadBjdong()
      .then((data) => {
        if (!cancelled) {
          setLoaded({
            sigunguCd,
            options: data[sigunguCd] ?? EMPTY_OPTIONS,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({ sigunguCd, options: EMPTY_OPTIONS });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sigunguCd, loadBjdong]);

  const hasCurrentOptions = loaded?.sigunguCd === sigunguCd;
  return {
    options: sigunguCd && hasCurrentOptions ? loaded.options : EMPTY_OPTIONS,
    isLoading: Boolean(sigunguCd) && !hasCurrentOptions,
  };
}
