// src/lib/plan-symbols/library/index.ts
//
// Merges the eight section files (see sections.ts for the ninth, metadata-
// only "system-kit" section, which never gets a library file) into one
// table and registers it with registry.ts. Importing this module is what
// makes symbolFor() start returning hand-authored graphs instead of tool
// defaults — importing library/architecture.ts etc. directly does not
// register anything by itself.

import type { SymbolGraph } from "../graph-types";
import { registerSymbols } from "../registry";
import { architectureSymbols } from "./architecture";
import { electricalSymbols } from "./electrical";
import { energyBemsSymbols } from "./energy-bems";
import { furnitureSiteSymbols } from "./furniture-site";
import { mechanicalSymbols } from "./mechanical";
import { plumbingFireSymbols } from "./plumbing-fire";
import { structureSymbols } from "./structure";

export const ALL_LIBRARY_SYMBOLS: Record<string, SymbolGraph> = {
  ...architectureSymbols,
  ...structureSymbols,
  ...mechanicalSymbols,
  ...electricalSymbols,
  ...plumbingFireSymbols,
  ...energyBemsSymbols,
  ...furnitureSiteSymbols,
};

registerSymbols(ALL_LIBRARY_SYMBOLS);
