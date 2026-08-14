"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

const FLOORS = 10;
const WIDTH = 34;
const DEPTH = 24;
const STOREY = 3.5;
const WHITE = "#ffffff";
const BLACK = "#000000";

function WireMassing({ exploded }: { exploded: boolean }) {
  const group = useRef<THREE.Group>(null);
  const target = useRef(0);

  useFrame((_, dt) => {
    if (!group.current) return;
    const goal = exploded ? 1 : 0;
    target.current += (goal - target.current) * Math.min(1, dt * 5);
    const gap = target.current * 1.6;
    group.current.children.forEach((child, i) => {
      child.position.y = i * STOREY + i * gap;
    });
  });

  const floors = useMemo(() => Array.from({ length: FLOORS }, (_, i) => i), []);
  const box = useMemo(() => new THREE.BoxGeometry(WIDTH, STOREY, DEPTH), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(box), [box]);

  useEffect(() => {
    return () => {
      box.dispose();
      edges.dispose();
    };
  }, [box, edges]);

  return (
    <group ref={group}>
      {floors.map((i) => (
        <lineSegments key={i} geometry={edges} position={[0, i * STOREY, 0]}>
          <lineBasicMaterial color={BLACK} />
        </lineSegments>
      ))}
    </group>
  );
}

export function RevealScene({
  exploded,
  reduced,
  active,
}: {
  exploded: boolean;
  reduced: boolean;
  active: boolean;
}) {
  const controlsRef = useRef<{ autoRotate: boolean } | null>(null);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = !reduced && active && !exploded;
    }
  }, [reduced, active, exploded]);

  return (
    <Canvas
      camera={{ position: [58, 36, 64], fov: 28, near: 1, far: 400 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      frameloop={active ? "always" : "never"}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(WHITE);
        scene.background = new THREE.Color(WHITE);
      }}
    >
      <group position={[0, 0.2, 0]} rotation={[0, 0.4, 0]}>
        <WireMassing exploded={exploded} />
      </group>
      <OrbitControls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={controlsRef as any}
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate={!reduced}
        autoRotateSpeed={0.4}
        minPolarAngle={0.65}
        maxPolarAngle={1.35}
        target={[0, (FLOORS * STOREY) / 2, 0]}
      />
    </Canvas>
  );
}
