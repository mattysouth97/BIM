"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

const FLOORS = 10;
const WIDTH = 34;
const DEPTH = 24;
const STOREY = 3.5;
const HEIGHT = FLOORS * STOREY;
const DISTANCE = Math.max(HEIGHT, WIDTH, DEPTH) * 2.6;
const STUDIO = "#f5f5f5";
const BRICK = "#b85c45";
const SLAB = "#d4cfc8";
const GLASS = "#9aafbd";
const FRAME = "#eceff2";
const GROUND = "#d8d8d8";

function Massing({ exploded }: { exploded: boolean }) {
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
  const geos = useMemo(() => {
    const mass = new THREE.BoxGeometry(WIDTH, STOREY - 0.32, DEPTH);
    const slab = new THREE.BoxGeometry(WIDTH + 0.45, 0.22, DEPTH + 0.45);
    const frameLong = new THREE.BoxGeometry(2.55, 1.75, 0.22);
    const glassLong = new THREE.BoxGeometry(2.15, 1.35, 0.08);
    const frameShort = new THREE.BoxGeometry(0.22, 1.75, 2.25);
    const glassShort = new THREE.BoxGeometry(0.08, 1.35, 1.85);
    return { mass, slab, frameLong, glassLong, frameShort, glassShort };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(geos).forEach((geo) => geo.dispose());
    };
  }, [geos]);

  const longBays = 5;
  const shortBays = 3;

  return (
    <group ref={group}>
      {floors.map((i) => (
        <group key={i} position={[0, i * STOREY, 0]}>
          <mesh geometry={geos.mass} position={[0, STOREY / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={BRICK} roughness={0.88} metalness={0.04} />
          </mesh>
          <mesh
            geometry={geos.slab}
            position={[0, STOREY - 0.08, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={SLAB} roughness={0.92} metalness={0} />
          </mesh>
          {Array.from({ length: longBays }, (_, bay) => {
            const x = -WIDTH / 2 + 4.2 + bay * ((WIDTH - 8.4) / (longBays - 1));
            const y = STOREY * 0.46;
            return (
              <group key={`long-${bay}`}>
                <mesh geometry={geos.frameLong} position={[x, y, DEPTH / 2 + 0.08]}>
                  <meshStandardMaterial color={FRAME} roughness={0.45} metalness={0.08} />
                </mesh>
                <mesh geometry={geos.glassLong} position={[x, y, DEPTH / 2 + 0.18]}>
                  <meshStandardMaterial color={GLASS} roughness={0.18} metalness={0.2} />
                </mesh>
                <mesh geometry={geos.frameLong} position={[x, y, -DEPTH / 2 - 0.08]}>
                  <meshStandardMaterial color={FRAME} roughness={0.45} metalness={0.08} />
                </mesh>
                <mesh geometry={geos.glassLong} position={[x, y, -DEPTH / 2 - 0.18]}>
                  <meshStandardMaterial color={GLASS} roughness={0.18} metalness={0.2} />
                </mesh>
              </group>
            );
          })}
          {Array.from({ length: shortBays }, (_, bay) => {
            const z = -DEPTH / 2 + 4.4 + bay * ((DEPTH - 8.8) / (shortBays - 1));
            const y = STOREY * 0.46;
            return (
              <group key={`short-${bay}`}>
                <mesh geometry={geos.frameShort} position={[WIDTH / 2 + 0.08, y, z]}>
                  <meshStandardMaterial color={FRAME} roughness={0.45} metalness={0.08} />
                </mesh>
                <mesh geometry={geos.glassShort} position={[WIDTH / 2 + 0.18, y, z]}>
                  <meshStandardMaterial color={GLASS} roughness={0.18} metalness={0.2} />
                </mesh>
                <mesh geometry={geos.frameShort} position={[-WIDTH / 2 - 0.08, y, z]}>
                  <meshStandardMaterial color={FRAME} roughness={0.45} metalness={0.08} />
                </mesh>
                <mesh geometry={geos.glassShort} position={[-WIDTH / 2 - 0.18, y, z]}>
                  <meshStandardMaterial color={GLASS} roughness={0.18} metalness={0.2} />
                </mesh>
              </group>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function CameraRig() {
  const { camera, size } = useThree();

  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const d = DISTANCE * (aspect < 1.05 ? 1.75 : 1);
    camera.position.set(
      d * 0.72,
      HEIGHT * 0.38 + d * 0.4,
      d * 0.82,
    );
  }, [camera, size.width, size.height]);

  return null;
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
      shadows
      camera={{
        position: [DISTANCE * 0.72, HEIGHT * 0.42 + DISTANCE * 0.36, DISTANCE * 0.78],
        fov: 35,
        near: 1,
        far: DISTANCE * 10,
      }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      frameloop={active ? "always" : "never"}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(STUDIO);
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        scene.background = new THREE.Color(STUDIO);
      }}
    >
      <CameraRig />
      <hemisphereLight color="#b1e1ff" groundColor="#b97a20" intensity={0.6} />
      <directionalLight
        color="#ffffff"
        intensity={2}
        position={[40, 80, 30]}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={10}
        shadow-camera-far={220}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[320, 320]} />
        <meshStandardMaterial color={GROUND} roughness={1} metalness={0} />
      </mesh>
      <Grid
        args={[240, 240]}
        position={[0, 0.03, 0]}
        cellSize={5}
        cellColor="#bdbdbd"
        sectionSize={10}
        sectionColor="#9a9a9a"
        fadeDistance={180}
        fadeStrength={1.2}
        infiniteGrid
      />
      <group position={[0, 0.12, 0]} rotation={[0, 0.35, 0]}>
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
        autoRotateSpeed={0.4}
        minPolarAngle={0.7}
        maxPolarAngle={1.28}
        target={[0, HEIGHT * 0.36, 0]}
      />
    </Canvas>
  );
}
