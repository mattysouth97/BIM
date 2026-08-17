"use client";

// src/store/generative-session-store.ts
//
// The generative studio's session state: design history, locks, selection,
// persistent design rules, the pending change awaiting review, and design
// options.
//
// NOT persisted. A design state holds a full BIM snapshot — thousands of
// elements — and several of those live in history at once; that belongs in
// memory, not in localStorage where it would blow the quota and resurrect a
// stale building on the next visit. Durable storage is a separate concern from
// "what am I working on right now".

import { create } from "zustand";

import type {
  AppliedEdit,
  DesignPayload,
  GenerationResult,
  ModificationScope,
  ProviderSummary,
  RejectedEdit,
} from "@/lib/generative/client";
import {
  publishGeneratedDesign,
  unpublishGeneratedDesign,
} from "@/lib/generative/energy/publish-design";
import {
  branchTips,
  canRedo,
  canUndo,
  commit,
  currentNode,
  emptyHistory,
  flatten,
  goTo,
  redo,
  undo,
  type DesignHistory,
  type DesignNode,
  type DesignNodeKind,
} from "@/lib/generative/session/history";

/** A complete, viewable design — one node of the history tree. */
export interface DesignState extends DesignPayload {
  generationId: string;
  revision: number;
  seed: number;
  provider: ProviderSummary;
}

export interface PendingChange {
  /** The candidate design, already built and validated server-side. */
  edit: AppliedEdit;
  kind: Extract<DesignNodeKind, "modify" | "repair">;
  /** The design it was computed against — the "before" side of the diff. */
  baseNodeId: string;
}

export interface DesignOption {
  id: string;
  label: string;
  seed: number;
  state: "running" | "ready" | "failed";
  result?: GenerationResult;
  error?: string;
}

interface SessionState {
  /**
   * The pk the API routes stamp onto emitted BIM elements. It is a REQUEST
   * parameter, not an identity: every route defaults it to "generated" and
   * element provenance has always read that way. Left alone deliberately —
   * the energy stores key on `energyPk` instead, so two designs no longer
   * collide on one record (see `publishDesignEnergy`).
   */
  buildingPk: string;
  /**
   * pk the CURRENT design is published under in the material/recipe/active
   * building stores — always `DesignState.generationId`. null when the
   * session holds no design.
   */
  energyPk: string | null;
  history: DesignHistory<DesignState>;

  /**
   * The brief that started this session, in full. Design options are generated
   * from it, so the truncated history label will not do.
   */
  sourcePrompt: string | null;

  /** Lock tokens — see `lib/generative/session/locks.ts`. */
  locks: string[];
  /** Persistent project memory, replayed into every request (§120, §121). */
  designRules: string[];

  selection: { navId: string; scope: ModificationScope } | null;
  /** Isolate the current selection in the 3D view. */
  isolate: boolean;

  pending: PendingChange | null;
  /** The rejection surface — shown instead of a diff when nothing applied. */
  lastRejection: RejectedEdit | null;

  options: DesignOption[];
  optionPrompt: string | null;

  /* --- derived --- */
  current: () => DesignState | null;
  currentNodeId: () => string | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  rows: () => ReturnType<typeof flatten<DesignState>>;
  tips: () => DesignNode<DesignState>[];

  /* --- actions --- */
  startFrom: (result: GenerationResult, prompt: string) => void;
  proposeEdit: (edit: AppliedEdit, kind: "modify" | "repair") => void;
  rejectEdit: (edit: RejectedEdit) => void;
  acceptPending: () => void;
  discardPending: () => void;
  clearRejection: () => void;

  undo: () => void;
  redo: () => void;
  goTo: (nodeId: string) => void;

  toggleLock: (token: string) => void;
  isLocked: (token: string) => boolean;
  clearLocks: () => void;

  addDesignRule: (rule: string) => void;
  removeDesignRule: (rule: string) => void;

  select: (navId: string, scope: ModificationScope) => void;
  clearSelection: () => void;
  setIsolate: (value: boolean) => void;

