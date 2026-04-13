# Enhanced 3D Building Viewer + Material Properties — Design Spec

## Goal

Upgrade the parametric 3D building viewer from colored boxes to structurally accurate, material-property-rich building models that serve as the spatial foundation for energy simulation. Support IFC/glTF file upload for buildings where real architectural models exist.

## Context

- **Who:** GX (Green Transformation) team — accuracy, reliability, and simulation readiness are non-negotiable
- **Current state:** Box-per-floor viewer with color-coded use types, orbit controls, floor selection
- **End state:** Structurally accurate models with comprehensive material properties, ready to feed ECO2 energy evaluation software
- **Data constraint:** Building ledger API provides metadata (height, floors, areas, structure, use, dates) but no geometry. Real footprints available via cadastral API (optional). Full geometry only via IFC upload.

## Architecture

Two rendering paths share the same Three.js canvas:

```
BuildingScene
├── ModelSource: "parametric" | "uploaded"
├── ParametricRenderer (default for all buildings)
│   ├── FootprintProvider → cadastral API or estimated rectangle
│   ├── ExtrudedFloorMeshes → from footprint polygon
│   ├── FacadeGenerator → era + structure + use → materials, windows, patterns
│   ├── RoofGenerator → roofCd → flat/gable/hip geometry
│   └── MaterialPropertyStore → thermal/glazing/HVAC data per element
└── UploadedModelRenderer (when user provides IFC/glTF)
    ├── IFCLoader (web-ifc-three) → parse .ifc → Three.js meshes
    ├── GLTFLoader → parse .gltf/.glb → Three.js meshes
    └── MaterialPropertyStore → extract from IFC or manual input
```

The `MaterialPropertyStore` is shared — it attaches physical properties to every building element regardless of rendering path. This is what makes the model simulation-ready.

---

## 1. Enhanced Parametric Renderer

### 1.1 Cadastral Footprint Integration

- New API route: `GET /api/cadastral/footprint?sigunguCd=X&bjdongCd=X&bun=X&ji=X`
- Queries 국토교통부 GIS건물통합정보 API for building polygon
- Returns GeoJSON coordinates or `null`
- `building-geometry.ts` gains `footprintPolygon?: [number, number][]` field
- When present: `ExtrudeGeometry` uses the real polygon shape
- When null: falls back to estimated rectangle (current behavior)
- Non-blocking: viewer renders immediately with rectangle, swaps when API responds

### 1.2 PBR Materials by Structure Type

Map `strctCd` (structure code) to physically-based rendering materials:

| strctCd | Structure | Material | Roughness | Metalness | Color |
|---------|-----------|----------|-----------|-----------|-------|
| 11 | RC (철근콘크리트) | Concrete | 0.9 | 0.0 | #B8B0A8 |
| 12 | SRC (철골철근콘크리트) | Concrete + metal trim | 0.7 | 0.2 | #A8A0A0 |
| 13 | Steel (철골) | Metal panel / curtain wall | 0.3 | 0.6 | #C0C8D0 |
| 14 | Precast | Smooth concrete panel | 0.6 | 0.05 | #C8C0B8 |
| 15 | Timber (목조) | Wood | 0.85 | 0.0 | #B08050 |
| 21-24 | Masonry/Brick | Brick | 0.9 | 0.0 | #A05030 |

### 1.3 Era-Based Facade Generation

Building permit date (`pmsDay`) determines facade style:

| Era | Window Ratio | Window Style | Facade Pattern | Floor Height |
|-----|-------------|-------------|----------------|-------------|
| Pre-1970 | 0.15-0.20 | Small, spaced | Exposed brick/plaster | 2.7-3.0m |
| 1970-1989 | 0.20-0.30 | Uniform grid, small | Painted concrete | 2.7m res / 3.3m com |
| 1990-1999 | 0.25-0.35 | Aluminum frame | Tile cladding | 2.8m res / 3.6m com |
| 2000-2009 | 0.30-0.45 | Double-glazed | Stone/aluminum panels | 2.9m res / 3.8m com |
| 2010-2019 | 0.35-0.55 | High-perf glazing | Composite panels | 2.9m res / 3.9m com |
| 2020+ | 0.40-0.60 | Triple glazing / smart | BIPV / modular panels | 3.0m res / 4.0m com |

