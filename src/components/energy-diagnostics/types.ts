import type { ReactNode } from "react";

import type {
  CanonicalEnergyModel,
  EnergyFact,
  SourceReference,
  SimulationRun,
} from "@/lib/energy-diagnostics/types";
import type {
  DrawingSetIngestionResult,
  DrawingSourceInput,
} from "@/lib/energy-diagnostics/ingestion";
import type {
  DegreeDaySimulationRun,
  SpatialEnergyMapping,
} from "@/lib/energy-diagnostics/adapter";

export type DiagnosisLocale = "ko" | "en";

export type DiagnosisSelection = Readonly<
  {
    id: string;
    documentId: string | null;
    canonicalObjectIds: readonly string[];
    threeObjectIds: readonly string[];
  } & (
    | {
      kind: "document";
    }
  | {
      kind: "source_reference";
      sourceReference: SourceReference;
    }
  | {
      kind: "energy_fact";
      fact: EnergyFact<unknown>;
    }
  | {
      kind: "thermal_zone";
    }
  | {
      kind: "simulation_result";
      runId: string;
    }
  | {
      kind: "diagnostic_finding";
    }
  )
>;

export type EnergyDiagnosisSceneContext = Readonly<{
  locale: DiagnosisLocale;
  model: CanonicalEnergyModel;
  selected: DiagnosisSelection | null;
  baselineRun: DegreeDaySimulationRun | null;
  scenarioRun: DegreeDaySimulationRun | null;
  activeRun: DegreeDaySimulationRun | null;
  spatialResults: SpatialEnergyMapping | null;
  onSelectZone: (zoneId: string) => void;
  onSelectObject: (canonicalObjectId: string) => void;
}>;

/**
 * Stages an entry method may open on. A model that arrives already built and
 * already simulated (the building-register path) should land on its result,
 * not on a drawing-extraction review that has nothing to review.
 */
export type DiagnosisEntryStage =
  | "drawings"
  | "review"
  | "model"
  | "preflight"
  | "simulation"
  | "compare";

export type EnergyDiagnosisWorkspaceProps = Readonly<{
  className?: string;
  locale?: DiagnosisLocale;
  initialModel?: CanonicalEnergyModel | null;
  /** Overrides the stage an initialModel would otherwise open on. */
  initialStage?: DiagnosisEntryStage;
  /**
   * The sources an `initialModel` was built from. Required for a pre-built
   * model to be savable: persistence is content-addressed, so it needs the
   * source bytes behind every document hash. These are NOT re-ingested.
   */
  initialModelSources?: readonly DrawingSourceInput[];
  /**
   * Starts the bundled sample through the same ingestion, validation, engine,
   * persistence, and result pipeline as uploaded sources. It is an entry
   * method, not a parallel demo mode.
   */
  autoLoadSample?: boolean;
  /** Restore one durable diagnostic before initializing a new entry method. */
  restoreProjectId?: string;
  /**
   * Sources produced by an in-product geometry authoring tool. They enter the
   * exact same ingestion boundary as uploaded files and retain their origin.
   */
  initialDrawingSources?: readonly DrawingSourceInput[];
  /** Hide the sample shortcut after the user explicitly chose Upload. */
  showSampleOption?: boolean;
  /** Existing BuildingScene is supplied here; this feature never creates a parallel viewer. */
  renderScene?: (context: EnergyDiagnosisSceneContext) => ReactNode;
  onModelChange?: (model: CanonicalEnergyModel) => void;
  onDrawingSetIngested?: (
    result: DrawingSetIngestionResult,
    sources: readonly DrawingSourceInput[],
  ) => void;
  onSelectionChange?: (selection: DiagnosisSelection | null) => void;
  onSimulationRun?: (run: SimulationRun) => void;
  /** Called only after IndexedDB has durably accepted the project bundle. */
  onProjectSaved?: (projectId: string) => void;
}>;
