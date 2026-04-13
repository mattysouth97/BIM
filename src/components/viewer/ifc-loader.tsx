"use client";

/**
 * IFC Model Loader using web-ifc directly.
 *
 * WASM files must exist at `public/wasm/web-ifc.wasm`.
 * Copy from: node_modules/web-ifc/web-ifc.wasm
 */

import { useEffect, useState } from "react";
import * as THREE from "three";

interface IFCModelProps {
  fileBuffer: ArrayBuffer;
  onLoaded?: () => void;
  onError?: (error: string) => void;
}

/**
 * Dynamically import web-ifc with custom WASM path.
 * We fetch the WASM ourselves to avoid Turbopack/webpack path resolution issues.
 */
async function createIfcApi() {
  const WebIFC = await import("web-ifc");
  const api = new WebIFC.IfcAPI();

  // Custom locateFile handler to serve WASM from public/wasm/
  // This bypasses Turbopack's bundle path resolution
  await api.Init((path: string) => {
    if (path.endsWith(".wasm")) {
      return "/wasm/" + path;
    }
    return path;
  });
  return { api, WebIFC };
}

export function IFCModel({ fileBuffer, onLoaded, onError }: IFCModelProps) {
  const [meshes, setMeshes] = useState<THREE.Mesh[]>([]);

  useEffect(() => {
    let disposed = false;

    async function loadIFC() {
      try {
        const { api } = await createIfcApi();
        if (disposed) return;

        const modelID = api.OpenModel(new Uint8Array(fileBuffer));
        const loadedMeshes: THREE.Mesh[] = [];

        api.StreamAllMeshes(modelID, (mesh) => {
          const placedGeometries = mesh.geometries;

          for (let i = 0; i < placedGeometries.size(); i++) {
            const placedGeometry = placedGeometries.get(i);
            const ifcGeometry = api.GetGeometry(modelID, placedGeometry.geometryExpressID);

            const verts = api.GetVertexArray(ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize());
            const indices = api.GetIndexArray(ifcGeometry.GetIndexData(), ifcGeometry.GetIndexDataSize());

            const geometry = new THREE.BufferGeometry();
            const vertCount = verts.length / 6;
            const posFloats = new Float32Array(vertCount * 3);
            const normFloats = new Float32Array(vertCount * 3);

            for (let j = 0; j < vertCount; j++) {
              posFloats[j * 3] = verts[j * 6];
              posFloats[j * 3 + 1] = verts[j * 6 + 1];
              posFloats[j * 3 + 2] = verts[j * 6 + 2];
              normFloats[j * 3] = verts[j * 6 + 3];
              normFloats[j * 3 + 1] = verts[j * 6 + 4];
              normFloats[j * 3 + 2] = verts[j * 6 + 5];
            }

            geometry.setAttribute("position", new THREE.BufferAttribute(posFloats, 3));
            geometry.setAttribute("normal", new THREE.BufferAttribute(normFloats, 3));
            geometry.setIndex(new THREE.BufferAttribute(indices, 1));

            const matrix = new THREE.Matrix4().fromArray(placedGeometry.flatTransformation);
            geometry.applyMatrix4(matrix);

            const color = placedGeometry.color;
            const material = new THREE.MeshStandardMaterial({
              color: new THREE.Color(color.x, color.y, color.z),
              transparent: color.w < 1,
              opacity: Math.max(color.w, 0.1),
              roughness: 0.6,
              metalness: 0.1,
              side: THREE.DoubleSide,
            });

            const m = new THREE.Mesh(geometry, material);
            m.castShadow = true;
            m.receiveShadow = true;
            loadedMeshes.push(m);

            ifcGeometry.delete();
          }
        });

        if (!disposed) {
          setMeshes(loadedMeshes);
          onLoaded?.();
        }

        api.CloseModel(modelID);
      } catch (err) {
        if (!disposed) {
          onError?.(err instanceof Error ? err.message : "Failed to load IFC file");
        }
      }
    }

    loadIFC();

    return () => {
      disposed = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileBuffer]);

  if (meshes.length === 0) return null;

  return (
    <group>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  );
}
