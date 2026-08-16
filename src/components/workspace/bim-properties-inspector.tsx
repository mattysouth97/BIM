"use client";

import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBimModelStore } from "@/store/bim-model-store";
import { parameterDefsForKind, validateModel, quantifyModel, type BimParamValue } from "@/lib/bim/model";
import { familiesForTool, type AuthoringToolId } from "@/lib/bim/family-catalog";
import { familySemantics } from "@/lib/bim/family-semantics";
import { useViewStore } from "@/lib/bim/views/view-store";

export function BimPropertiesInspector() {
  const { t, lang } = useT();
  const snapshot = useBimModelStore((s) => s.snapshot);
  const selectedId = useBimModelStore((s) => s.selectedElementId);
  const editingTypeId = useBimModelStore((s) => s.editingTypeId);
  const setEditingType = useBimModelStore((s) => s.setEditingType);
  const applyInstanceParameter = useBimModelStore((s) => s.applyInstanceParameter);
  const applyTypeParameter = useBimModelStore((s) => s.applyTypeParameter);
  const applyChangeType = useBimModelStore((s) => s.applyChangeType);
  const applyDuplicateType = useBimModelStore((s) => s.applyDuplicateType);
  const applyDelete = useBimModelStore((s) => s.applyDelete);
  const applyFlip = useBimModelStore((s) => s.applyFlip);
  const applyHide = useBimModelStore((s) => s.applyHide);
  const applyDocument = useBimModelStore((s) => s.applyDocument);
  const activeViewId = useViewStore((s) => s.activeViewId);

  const element = snapshot?.elements.find((el) => el.id === selectedId) ?? null;
  const type = element ? snapshot?.types[element.typeId] : undefined;
  const editingType = editingTypeId ? snapshot?.types[editingTypeId] : type;
  const defs = parameterDefsForKind(element?.kind ?? "wall");

  const siblingTypes = useMemo(() => {
    if (!element) return [];
    const tool = kindToTool(element.kind);
    return tool ? familiesForTool(tool) : [];
  }, [element]);

  if (!snapshot) {
    return (
      <p className="px-3 py-2 text-[10px] text-muted-foreground">
        {t("트윈이 로드되면 속성이 열립니다.", "Properties open once the twin loads.")}
      </p>
    );
  }

  const issues = validateModel(snapshot);
  const quantities = quantifyModel(snapshot);

  if (!element) {
    const viewHint = snapshot.levels.find((l) => l.id === snapshot.levels[0]?.id);
    return (
      <div className="border-b px-3 py-2 space-y-2" data-testid="bim-properties">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("뷰 속성", "View Properties")}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t(
            `${snapshot.levels.length}개 레벨 · ${snapshot.elements.length}개 객체. 객체를 선택하면 인스턴스 속성이 열립니다.`,
            `${snapshot.levels.length} levels · ${snapshot.elements.length} elements. Select an object for instance properties.`,
          )}
        </p>
        {viewHint && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t(`활성 평면 컷: 1.2 m`, `Active plan cut: 1.2 m`)}
          </p>
        )}
        <div data-testid="bim-quantities" className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">
            {t("물량", "Quantities")}
          </p>
          {quantities.slice(0, 6).map((row) => (
            <p key={row.category} className="text-[10px] text-muted-foreground">
              {row.category}: {row.count} · {row.lengthM.toFixed(1)} m · {row.areaM2.toFixed(1)} m²
            </p>
          ))}
        </div>
        {issues.length > 0 && (
          <div data-testid="bim-issues" className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              {t("검토", "Issues")} ({issues.length})
            </p>
            {issues.slice(0, 4).map((issue) => (
              <p key={issue.id} className="text-[10px] text-amber-700">
                {lang === "ko" ? issue.messageKo : issue.messageEn}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  const instanceDefs = defs.filter((d) => d.scope === "instance");
  const typeDefs = defs.filter((d) => d.scope === "type");

  return (
    <div className="border-b px-3 py-2 space-y-3" data-testid="bim-properties">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("인스턴스 속성", "Instance Properties")}
        </p>
        <p className="mt-0.5 text-[11px] font-medium">
          {lang === "ko" ? `${element.category} · ${element.mark}` : `${element.category} · ${element.mark}`}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {element.origin === "authored"
            ? t("작성된 객체", "Authored instance")
            : t("트윈에서 유도", "Generated from twin")}
          {element.hostId ? ` · host ${element.hostId}` : ""}
        </p>
      </div>

      <div className="space-y-1.5">
        {instanceDefs.map((def) => (
          <ParamRow
            key={def.name}
            label={lang === "ko" ? def.labelKo : def.labelEn}
            value={
              def.name === "mark"
                ? element.mark
                : (element.instanceParameters[def.name] ?? "")
            }
            readOnly={def.readOnly}
            dataType={def.dataType}
            onChange={(v) => applyInstanceParameter(element.id, def.name, v)}
          />
        ))}
      </div>

      {(element.ifcClass || element.emsTag || familySemantics(element.typeId)?.layers) && (
        <div className="space-y-0.5 text-[10px] text-muted-foreground" data-testid="bim-family-semantics">
          {element.ifcClass && <p>IFC {element.ifcClass}</p>}
          {element.emsTag && <p>EMS {element.emsTag}</p>}
          {element.assetId && <p>Asset {element.assetId}</p>}
          {familySemantics(element.typeId)?.layers && (
            <p>{t("레이어", "Layers")}: {familySemantics(element.typeId)!.layers!.join(" · ")}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {(element.kind === "door" || element.kind === "window") && (
          <>
            <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => applyFlip(element.id, "hand")}>
              {t("손잡이 반전", "Flip Hand")}
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => applyFlip(element.id, "facing")}>
              {t("향 반전", "Flip Facing")}
            </Button>
          </>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          onClick={() =>
            applyDocument({
              id: `tag-${element.id}`,
              kind: "tag",
              viewId: activeViewId,
              elementId: element.id,
              text: element.mark,
            })
          }
        >
          {t("태그", "Tag")}
        </Button>
        {activeViewId && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={() => applyHide(activeViewId, { elementId: element.id })}
          >
            {t("뷰에서 숨김", "Hide in view")}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          onClick={() => setEditingType(editingTypeId ? null : element.typeId)}
        >
          {editingTypeId ? t("타입 닫기", "Close Type") : t("타입 편집", "Edit Type")}
        </Button>
        {element.origin === "authored" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={() => applyDelete(element.id)}
          >
            {t("삭제", "Delete")}
          </Button>
        )}
      </div>

      {editingType && (
        <div className="rounded-md border bg-muted/30 p-2 space-y-1.5" data-testid="bim-type-editor">
          <p className="text-[10px] font-semibold">
            {t("타입", "Type")}: {lang === "ko" ? editingType.typeNameKo : editingType.typeName}
          </p>
          {siblingTypes.length > 0 && (
            <select
              className="h-6 w-full rounded border bg-background px-1 text-[10px]"
              value={element.typeId}
              onChange={(e) => applyChangeType(element.id, e.target.value)}
            >
              {siblingTypes.map((fam) => (
                <option key={fam.id} value={fam.id}>
                  {lang === "ko" ? fam.typeKo : fam.type}
                </option>
              ))}
              {!siblingTypes.some((f) => f.id === element.typeId) && (
                <option value={element.typeId}>{element.typeId}</option>
              )}
            </select>
          )}
          {typeDefs.map((def) => (
            <ParamRow
              key={def.name}
              label={lang === "ko" ? def.labelKo : def.labelEn}
              value={editingType.parameters[def.name] ?? ""}
              readOnly={def.readOnly}
              dataType={def.dataType}
              onChange={(v) => applyTypeParameter(editingType.id, def.name, v)}
            />
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={() =>
              applyDuplicateType(
                editingType.id,
                `${editingType.typeName} copy`,
              )
            }
          >
            {t("타입 복제", "Duplicate Type")}
          </Button>
        </div>
      )}
    </div>
  );
}

function ParamRow({
  label,
  value,
  readOnly,
  dataType,
  onChange,
}: {
  label: string;
  value: BimParamValue;
  readOnly?: boolean;
  dataType: "number" | "string" | "boolean";
  onChange: (v: BimParamValue) => void;
}) {
  if (dataType === "boolean") {
    return (
      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    );
  }
  return (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <Input
        className="h-6 w-24 px-1 text-[11px]"
        disabled={readOnly}
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(dataType === "number" ? Number(raw) : raw);
        }}
      />
    </label>
  );
}

function kindToTool(kind: string): AuthoringToolId | null {
  if (kind === "wall") return "wall";
  if (kind === "door") return "door";
  if (kind === "window") return "window";
  if (kind === "column") return "column";
  if (kind === "beam") return "beam";
  if (kind === "slab") return "floor";
  if (kind === "roof") return "roof";
  if (kind === "ceiling") return "ceiling";
  if (kind === "furniture") return "furniture";
  if (kind === "lighting") return "lighting";
  return null;
}
