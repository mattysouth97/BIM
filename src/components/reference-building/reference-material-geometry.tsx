"use client";

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF, useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import { MATERIAL_TEXTURE_URLS, materialPickBinding, prepareMaterialExpression, updateMaterialExpression, type MaterialBinding } from "@/lib/rendering/material-expression";
import { setReferenceShadows } from "@/lib/rendering/reference-scene";
import type { RetrofitVisualState } from "@/lib/retrofit/measure-visuals";

export type MaterialGeometryStatus = "waiting" | "loading" | "ready" | "error";
type Props = {
  url: string; manifest: ReferenceBuildingManifest; centre: THREE.Vector3;
  xray: boolean; visual: RetrofitVisualState; retry: number;
  onStatus: (status: MaterialGeometryStatus) => void;
  onPick: (binding: MaterialBinding) => void;
};

class MaterialBoundary extends Component<{ children: ReactNode; onStatus: Props["onStatus"] }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onStatus("error"); }
  render() { return this.state.failed ? null : this.props.children; }
}
function Loading({ onStatus }: Pick<Props, "onStatus">) {
  useEffect(() => { onStatus("loading"); }, [onStatus]);
  return null;
}

function MaterialGeometry({ url, manifest, centre, xray, visual, onStatus, onPick }: Props) {
  const { scene } = useGLTF(url);
  const loadedTextures = useTexture(MATERIAL_TEXTURE_URLS);
  const group = useMemo(() => new THREE.Group(), []);
  const preparedRef = useRef<ReturnType<typeof prepareMaterialExpression> | null>(null);
  useEffect(() => {
    const prepared = prepareMaterialExpression(scene, manifest, loadedTextures);
    group.add(prepared.scene);
    preparedRef.current = prepared;
    onStatus("ready");
    return () => {
      group.remove(prepared.scene);
      preparedRef.current = null;
      prepared.dispose();
    };
  // The returned array is recreated; its cached texture entries are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, manifest, group, onStatus, ...loadedTextures]);
  useEffect(() => {
    const prepared = preparedRef.current;
    if (!prepared) return;
    updateMaterialExpression(prepared, manifest.id, xray, visual);
    return setReferenceShadows(prepared.scene, xray);
  // Reapply after a newly prepared source or texture set, and on visual changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, manifest, group, xray, visual, ...loadedTextures]);
  function pick(event: ThreeEvent<MouseEvent>) {
    const binding = materialPickBinding(event.object, event.delta);
    if (!binding) return;
    event.stopPropagation();
    onPick(binding);
  }
  return <primitive object={group} position={[-centre.x, -centre.y, -centre.z]} onClick={pick} dispose={null} />;
}

export function clearMaterialGeometry(url: string) { useGLTF.clear(url); useTexture.clear(MATERIAL_TEXTURE_URLS); }
export function ReferenceMaterialGeometry(props: Props) {
  return <MaterialBoundary key={`${props.url}:${props.retry}`} onStatus={props.onStatus}>
    <Suspense fallback={<Loading onStatus={props.onStatus} />}><MaterialGeometry {...props} /></Suspense>
  </MaterialBoundary>;
}
