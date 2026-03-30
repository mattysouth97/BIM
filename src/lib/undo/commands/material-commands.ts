import type { Command } from "@/lib/undo/types";
import { useMaterialStore } from "@/store/material-store";

/**
 * Overrides a single material property path.
 * Supports coalescing via update(): rapid slider changes for the same pk+path
 * collapse into a single undo step per UNDO_REDO.md section 7.
 *
 * oldValue must be captured by the caller before constructing this command
 * (snapshot at construction time — per UNDO_REDO.md pitfall 5).
 */
export class OverrideMaterialCommand implements Command {
  readonly type = "override-material";

  constructor(
    private readonly pk: string,
    private readonly path: string,
    private readonly oldValue: unknown,
    private newValue: unknown
  ) {}

  execute(): void {
    useMaterialStore.getState().overrideProperty(this.pk, this.path, this.newValue);
  }

  undo(): void {
    useMaterialStore.getState().overrideProperty(this.pk, this.path, this.oldValue);
  }

  update(newer: Command): boolean {
    if (
      newer instanceof OverrideMaterialCommand &&
      newer.pk === this.pk &&
      newer.path === this.path
    ) {
      // Coalesce: keep original oldValue, adopt newer's newValue
      this.newValue = newer.newValue;
      return true;
    }
    return false;
  }
}
