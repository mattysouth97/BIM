"use client";

// src/components/viewer/scene-environment.tsx
//
// Image-based lighting for the generative canvases.
//
// The HDR is the one bundled at /hdr/studio.hdr — the same file building-scene
// loads. drei's `preset` prop fetches from a public GitHub CDN instead, which
// rate-limits (429) and, because the loader suspends, takes the whole route
// down with it rather than merely losing reflections.
//
// The boundary is the second half of that lesson: environment lighting is a
// finish, and a finish must never be able to blank the building. On failure the
// scene keeps its hemisphere and directional lights.

import { Component, Suspense, type ReactNode } from "react";
import { Environment } from "@react-three/drei";

interface BoundaryState {
  failed: boolean;
}

class EnvironmentBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Report it — a silently missing environment map is a confusing bug to chase.
    console.warn("[scene] environment map unavailable; continuing without IBL", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function SceneEnvironment() {
  return (
    <EnvironmentBoundary>
      <Suspense fallback={null}>
        <Environment files="/hdr/studio.hdr" background={false} />
      </Suspense>
    </EnvironmentBoundary>
  );
}
