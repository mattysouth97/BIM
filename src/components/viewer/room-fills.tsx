"use client";

import { useMemo, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { usePlanStore } from "@/store/plan-store";
import { useAppStore } from "@/store/app-store";
import { buildWallGraph, detectRooms } from "@/lib/plan/room-detector";
import { ROOM_TYPES, type RoomType } from "@/lib/plan/room-types";
import type { Room } from "@/store/plan-store";

// Ordered cycle for room type clicking
const ROOM_TYPE_CYCLE: RoomType[] = [
  "living",
  "bedroom",
  "kitchen",
  "bathroom",
  "custom",
];

/**
 * Create a CanvasTexture with room name + area label.
 */
function createRoomLabelTexture(
  label: string,
  area: string
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext("2d")!;

  // Transparent background
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Semi-transparent backing
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  const pad = 6;
  const textW = size - pad * 2;
  ctx.beginPath();
  ctx.roundRect(pad, pad, textW, canvas.height - pad * 2, 6);
  ctx.fill();

  // Label text
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 - 12);

  // Area text
  ctx.font = "22px sans-serif";
  ctx.fillStyle = "#e0e0e0";
  ctx.fillText(area, canvas.width / 2, canvas.height / 2 + 16);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * RoomFills — renders colored semi-transparent room polygons on the plan grid,
 * with Sprite labels showing room name + area at the polygon centroid.
 *
 * Only visible in plan view mode.
 */
export function RoomFills() {
  const walls = usePlanStore((s) => s.walls);
  const rooms = usePlanStore((s) => s.rooms);
  const setRooms = usePlanStore((s) => s.setRooms);
  const setRoomType = usePlanStore((s) => s.setRoomType);
  const activeFloor = usePlanStore((s) => s.activeFloor);
  const viewMode = usePlanStore((s) => s.viewMode);
  const language = useAppStore((s) => s.language);

  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useThree();

  // Detect rooms reactively from walls on this floor
  const detectedRooms = useMemo(() => {
    const floorWalls = walls.filter((w) => w.floor === activeFloor);
    if (floorWalls.length < 3) return [];
    const graph = buildWallGraph(floorWalls);
    return detectRooms(graph);
  }, [walls, activeFloor]);

  // Sync detected rooms into store, preserving existing types
  useEffect(() => {
    if (detectedRooms.length === 0) {
      // Clear rooms for this floor only
      setRooms(rooms.filter((r) => r.floor !== activeFloor));
      return;
    }

    const existingRooms = rooms.filter((r) => r.floor === activeFloor);

    // Build a map from centroid key -> existing room type for type preservation
    const existingTypeMap = new Map<string, RoomType>();
    for (const r of existingRooms) {
      const key = `${r.centroid[0].toFixed(2)},${r.centroid[1].toFixed(2)}`;
      existingTypeMap.set(key, r.type);
    }

    const newRooms: Room[] = detectedRooms.map((d, i) => {
      const centKey = `${d.centroid[0].toFixed(2)},${d.centroid[1].toFixed(2)}`;
      const existingType = existingTypeMap.get(centKey);
      return {
        id: existingRooms[i]?.id ?? crypto.randomUUID(),
        polygon: d.polygon,
        area: d.area,
        centroid: d.centroid,
        type: existingType ?? "custom",
        floor: activeFloor,
      };
    });

    // Merge: keep rooms from other floors + new rooms for activeFloor
    const otherFloorRooms = rooms.filter((r) => r.floor !== activeFloor);
    setRooms([...otherFloorRooms, ...newRooms]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedRooms, activeFloor]);

  // Handle room fill click to cycle type
  const handleRoomClick = useCallback(
    (roomId: string, currentType: RoomType) => {
      const idx = ROOM_TYPE_CYCLE.indexOf(currentType);
      const nextType = ROOM_TYPE_CYCLE[(idx + 1) % ROOM_TYPE_CYCLE.length];
      setRoomType(roomId, nextType);
    },
    [setRoomType]
  );

  // Only render in plan mode
  if (viewMode !== "plan") return null;

  const activeRooms = rooms.filter((r) => r.floor === activeFloor);

  return (
    <group ref={groupRef}>
      {activeRooms.map((room) => {
        const typeInfo = ROOM_TYPES[room.type];
        const color = typeInfo.color;
        const labelText =
          language === "ko" ? typeInfo.nameKo : typeInfo.name;
        const areaText = `${room.area.toFixed(1)}m²`;

        // Build THREE.Shape from polygon
        const shape = new THREE.Shape();
        if (room.polygon.length >= 3) {
          shape.moveTo(room.polygon[0][0], room.polygon[0][1]);
          for (let i = 1; i < room.polygon.length; i++) {
            shape.lineTo(room.polygon[i][0], room.polygon[i][1]);
          }
          shape.closePath();
        }

        const geometry = new THREE.ShapeGeometry(shape);

        return (
          <group key={room.id}>
            {/* Room fill polygon — rotated from XY to XZ plane */}
            <mesh
              geometry={geometry}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.01, 0]}
              onPointerDown={(e) => {
                e.stopPropagation();
                handleRoomClick(room.id, room.type);
              }}
            >
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.20}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>

            {/* Room label Sprite at centroid */}
            <RoomLabel
              key={`${room.id}-label`}
              cx={room.centroid[0]}
              cz={room.centroid[1]}
              label={labelText}
              area={areaText}
            />
          </group>
        );
      })}
    </group>
  );
}

interface RoomLabelProps {
  cx: number;
  cz: number;
  label: string;
  area: string;
}

function RoomLabel({ cx, cz, label, area }: RoomLabelProps) {
  const spriteRef = useRef<THREE.Sprite | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    const texture = createRoomLabelTexture(label, area);
    textureRef.current = texture;

    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      sizeAttenuation: true,
      transparent: true,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.set(cx, 0.1, cz);
    sprite.scale.set(1.6, 0.8, 1);
    spriteRef.current = sprite;

    return () => {
      texture.dispose();
      material.dispose();
    };
  }, [cx, cz, label, area]);

  if (!spriteRef.current) {
    // Trigger creation on first render
    const texture = createRoomLabelTexture(label, area);
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      sizeAttenuation: true,
      transparent: true,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(cx, 0.1, cz);
    sprite.scale.set(1.6, 0.8, 1);
    spriteRef.current = sprite;
  }

  return <primitive object={spriteRef.current} />;
}