Use type further modifies:
- Apartment (02000): balcony indents, uniform window grid
- Office (14000): curtain wall glass, larger window ratio
- Factory (17000): corrugated metal, minimal windows, potential saw-tooth roof
- Retail (07000): large ground-floor glazing, signage zone
- Medical (09000): regular window pattern, entrance canopy

### 1.4 Roof Generation

Based on `roofCd`:
- Code 1 / "평" → Flat slab with parapet
- Code 2 / "박공" → Gable roof (triangular prism)
- Code 3 / "기타" → Hip roof (truncated pyramid)
- "(철근)콘크리트" → Flat concrete slab (most common for RC buildings)

### 1.5 Procedural Window Texture

Generate window grid texture per facade:
1. Calculate window count from: floor area ÷ assumed window spacing (era-dependent)
2. Create canvas-based texture with window rectangles at correct ratio
3. Apply as emissive map (windows glow slightly for realism)
4. Ground floor gets larger openings (entrance, retail glazing)

---

## 2. Material Property System

Every building element carries physical properties for energy simulation. This is the data layer that makes the 3D model useful for the GX team.

### 2.1 Data Model

```typescript
interface MaterialProperties {
  // Source tracking
  source: "code-estimate" | "ifc-import" | "user-input" | "energy-cert";
  confidence: "estimated" | "measured" | "certified";

  envelope: {
    walls: WallAssembly[];
    roof: RoofAssembly;
    groundFloor: FloorAssembly;
    windows: GlazingProperties;
    foundation: FoundationProperties;
    airtightness: AirtightnessProperties;
  };

  hvac: HVACProperties;
  lighting: LightingProperties;
  renewable: RenewableProperties;
  occupancy: OccupancyProfile;
}

interface WallAssembly {
  orientation: "N" | "S" | "E" | "W";
  uValue: number;                    // W/(m²·K)
  rValue: number;                    // (m²·K)/W
  layers: MaterialLayer[];
  thermalBridge: number;             // W/(m·K) linear thermal bridge coefficient
  surfaceArea: number;               // m²
}

interface MaterialLayer {
  name: string;                      // e.g. "콘크리트", "EPS 단열재"
  thickness: number;                 // mm
  thermalConductivity: number;       // W/(m·K)
  density: number;                   // kg/m³
  specificHeat: number;              // J/(kg·K)
  vaporPermeability?: number;        // ng/(Pa·s·m)
}

interface RoofAssembly {
  uValue: number;
  layers: MaterialLayer[];
  solarReflectance: number;          // 0-1
  emissivity: number;                // 0-1
  greenRoofCoverage: number;         // 0-1
}

interface FloorAssembly {
  uValue: number;
  layers: MaterialLayer[];
  groundContactResistance: number;   // (m²·K)/W
}

interface GlazingProperties {
  uValue: number;                    // W/(m²·K) combined frame+glass
  shgc: number;                      // Solar Heat Gain Coefficient (0-1)
  vlt: number;                       // Visible Light Transmittance (0-1)
  glassType: "single" | "double" | "triple";
  coating: "none" | "low-e" | "reflective";
  gasFill: "air" | "argon" | "krypton";
  frameMaterial: "aluminum" | "pvc" | "wood" | "thermal-break-aluminum";
  airLeakageRate: number;            // L/(s·m²) at 75Pa
  shadingCoefficient: number;
  windowToWallRatio: {               // per orientation
    N: number; S: number; E: number; W: number;
  };
}

interface FoundationProperties {
  perimeterInsulationUValue: number; // W/(m²·K)
  groundTemperature: number;         // °C (regional)
  moistureBarrier: "none" | "polyethylene" | "bituminous";
}

interface AirtightnessProperties {
  ach50: number;                     // Air Changes per Hour at 50Pa
  equivalentLeakageArea: number;     // cm²/m²
  testMethod: "blower-door" | "estimated";
}

interface HVACProperties {
  heating: {
    systemType: "individual" | "central" | "district";
    fuelType: "gas" | "electric" | "oil" | "district-heat" | "heat-pump";
    efficiency: number;              // COP for heat pump, AFUE for boiler
    capacity: number;                // kW
  };
  cooling: {
    systemType: "split" | "central-chiller" | "vrf" | "none";
    efficiency: number;              // EER or COP
    capacity: number;                // kW
    refrigerant?: string;            // R410A, R32, etc.
  };
  ventilation: {
    type: "natural" | "mechanical-exhaust" | "mechanical-supply" | "heat-recovery";
    heatRecoveryEfficiency: number;  // 0-1 (0 if no HRV)
    airflowRate: number;             // m³/h
  };
  dhw: {
    systemType: "gas-boiler" | "electric" | "heat-pump" | "solar-thermal";
    efficiency: number;
    storageVolume: number;           // liters
  };
}

interface LightingProperties {
  lightingPowerDensity: number;      // W/m²
  controlType: "manual" | "occupancy-sensor" | "daylight-dimming" | "combined";
  lampType: "fluorescent" | "led" | "halogen";
}

interface RenewableProperties {
  solarPV: {
    installed: boolean;
    capacity: number;                // kWp
    panelType: "monocrystalline" | "polycrystalline" | "thin-film";
    tiltAngle: number;               // degrees
    orientation: number;             // azimuth degrees (180=south)
    area: number;                    // m²
  };
  solarThermal: {
    installed: boolean;
    collectorArea: number;           // m²
    efficiency: number;
  };
  geothermal: {
    installed: boolean;
    systemType: "closed-loop" | "open-loop";
    cop: number;
  };
}

interface OccupancyProfile {
  occupancyDensity: number;          // persons/m²
  weekdaySchedule: number[];         // 24 values (0-1) for hourly occupancy
  weekendSchedule: number[];
  internalHeatGain: number;          // W/m² from equipment
  hotWaterDemand: number;            // L/person/day
}
```

