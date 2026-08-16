import { describe, it, expect } from "vitest";
import { joinConnectedEntities } from "../join";
import type { CadEntity, CadLine, CadPolyline } from "../types";

const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadLine => ({
  id, kind: "line", layer: "DRAFT",
  a: { x: x1, y: y1 }, b: { x: x2, y: y2 },
});

const openPl = (id: string, pts: [number, number][]): CadPolyline => ({
  id, kind: "polyline", layer: "DRAFT", closed: false,
  vertices: pts.map(([x, y]) => ({ x, y })),
  bulges: pts.map(() => 0),
});

function closedOf(entities: CadEntity[]): CadPolyline[] {
  return entities.filter((e): e is CadPolyline => e.kind === "polyline" && e.closed);
}

describe("joinConnectedEntities", () => {
  it("welds four lines of a rectangle into one closed polyline", () => {
    const r = joinConnectedEntities([
      line("e0", 0, 0, 10, 0),
      line("e1", 10, 0, 10, 8),
      line("e2", 10, 8, 0, 8),
      line("e3", 0, 8, 0, 0),
    ]);
    expect(r.changed).toBe(true);
    expect(r.joinedCount).toBe(4);
    expect(r.entities).toHaveLength(1);
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0].vertices).toHaveLength(4);
    expect(r.closed[0].closed).toBe(true);
    const fp = r.closed[0];
    expect(fp.kind).toBe("polyline");
  });

  it("joins reversed segments (opposite draw direction)", () => {
    const r = joinConnectedEntities([
      line("e0", 0, 0, 4, 0),
      line("e1", 4, 3, 4, 0),
      line("e2", 0, 3, 4, 3),
      line("e3", 0, 0, 0, 3),
    ]);
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0].vertices).toHaveLength(4);
  });

  it("joins two touching lines into an open polyline", () => {
    const r = joinConnectedEntities([
      line("e0", 0, 0, 5, 0),
      line("e1", 5, 0, 5, 4),
    ]);
    expect(r.closed).toHaveLength(0);
    expect(r.entities).toHaveLength(1);
    const pl = r.entities[0] as CadPolyline;
    expect(pl.kind).toBe("polyline");
    expect(pl.closed).toBe(false);
    expect(pl.vertices).toHaveLength(3);
  });

  it("leaves disconnected lines alone", () => {
    const r = joinConnectedEntities([
      line("e0", 0, 0, 1, 0),
      line("e1", 5, 5, 6, 5),
    ]);
    expect(r.changed).toBe(false);
    expect(r.entities).toHaveLength(2);
    expect(r.entities.every((e) => e.kind === "line")).toBe(true);
  });

  it("closes an open polyline whose first and last vertices meet", () => {
    const r = joinConnectedEntities([
      openPl("e0", [[0, 0], [6, 0], [6, 4], [0, 4], [0, 0]]),
    ]);
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0].vertices).toHaveLength(4);
    expect(r.entities).toHaveLength(1);
  });

  it("joins an open polyline to a closing line", () => {
    const r = joinConnectedEntities([
      openPl("e0", [[0, 0], [8, 0], [8, 5]]),
      line("e1", 8, 5, 0, 5),
      line("e2", 0, 5, 0, 0),
    ]);
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0].vertices).toHaveLength(4);
  });

  it("seed only joins the component that touches the selection", () => {
    const r = joinConnectedEntities(
      [
        line("a0", 0, 0, 2, 0),
        line("a1", 2, 0, 2, 2),
        line("a2", 2, 2, 0, 2),
        line("a3", 0, 2, 0, 0),
        line("b0", 20, 0, 24, 0),
        line("b1", 24, 0, 24, 3),
        line("b2", 24, 3, 20, 3),
        line("b3", 20, 3, 20, 0),
      ],
      { seedIds: ["a0"] },
    );
    expect(closedOf(r.entities)).toHaveLength(1);
    expect(r.entities.filter((e) => e.kind === "line")).toHaveLength(4);
    expect(r.closed[0].id).toBe("a0");
  });

  it("does not consume an already-closed polyline", () => {
    const closed: CadPolyline = {
      id: "c0", kind: "polyline", layer: "DRAFT", closed: true,
      vertices: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }],
      bulges: [0, 0, 0, 0],
    };
    const r = joinConnectedEntities([closed, line("e0", 10, 0, 11, 0)]);
    expect(r.changed).toBe(false);
    expect(r.entities.find((e) => e.id === "c0")).toEqual(closed);
  });

  it("joins an arc and two lines into a closed D", () => {
    const r = joinConnectedEntities([
      {
        id: "arc", kind: "arc", layer: "DRAFT",
        center: { x: 0, y: 0 }, radius: 2,
        startAngle: -Math.PI / 2, endAngle: Math.PI / 2,
      },
      line("e1", 0, 2, 0, -2),
    ]);
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0].vertices.length).toBeGreaterThanOrEqual(2);
    expect(r.closed[0].bulges.some((b) => Math.abs(b) > 0)).toBe(true);
  });
});
