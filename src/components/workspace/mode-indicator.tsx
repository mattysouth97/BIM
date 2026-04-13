"use client";

import React from "react";
import { MousePointer, Layers, Box, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { useEditorModeStore, type EditorMode } from "@/store/editor-mode-store";
import { useAppStore } from "@/store/app-store";

// ---------------------------------------------------------------------------
// Mode metadata
// ---------------------------------------------------------------------------

type LucideIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

interface ModeDescriptor {
  mode: EditorMode;
  labelEn: string;
  labelKo: string;
  shortcut: string;
  Icon: LucideIcon;
}

const MODES: ModeDescriptor[] = [
  {
    mode: "navigate",
    labelEn: "Navigate",
    labelKo: "탐색",
    shortcut: "1",
    Icon: MousePointer,
  },
  {
    mode: "floor-edit",
    labelEn: "Floor Edit",
    labelKo: "층 편집",
    shortcut: "2",
    Icon: Layers,
  },
  {
    mode: "object-edit",
    labelEn: "Object Edit",
    labelKo: "객체 편집",
    shortcut: "3",
    Icon: Box,
  },
  {
    mode: "properties",
    labelEn: "Properties",
    labelKo: "속성",
    shortcut: "4",
    Icon: SlidersHorizontal,
  },
];

// ---------------------------------------------------------------------------
// ModeIndicator
// ---------------------------------------------------------------------------

export function ModeIndicator() {
  const currentMode = useEditorModeStore((s) => s.currentMode);
  const setMode = useEditorModeStore((s) => s.setMode);
  const isKo = useAppStore((s) => s.language) === "ko";

  const active = MODES.find((m) => m.mode === currentMode) ?? MODES[0];
  const { Icon } = active;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Badge
          variant="secondary"
          className="h-6 gap-1 text-[10px] cursor-pointer select-none hover:bg-secondary/80 transition-colors"
        >
          <Icon className="h-3 w-3" />
          {isKo ? active.labelKo : active.labelEn}
        </Badge>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[160px]">
        {MODES.map(({ mode, labelEn, labelKo, shortcut, Icon: ItemIcon }) => (
          <DropdownMenuItem
            key={mode}
            onClick={() => setMode(mode)}
            className={mode === currentMode ? "bg-accent text-accent-foreground" : ""}
          >
            <ItemIcon className="mr-2 h-3.5 w-3.5" />
            {isKo ? labelKo : labelEn}
            <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