### 2.2 Inference Engine

`src/lib/material-inference.ts` — pure function:

```
inferMaterialProperties(title: BrTitleInfo, floors: BrFloorInfo[]) → MaterialProperties
```

Uses: permit date + structure code + use code + floor count + area → full property set.

Inference sources (priority order):
1. Korean Building Energy Code minimums for the permit year (법적 최소 기준)
2. Structure type → wall/floor composition
3. Use type → occupancy profile, lighting, HVAC assumptions
4. Era → window type, insulation level, airtightness
5. Region (from sigunguCd) → ground temperature, climate zone

### 2.3 Data Source Labeling

Every displayed value shows its provenance:
- **"규정 기반 추정"** (Code-based estimate) — inferred from building code + era
- **"설계 데이터"** (Design data) — from IFC file import
- **"에너지효율등급"** (Energy cert) — from certification data API
- **"사용자 입력"** (User input) — manually entered/overridden

### 2.4 Assembly Workflow (3-Step Guided System)

Non-expert users (GX team, not MEP engineers) define building systems through a 3-step progressive workflow:

**Step 1 — Guided Wizard (설비 기본 설정)**
- User answers simple verification questions about the public data baseline
  - "Is the primary heating gas or electric?" (건축물대장 has partial HVAC info)
  - "Are windows single, double, or triple glazed?"
  - "Is there mechanical ventilation?"
- System filters the equipment library and generates a baseline asset list
- Pre-populated from inference engine (era + structure + use) — user confirms or corrects

**Step 2 — Spatial Pinning (설비 배치)**
- User drags equipment icons from the wizard's list onto the 2D floor plan view
  - Boilers, AHUs, chillers, heat pumps, solar panels, etc.
- System assigns location tags and creates preliminary thermal zones based on proximity
- Each floor is divided into zones (perimeter, core, special-use)
- Equipment placement determines which zones they serve

**Step 3 — Node Graph (시스템 연결)**
- System auto-generates a diagram of heating/cooling/ventilation piping and wiring
- User reviews and corrects any incorrect connections
- Drag to rewire: boiler → AHU → zone, chiller → FCU → zone, etc.
- System finalizes semantic relationships (compatible with Brick Schema for future EMS integration)
- Validated system topology feeds into energy simulation inputs

