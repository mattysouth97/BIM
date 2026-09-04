"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/** `[ax, ay, az, bx, by, bz, progressA, progressB, isSupply]` */
type FlowSegment = readonly number[];

type FlowDocument = Readonly<{
  kind: string;
  wavelengthM: number | null;
  segments: readonly FlowSegment[];
}>;

/**
 * Colours per discipline: what is downstream of plant, and what is on its way
 * back. The cyan/slate pair is the twin's existing air language
 * (`layer-5-ventilation.ts`), kept so the two views read as the same product.
 */
export const FLOW_COLOUR: Record<string, readonly [string, string]> = {
  hvac: ["#67e8f9", "#8fa3b8"],
  plumbing: ["#7dd3fc", "#e0a882"],
};

/**
 * A faint continuous line with pulses running along it, in the direction the
 * model states.
 *
 * `lineProgress` arrives as distance-from-origin already divided by a fixed
 * wavelength in metres, so a pulse occupies a physical length rather than a
 * fraction of the building. That keeps a 122 m duct run reading as long, and
 * makes two buildings of different sizes animate at the same apparent speed.
 */
const vertexShader = /* glsl */ `
  attribute float lineProgress;
  attribute vec3 color;
  varying float vLineProgress;
  varying vec3 vColor;
  void main() {
    vLineProgress = lineProgress;
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying float vLineProgress;
  varying vec3 vColor;
  void main() {
    float travel = fract(vLineProgress - uTime * 0.34);
    // A long tail behind a bright head: the pulse has to survive being drawn
    // one pixel wide over a dense duct model, so the resting line is bright
    // enough to trace and the head is bright enough to follow.
    float pulse = pow(1.0 - travel, 4.0);
    vec3 tinted = mix(vColor, vec3(1.0), pulse * 0.6);
    gl_FragColor = vec4(tinted, (0.34 + pulse * 0.66) * uOpacity);
  }
`;

/**
 * One discipline's routed network, animated along its stated direction.
 *
 * Fetched rather than bundled, and only when the layer is switched on: the
 * Clinic's HVAC network is 220 KB of coordinates and a reader who never opens
 * the layer should never pay for it.
 */
export function FlowNetwork({
  url,
  centre,
  layerId,
  opacity = 1,
}: {
  url: string;
  /** The fabric's offset, so flow stays registered with the building. */
  centre: THREE.Vector3;
  layerId: string;
  opacity?: number;
}) {
  const [doc, setDoc] = useState<FlowDocument | null>(null);
  const material = useRef<THREE.ShaderMaterial | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    let live = true;
    void fetch(url, { signal: abort.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((parsed: unknown) => {
        if (!live) return;
        const value = parsed as FlowDocument | null;
        // A 404 arrives as an HTML error page, not as a throw.
        if (value?.kind === "bimfit_flow_network") setDoc(value);
      })
      .catch(() => {
        /* Aborted on unmount, or offline. The layer simply has no flow. */
      });
    return () => {
      live = false;
      abort.abort();
    };
  }, [url]);

  const geometry = useMemo(() => {
    if (!doc?.segments.length) return null;
    const [supplyHex, returnHex] =
      FLOW_COLOUR[layerId] ?? (["#9ecfe0", "#a8a29e"] as const);
    const supply = new THREE.Color(supplyHex);
    const back = new THREE.Color(returnHex);

    const count = doc.segments.length;
    const positions = new Float32Array(count * 6);
    const progress = new Float32Array(count * 2);
    const colors = new Float32Array(count * 6);

    for (let i = 0; i < count; i += 1) {
      const s = doc.segments[i];
      positions.set([s[0], s[1], s[2], s[3], s[4], s[5]], i * 6);
      progress[i * 2] = s[6];
      progress[i * 2 + 1] = s[7];
      const c = s[8] === 1 ? supply : back;
      colors.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("lineProgress", new THREE.BufferAttribute(progress, 1));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [doc, layerId]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  useFrame((state) => {
    if (material.current) {
      material.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  if (!geometry) return null;

  return (
    <lineSegments
      geometry={geometry}
      frustumCulled={false}
      renderOrder={20}
      position={[-centre.x, -centre.y, -centre.z]}
    >
      <shaderMaterial
        ref={material}
        uniforms={{
          uTime: { value: 0 },
          uOpacity: { value: opacity },
        }}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}
