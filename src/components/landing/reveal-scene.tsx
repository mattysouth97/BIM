"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

const FLOORS = 10;
const WIDTH = 34;
const DEPTH = 24;
const STOREY = 3.5;
const PAPER = "#f3efe6";
const CONCRETE = "#e4ddd0";
const GLASS = "#8ea8b0";
const INK = "#1b1914";

function Massing({ exploded }: { exploded: boolean }) {
  const group = useRef<THREE.Group>(null);
  const target = useRef(0);

  useFrame((_, dt) => {
    if (!group.current) return;
    const goal = exploded ? 1 : 0;
    target.current += (goal - target.current) * Math.min(1, dt * 4);
    const gap = target.current * 1.55;
    group.current.children.forEach((child, i) => {
      child.position.y = i * STOREY + i * gap;
    });
  });

  const floors = useMemo(() => Array.from({ length: FLOORS }, (_, i) => i), []);
  const slabGeo = useMemo(() => new THREE.BoxGeometry(WIDTH, 0.28, DEPTH), []);
  const sideGeo = useMemo(() => new THREE.BoxGeometry(0.28, STOREY - 0.22, DEPTH), []);
  const fillGeo = useMemo(
    () => new THREE.BoxGeometry(WIDTH - 0.7, STOREY - 0.48, DEPTH - 0.55),
    [],
  );
  const glassGeo = useMemo(
    () => new THREE.BoxGeometry(WIDTH - 0.56, STOREY - 0.42, 0.07),
    [],
  );
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(slabGeo), [slabGeo]);

  useEffect(() => {
    return () => {
      slabGeo.dispose();
      sideGeo.dispose();
      fillGeo.dispose();
      glassGeo.dispose();
      edgeGeo.dispose();
    };
  }, [slabGeo, sideGeo, fillGeo, glassGeo, edgeGeo]);

  const wallY = (STOREY - 0.22) / 2 + 0.14;

  return (
    <group ref={group} position={[0, 0, 0]}>
      {floors.map((i) => (
        <group key={i} position={[0, i * STOREY, 0]}>
          <mesh geometry={slabGeo} position={[0, 0.14, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={CONCRETE} roughness={0.9} metalness={0.02} />
          </mesh>
          <mesh geometry={sideGeo} position={[-(WIDTH / 2) + 0.14, wallY, 0]} castShadow>
            <meshStandardMaterial color={CONCRETE} roughness={0.9} metalness={0.02} />
          </mesh>
          <mesh geometry={sideGeo} position={[WIDTH / 2 - 0.14, wallY, 0]} castShadow>
            <meshStandardMaterial color={CONCRETE} roughness={0.9} metalness={0.02} />
          </mesh>
          <mesh geometry={fillGeo} position={[0, wallY, 0]}>
            <meshStandardMaterial color="#d8d1c4" roughness={1} metalness={0} />
          </mesh>
          <mesh geometry={glassGeo} position={[0, wallY, DEPTH / 2 - 0.1]}>
            <meshStandardMaterial
              color={GLASS}
              roughness={0.08}
              metalness={0.22}
              transparent
              opacity={0.42}
            />
          </mesh>
          <mesh geometry={glassGeo} position={[0, wallY, -(DEPTH / 2) + 0.1]}>
            <meshStandardMaterial
              color={GLASS}
              roughness={0.08}
              metalness={0.22}
              transparent
              opacity={0.42}
            />
          </mesh>
          <lineSegments geometry={edgeGeo} position={[0, 0.14, 0]}>
            <lineBasicMaterial color={INK} transparent opacity={0.28} />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#d8ddd4", "#b97a20", 0.7]} />
      <directionalLight
        position={[28, 42, 18]}
        intensity={1.35}
        color="#f2e6d0"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-22, 12, -16]} intensity={0.35} color="#b7c4c2" />
    </>
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
      camera={{ position: [56, 34, 62], fov: 28, near: 1, far: 400 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      frameloop={active ? "always" : "never"}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(PAPER);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.background = new THREE.Color(PAPER);
      }}
      shadows
    >
      <Lights />
      <group position={[0, 0.2, 0]} rotation={[0, 0.35, 0]}>
        <Massing exploded={exploded} />
      </group>
      <OrbitControls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={controlsRef as any}
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate={!reduced}
        autoRotateSpeed={0.35}
        minPolarAngle={0.7}
        maxPolarAngle={1.35}
        target={[0, (FLOORS * STOREY) / 2, 0]}
      />
    </Canvas>
  );
}