**Key design principles:**
- Each step narrows complexity — wizard handles 80% of cases, spatial pinning adds location, node graph adds relationships
- User never manually enters raw numbers unless they choose to (always start from intelligent defaults)
- Changes at any step propagate: moving equipment updates zones, reconnecting updates the simulation model

### 2.5 Material Property Panel

A collapsible panel in the 3D viewer showing properties for the selected element:
- Click a wall → shows wall assembly layers, U-value, orientation
- Click a window → shows glazing type, SHGC, VLT, frame material
- Click roof → shows roof assembly, solar reflectance
- Click equipment (from spatial pinning) → shows HVAC specs, efficiency, served zones
- Each value is editable (override inferred with actual)
- Changes marked as "사용자 입력" source
- Panel shows data source badge for every value

---

## 3. IFC/glTF Model Loader

### 3.1 Upload Flow

1. "Upload Model" button in viewer overlay
2. Drag-and-drop zone accepts `.ifc`, `.gltf`, `.glb`
3. File type detection → route to loader
4. IFC: `web-ifc-three` parses client-side → Three.js mesh hierarchy
5. glTF/GLB: Three.js `GLTFLoader`
6. Model replaces parametric building in scene
7. Building ledger metadata panel remains
8. Model stored in IndexedDB keyed by building PK

### 3.2 IFC Property Extraction

When loading IFC files, extract:
- `IfcBuildingStorey` → floor identification
- `IfcMaterialLayerSet` → wall/floor/roof compositions → override inferred materials
- `IfcWindowType` → glazing properties
- `IfcSpace` → zone boundaries for future energy overlay
- `IfcPropertySet` → any custom properties (thermal, acoustic)

### 3.3 Model Toggle

- "Parametric" / "Uploaded" toggle in viewer when both are available
- Parametric always exists as fallback
- Material properties persist across toggle (attached to building, not model)

---

## 4. Data Integrity

- Values of 0 from API displayed as "-" (already implemented)
- Every data point labeled with source
- Confidence badge on the 3D model: "Estimated Geometry" vs "Architectural Model"
- Inferred material properties show Korean building code reference year
- Export capability preserves source labels

---

## 5. File Structure

```
src/
├── lib/
│   ├── building-geometry.ts         # Modified: add footprintPolygon, era logic
│   ├── material-inference.ts        # NEW: era+structure+use → MaterialProperties
│   ├── material-types.ts            # NEW: all material property interfaces
│   └── korean-building-codes.ts     # NEW: code minimums by year (U-values, etc.)
├── components/
│   └── viewer/
│       ├── building-scene.tsx       # Modified: ModelSource toggle, material store
│       ├── building-model.tsx       # Modified: ExtrudeGeometry from polygon
│       ├── floor-mesh.tsx           # Modified: PBR materials, facade texture
│       ├── facade-generator.tsx     # NEW: procedural facade per era+use
│       ├── roof-generator.tsx       # NEW: flat/gable/hip roof geometry
│       ├── window-texture.ts        # NEW: canvas-based window grid texture
│       ├── model-uploader.tsx       # NEW: drag-drop upload UI
│       ├── ifc-loader.tsx           # NEW: web-ifc-three integration
│       ├── gltf-loader.tsx          # NEW: GLTFLoader wrapper
│       ├── material-panel.tsx       # NEW: property inspector/editor panel
│       ├── equipment-wizard.tsx     # NEW: Step 1 guided wizard for HVAC/systems
│       ├── spatial-pinning.tsx      # NEW: Step 2 drag-drop equipment onto floor plan
│       ├── node-graph.tsx           # NEW: Step 3 system connection diagram
│       └── viewer-overlay.tsx       # Modified: upload button, model toggle
├── app/
│   └── api/
│       └── cadastral/
│           └── footprint/route.ts   # NEW: cadastral footprint proxy
└── store/
    └── material-store.ts            # NEW: Zustand store for material properties per building
```

---

## 6. Out of Scope (Later Phases)

- ECO2 input file export (circle back later per user request)
- Energy consumption data integration (건축HUB 건물에너지정보 API)
- Weather data / heating-cooling degree day analysis
- Energy simulation engine
- Heat map overlays on 3D model
- VWorld 3D model download integration