  beginOptions: (prompt: string, options: DesignOption[]) => void;
  settleOption: (id: string, patch: Partial<DesignOption>) => void;
  adoptOption: (id: string) => void;
  clearOptions: () => void;

  reset: () => void;
}

let nodeCounter = 0;
/** Monotonic within a session — history ids never need to survive a reload. */
function nextNodeId(prefix: string): string {
  nodeCounter += 1;
  return `${prefix}-${nodeCounter}`;
}

function stateFromGeneration(result: GenerationResult): DesignState {
  return {
    spec: result.spec,
    recipe: result.recipe,
    snapshot: result.snapshot,
    metrics: result.metrics,
    validation: result.validation,
    status: result.status,
    approximations: result.approximations,
    generationId: result.generationId,
    revision: result.revision ?? 0,
    seed: result.seed,
    provider: result.provider,
  };
}

function stateFromEdit(edit: AppliedEdit, seed: number): DesignState {
  return {
    spec: edit.spec,
    recipe: edit.recipe,
    snapshot: edit.snapshot,
    metrics: edit.metrics,
    validation: edit.validation,
    status: edit.status,
    approximations: edit.approximations,
    generationId: edit.generationId,
    revision: edit.revision,
    seed,
    provider: edit.provider,
  };
}

/* ------------------------------------------------------------------ */
/* Energy publication                                                  */
/* ------------------------------------------------------------------ */

// The publish/unpublish pair lives in `lib/generative/energy/publish-design.ts`
// so the /building/GEN-… workspace seeds the same three stores the same way.

/** Session-local alias — the store publishes whatever design is current. */
const publishDesignEnergy = (design: DesignState, previousPk: string | null): void => {
  publishGeneratedDesign(design, previousPk);
};

const unpublishDesignEnergy = unpublishGeneratedDesign;

