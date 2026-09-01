"use client";

import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { useRenderStore } from "@/store/render-store";
import { evaluateSun } from "@/lib/rendering/solar";
import { currentBudget, isRealisticMode, setRenderRuntime } from "@/lib/rendering/runtime";

interface ArchitecturalEnvironmentProps {
  siteExtent: number;
  buildingHeight: number;
}

/**
 * Outdoor lighting: Preetham sky, directional sun, hemisphere fill,
 * exponential fog, and a PMREM captured from the sky for IBL.
 */
export function ArchitecturalEnvironment({
  siteExtent,
  buildingHeight,
}: ArchitecturalEnvironmentProps) {
  const { gl, scene } = useThree();
  const mode = useRenderStore((s) => s.mode);
  const quality = useRenderStore((s) => s.quality);
  const timeOfDay = useRenderStore((s) => s.timeOfDay);
  const weather = useRenderStore((s) => s.weather);
  const sun = useMemo(() => evaluateSun(timeOfDay, weather), [timeOfDay, weather]);
  const budget = useMemo(() => {
    setRenderRuntime({ mode, quality, timeOfDay, weather });
    return currentBudget();
  }, [mode, quality, timeOfDay, weather]);

  const skyRef = useRef<Sky | null>(null);
  const envTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);

  useEffect(() => {
    setRenderRuntime({ mode, quality, timeOfDay, weather });
  }, [mode, quality, timeOfDay, weather]);

  useEffect(() => {
    const sky = new Sky();
    sky.scale.setScalar(Math.max(4500, siteExtent * 80));
    sky.material.toneMapped = false;
    const uniforms = sky.material.uniforms;
    uniforms["turbidity"].value = sun.turbidity;
    uniforms["rayleigh"].value = sun.rayleigh;
    uniforms["mieCoefficient"].value = sun.mieCoefficient;
    uniforms["mieDirectionalG"].value = sun.mieDirectionalG;
    uniforms["sunPosition"].value.set(
      sun.direction[0],
      sun.direction[1],
      sun.direction[2],
    );
    scene.add(sky);
    skyRef.current = sky;
    // Three.js scene/gl mutation is the R3F contract (same as SceneSetup).
    // eslint-disable-next-line react-hooks/immutability
    scene.background = null;
    scene.fog = new THREE.FogExp2(sun.fogColor, sun.fogDensity);
    // eslint-disable-next-line react-hooks/immutability -- WebGLRenderer is a mutable three.js object
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = sun.exposure;

    if (budget.envFromSky) {
      const pmrem = new THREE.PMREMGenerator(gl);
      const envScene = new THREE.Scene();
      const envSky = new Sky();
      envSky.scale.setScalar(4500);
      const envUniforms = envSky.material.uniforms;
      envUniforms["turbidity"].value = sun.turbidity;
      envUniforms["rayleigh"].value = sun.rayleigh;
      envUniforms["mieCoefficient"].value = sun.mieCoefficient;
      envUniforms["mieDirectionalG"].value = sun.mieDirectionalG;
      envUniforms["sunPosition"].value.set(
        sun.direction[0],
        sun.direction[1],
        sun.direction[2],
      );
      envScene.add(envSky);
      const rt = pmrem.fromScene(envScene, 0.04, 0.1, 2000);
      scene.environment = rt.texture;
      envTargetRef.current = rt;
      pmrem.dispose();
      envSky.geometry.dispose();
      (envSky.material as THREE.Material).dispose();
    }

    return () => {
      scene.remove(sky);
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
      skyRef.current = null;
      if (envTargetRef.current) {
        envTargetRef.current.dispose();
        envTargetRef.current = null;
      }
    };
  }, [sun, siteExtent, gl, scene, budget.envFromSky]);

  if (!isRealisticMode(mode)) return null;

  const sunDist = Math.max(40, siteExtent * 1.8);
  const shadowExtent = Math.max(siteExtent, buildingHeight) * 0.7 + 20;

  return (
    <>
      <hemisphereLight
        args={[sun.skyColor, sun.groundColor, sun.skyIntensity]}
      />
      <directionalLight
        position={[
          sun.direction[0] * sunDist,
          Math.max(8, sun.direction[1] * sunDist),
          sun.direction[2] * sunDist,
        ]}
        intensity={sun.sunIntensity}
        color={sun.sunColor}
        castShadow
        shadow-mapSize-width={budget.shadowMapSize}
        shadow-mapSize-height={budget.shadowMapSize}
        shadow-camera-far={shadowExtent * 6}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={-0.00025}
        shadow-radius={3}
      />
      {budget.contactShadows && (
        <ContactShadows
          position={[0, 0.015, 0]}
          opacity={0.42}
          scale={Math.max(30, siteExtent * 2.4)}
          blur={1.6}
          far={12}
          resolution={1024}
          color="#1a1612"
        />
      )}
    </>
  );
}
