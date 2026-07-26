// src/components/cad-viewer/viewer-toolbar.tsx
"use client";

import { Hand, MousePointer, Ruler, StickyNote, MoveUpRight, Cloud, Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCadMarkupStore, type CadTool } from "@/store/cad-markup-store";

const TOOLS: { tool: CadTool; icon: typeof Hand; ko: string; en: string }[] = [
  { tool: "pan", icon: Hand, ko: "이동", en: "Pan" },
  { tool: "select", icon: MousePointer, ko: "선택", en: "Select" },
  { tool: "measure", icon: Ruler, ko: "측정", en: "Measure" },
  { tool: "note", icon: StickyNote, ko: "메모", en: "Note" },
  { tool: "leader", icon: MoveUpRight, ko: "지시선", en: "Leader" },
  { tool: "cloud", icon: Cloud, ko: "구름", en: "Cloud" },
];

export function ViewerToolbar({ isKo, onSnapshot }: { isKo: boolean; onSnapshot: () => void }) {
  const tool = useCadMarkupStore((s) => s.tool);
  const setTool = useCadMarkupStore((s) => s.setTool);
  const clearAll = useCadMarkupStore((s) => s.clearAll);
  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-background/95 p-1 shadow-sm">
      {TOOLS.map(({ tool: t, icon: Icon, ko, en }) => (
        <Button
          key={t}
          type="button"
          size="sm"
          variant={tool === t ? "secondary" : "ghost"}
          onClick={() => setTool(t)}
          title={isKo ? ko : en}
          data-testid={`cad-tool-${t}`}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
      <div className="mx-1 h-5 w-px bg-border" />
      <Button type="button" size="sm" variant="ghost" onClick={onSnapshot} title={isKo ? "PNG 저장" : "Save PNG"}>
        <Camera className="h-4 w-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={clearAll} title={isKo ? "마크업 지우기" : "Clear markups"}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
