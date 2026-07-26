// src/components/cad-viewer/cad-scene.tsx
// Pure-render R3F children — no controls; the camera is driven entirely by
// the shared ViewState so it stays in lockstep with the SVG overlay.

"use client";

import { useMemo } from "react";
import { OrthographicCamera, Text } from "@react-three/drei";
import type { CadDocument } from "@/lib/cad/doc/types";
import { buildLayerGeometries } from "@/lib/cad/doc/build-geometry";
import { aciToHex } from "@/lib/cad/doc/aci-colors";
import type { ViewState } from "@/lib/cad/doc/viewport";

const MAX_TEXT_LABELS = 2000;

export function CadScene({
  doc, layerVisibility, view,
}: {
  doc: CadDocument;
  layerVisibility: Record<string, boolean>;
  view: ViewState;
}) {
  const { layers, texts } = useMemo(() => buildLayerGeometries(doc), [doc]);
  // ACI 7 is "white on dark / black on light" — remap to dark gray for the
  // light viewer background.
  const layerColor = useMemo(
    () => new Map(doc.layers.map((l) => [l.name, aciToHex(l.colorIndex === 7 ? 250 : l.colorIndex)])),
    [doc.layers],
  );

  return (
    <>
      <OrthographicCamera
        makeDefault
        position={[view.center.x, view.center.y, 10]}
        zoom={1 / view.scale}
        near={0.1}
        far={100}
      />
      {layers.map((lg) =>
        layerVisibility[lg.layer] === false ? null : (
          <lineSegments key={lg.layer} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[lg.positions, 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color={layerColor.get(lg.layer) ?? "#666666"} />
          </lineSegments>
        ),
      )}
      {texts.length <= MAX_TEXT_LABELS &&
        texts.map((t) =>
          layerVisibility[t.layer] === false ? null : (
            <Text
              key={t.entityId}
              position={[t.position.x, t.position.y, 0]}
              rotation={[0, 0, t.rotation]}
              fontSize={t.height}
              color={layerColor.get(t.layer) ?? "#666666"}
              anchorX="left"
              anchorY="bottom"
            >
              {t.text}
            </Text>
          ),
        )}
    </>
  );
}
