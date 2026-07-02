"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";

interface GLTFModelProps {
  fileBuffer: ArrayBuffer;
  fileName: string;
  onLoaded?: () => void;
  onError?: (error: string) => void;
}

export function GLTFModel({ fileBuffer, fileName, onLoaded, onError }: GLTFModelProps) {
  const [scene, setScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    async function loadGLTF() {
      try {
        const loader = new GLTFLoader();
        const blob = new Blob([fileBuffer]);
        const url = URL.createObjectURL(blob);

        loader.load(
          url,
          (gltf) => {
            // Enable shadows on all meshes
            gltf.scene.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Ensure materials are standard
                if (child.material) {
                  const mat = child.material as THREE.MeshStandardMaterial;
                  if (mat.roughness === undefined) mat.roughness = 0.5;
                  if (mat.metalness === undefined) mat.metalness = 0.1;
                }
              }
            });

            setScene(gltf.scene);
            onLoaded?.();
            URL.revokeObjectURL(url);
          },
          undefined,
          (error) => {
            onError?.(error.message || "Failed to load glTF/GLB file");
            URL.revokeObjectURL(url);
          }
        );
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "Failed to load model");
      }
    }

    loadGLTF();

    return () => {
      if (scene) {
        scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) child.material.dispose();
          }
        });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileBuffer, fileName]);

  if (!scene) return null;

  return <primitive object={scene} />;
}
