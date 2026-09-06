"use client";

import { Component, Suspense, useEffect, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import type { Vector3 } from "three";
import { setReferenceShadows } from "@/lib/rendering/reference-scene";
import type { ArchitecturalDetailsStatus } from "./reference-architectural-details";

type StatusCallback = (status: ArchitecturalDetailsStatus) => void;

/** A failed cached request must be cleared before retrying the same source URL. */
export function clearArchitecturalDetails(url: string) {
  useGLTF.clear(url);
}

class DetailBoundary extends Component<{
  children: ReactNode;
  onStatus: StatusCallback;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch() { this.props.onStatus("error"); }

  render() { return this.state.failed ? null : this.props.children; }
}

function DetailLoading({ onStatus }: { onStatus: StatusCallback }) {
  useEffect(() => onStatus("loading"), [onStatus]);
  return null;
}

function DetailGeometry({ url, centre, onStatus }: {
  url: string;
  centre: Vector3;
  onStatus: StatusCallback;
}) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    // Real source meshes, including instanced geometry, use the same shadow
    // preparation as the fabric. Their authored/default materials stay intact.
    const restoreShadows = setReferenceShadows(scene);
    onStatus("ready");
    return restoreShadows;
  }, [scene, onStatus]);
  return <primitive object={scene} position={[-centre.x, -centre.y, -centre.z]} dispose={null} />;
}

/** Mount only once enabled and the fabric's original-coordinate offset is known. */
export function ReferenceDetailGeometry({ url, centre, retry, onStatus }: {
  url: string;
  centre: Vector3;
  retry: number;
  onStatus: StatusCallback;
}) {
  return (
    <DetailBoundary key={`${url}:${retry}`} onStatus={onStatus}>
      <Suspense fallback={<DetailLoading onStatus={onStatus} />}>
        <DetailGeometry url={url} centre={centre} onStatus={onStatus} />
      </Suspense>
    </DetailBoundary>
  );
}
