import type { Command } from "@/lib/undo/types";
import { usePlanStore } from "@/store/plan-store";
import type { WallSegment, Opening, Room } from "@/store/plan-store";

/**
 * Adds a wall segment to the plan store.
 * On undo, removes the wall (and its openings were already removed by the store).
 */
export class AddWallCommand implements Command {
  readonly type = "add-wall";

  constructor(private readonly wall: WallSegment) {}

  execute(): void {
    usePlanStore.getState().addWall(this.wall);
  }

  undo(): void {
    usePlanStore.getState().removeWall(this.wall.id);
  }
}

/**
 * Removes a wall segment from the plan store.
 * Snapshots dependent openings at construction time so they can be restored on undo.
 * Per UNDO_REDO.md section 8 Case 1: dependent objects must be restored in correct order.
 */
export class RemoveWallCommand implements Command {
  readonly type = "remove-wall";
  private readonly dependentOpenings: Opening[];

  constructor(private readonly wall: WallSegment) {
    // Snapshot dependent openings at construction time — IDs captured, not regenerated.
    this.dependentOpenings = usePlanStore
      .getState()
      .openings.filter((o) => o.wallId === this.wall.id);
  }

  execute(): void {
    // Remove dependent openings first, then the wall
    const state = usePlanStore.getState();
    for (const opening of this.dependentOpenings) {
      state.removeOpening(opening.id);
    }
    state.removeWall(this.wall.id);
  }

  undo(): void {
    // Restore wall first, then re-add dependent openings
    const state = usePlanStore.getState();
    state.addWall(this.wall);
    for (const opening of this.dependentOpenings) {
      state.addOpening(opening);
    }
  }
}

/**
 * Replaces the room set atomically.
 * Used in compound commands to undo wall-triggered room detection as one step (per D-10).
 */
export class SetRoomsCommand implements Command {
  readonly type = "set-rooms";

  constructor(
    private readonly previousRooms: Room[],
    private readonly newRooms: Room[]
  ) {}

  execute(): void {
    usePlanStore.getState().setRooms(this.newRooms);
  }

  undo(): void {
    usePlanStore.getState().setRooms(this.previousRooms);
  }
}

/**
 * Adds an opening (door/window) to a wall.
 */
export class AddOpeningCommand implements Command {
  readonly type = "add-opening";

  constructor(private readonly opening: Opening) {}

  execute(): void {
    usePlanStore.getState().addOpening(this.opening);
  }

  undo(): void {
    usePlanStore.getState().removeOpening(this.opening.id);
  }
}

/**
 * Removes an opening from a wall.
 */
export class RemoveOpeningCommand implements Command {
  readonly type = "remove-opening";

  constructor(private readonly opening: Opening) {}

  execute(): void {
    usePlanStore.getState().removeOpening(this.opening.id);
  }

  undo(): void {
    usePlanStore.getState().addOpening(this.opening);
  }
}
