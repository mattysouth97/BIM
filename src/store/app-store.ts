"use client";

import { create } from "zustand";
import { versionedMigrate } from "./persist-migrate";
import { persist } from "zustand/middleware";

interface AppState {
  // API Key
  apiKey: string;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;

  // Language
  language: "ko" | "en";
  setLanguage: (lang: "ko" | "en") => void;

  // Search state
  lastSearchParams: Record<string, string> | null;
  setLastSearchParams: (params: Record<string, string> | null) => void;

  // Side panel
  sidePanelOpen: boolean;
  setSidePanelOpen: (open: boolean) => void;
  toggleSidePanel: () => void;

  // Onboarding tour
  hasSeenTour: boolean;
  setHasSeenTour: (seen: boolean) => void;

  // P2-21 — 3D renderer backend. "webgpu" is opt-in (experimental): higher
  // fidelity via three's WebGPURenderer where supported; the scene falls
  // back to WebGL when navigator.gpu is unavailable.
  rendererBackend: "webgl" | "webgpu";
  setRendererBackend: (backend: "webgl" | "webgpu") => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      apiKey: "",
      setApiKey: (key) => set({ apiKey: key }),
      clearApiKey: () => set({ apiKey: "" }),

      language: "ko",
      setLanguage: (lang) => set({ language: lang }),

      lastSearchParams: null,
      setLastSearchParams: (params) => set({ lastSearchParams: params }),

      sidePanelOpen: true,
      setSidePanelOpen: (open) => set({ sidePanelOpen: open }),
      toggleSidePanel: () => set((s) => ({ sidePanelOpen: !s.sidePanelOpen })),

      hasSeenTour: false,
      setHasSeenTour: (seen) => set({ hasSeenTour: seen }),

      rendererBackend: "webgl",
      setRendererBackend: (backend) => set({ rendererBackend: backend }),
    }),
    {
      name: "korea-building-info-storage",
      version: 1, // P2-07: initial version stamp
      migrate: versionedMigrate,
      partialize: (state) => ({
        apiKey: state.apiKey,
        language: state.language,
        sidePanelOpen: state.sidePanelOpen,
        hasSeenTour: state.hasSeenTour,
        rendererBackend: state.rendererBackend,
      }),
    }
  )
);