export const useGenerativeSession = create<SessionState>((set, get) => {
  /**
   * History navigation changes which design is current, so the energy stores
   * must follow it — an undo that left the panel reading the abandoned design
   * would be showing numbers for a building nobody can see.
   */
  const navigate = (next: DesignHistory<DesignState>): void => {
    const previousPk = get().energyPk;
    const payload = currentNode(next)?.payload ?? null;
    set({ history: next, pending: null, energyPk: payload?.generationId ?? null });
    if (payload) publishDesignEnergy(payload, previousPk);
    else if (previousPk) unpublishDesignEnergy(previousPk);
  };

  return {
  buildingPk: "generated",
  energyPk: null,
  history: emptyHistory<DesignState>(),
  sourcePrompt: null,
  locks: [],
  designRules: [],
  selection: null,
  isolate: false,
  pending: null,
  lastRejection: null,
  options: [],
  optionPrompt: null,

  current: () => currentNode(get().history)?.payload ?? null,
  currentNodeId: () => get().history.currentId,
  canUndo: () => canUndo(get().history),
  canRedo: () => canRedo(get().history),
  rows: () => flatten(get().history),
  tips: () => branchTips(get().history),

  startFrom: (result, prompt) => {
    const payload = stateFromGeneration(result);
    const previousPk = get().energyPk;
    set((s) => ({
      history: commit(s.history, {
        id: nextNodeId("gen"),
        kind: "generate",
        label: prompt.length > 64 ? `${prompt.slice(0, 64)}…` : prompt,
        detail: `${result.metrics.floorCount} levels · ${Math.round(result.metrics.grossAreaSqm).toLocaleString()} m²`,
        createdAt: Date.now(),
        payload,
        // A fresh generation is a new root, never a child of the old design.
        parentId: null,
      }),
      energyPk: payload.generationId,
      sourcePrompt: prompt,
      pending: null,
      lastRejection: null,
      selection: null,
      isolate: false,
    }));
    publishDesignEnergy(payload, previousPk);
  },

  proposeEdit: (edit, kind) =>
    set((s) => {
      const baseNodeId = s.history.currentId;
      if (!baseNodeId) return s;
      return { pending: { edit, kind, baseNodeId }, lastRejection: null };
    }),

  rejectEdit: (edit) => set({ lastRejection: edit, pending: null }),

  acceptPending: () => {
    const state = get();
    const pending = state.pending;
    if (!pending) return;

    const base = state.history.nodes[pending.baseNodeId];
    const seed = base?.payload.seed ?? pending.edit.spec.generationSeed;
    const payload = stateFromEdit(pending.edit, seed);
    const previousPk = state.energyPk;

    // Branch from the design the edit was computed against, not from whatever
    // happens to be current — the diff the user approved describes THAT pair.
    set((s) => ({
      history: commit(s.history, {
        id: nextNodeId(pending.kind),
        kind: pending.kind,
        label: pending.edit.patch.summary,
        detail:
          pending.kind === "repair"
            ? `resolved ${pending.edit.resolvedCodes?.length ?? 0} issue(s)`
            : (pending.edit.scope?.label ?? undefined),
        createdAt: Date.now(),
        payload,
        parentId: pending.baseNodeId,
      }),
      energyPk: payload.generationId,
      pending: null,
    }));
    publishDesignEnergy(payload, previousPk);
  },

  discardPending: () => set({ pending: null }),
  clearRejection: () => set({ lastRejection: null }),

  undo: () => navigate(undo(get().history)),
  redo: () => navigate(redo(get().history)),
  goTo: (nodeId) => navigate(goTo(get().history, nodeId)),

  toggleLock: (token) =>
    set((s) => ({
      locks: s.locks.includes(token)
        ? s.locks.filter((t) => t !== token)
        : [...s.locks, token],
    })),
  isLocked: (token) => get().locks.includes(token),
  clearLocks: () => set({ locks: [] }),

  addDesignRule: (rule) =>
    set((s) => {
      const trimmed = rule.trim();
      if (!trimmed || s.designRules.includes(trimmed)) return s;
      return { designRules: [...s.designRules, trimmed] };
    }),
  removeDesignRule: (rule) =>
    set((s) => ({ designRules: s.designRules.filter((r) => r !== rule) })),

  select: (navId, scope) => set({ selection: { navId, scope } }),
  clearSelection: () => set({ selection: null, isolate: false }),
  setIsolate: (value) => set({ isolate: value }),

  beginOptions: (prompt, options) => set({ optionPrompt: prompt, options }),
  settleOption: (id, patch) =>
    set((s) => ({
      options: s.options.map((option) =>
        option.id === id ? { ...option, ...patch } : option,
      ),
    })),
  adoptOption: (id) => {
    const state = get();
    const option = state.options.find((o) => o.id === id);
    const result = option?.result;
    if (!option || !result) return;

    const payload = stateFromGeneration(result);
    const previousPk = state.energyPk;
    const current = currentNode(state.history);

    set((s) => ({
      history: commit(s.history, {
        id: nextNodeId("option"),
        kind: "option",
        label: option.label,
        detail: `seed ${option.seed} · ${Math.round(result.metrics.grossAreaSqm).toLocaleString()} m²`,
        createdAt: Date.now(),
        payload,
        // An option is an ALTERNATIVE to the current design, so it hangs off
        // the same parent — a sibling, not a descendant.
        parentId: current?.parentId ?? null,
      }),
      energyPk: payload.generationId,
      options: [],
      optionPrompt: null,
      pending: null,
    }));
    publishDesignEnergy(payload, previousPk);
  },
  clearOptions: () => set({ options: [], optionPrompt: null }),

  reset: () => {
    const previousPk = get().energyPk;
    set({
      history: emptyHistory<DesignState>(),
      energyPk: null,
      sourcePrompt: null,
      locks: [],
      designRules: [],
      selection: null,
      isolate: false,
      pending: null,
      lastRejection: null,
      options: [],
      optionPrompt: null,
    });
    // "New building" abandons the session — its energy records go with it.
    if (previousPk) unpublishDesignEnergy(previousPk);
  },
  };
});
