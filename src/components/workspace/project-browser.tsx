"use client";

import { useMemo } from "react";
import { Box, FileSpreadsheet, LayoutTemplate, Layers } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useViewStore } from "@/lib/bim/views/view-store";
import { useSheetStore } from "@/lib/bim/sheets/sheet-store";
import { SEED_SCHEDULES } from "@/lib/bim/schedules/schedule-definitions";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useBimModelStore } from "@/store/bim-model-store";
import { REVIT_FEATURE_MAP } from "@/lib/workflow/revit-workflow";
import {
  AUTHORING_TOOLS,
  familiesForTool,
  familyTypeLabel,
} from "@/lib/bim/family-catalog";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function ProjectBrowser() {
  const { t, lang } = useT();
  const views = useViewStore((s) => s.views);
  const activeViewId = useViewStore((s) => s.activeViewId);
  const setActiveView = useViewStore((s) => s.setActiveView);
  const sheets = useSheetStore((s) => s.sheets);
  const activeSheetId = useSheetStore((s) => s.activeSheetId);
  const setActiveSheet = useSheetStore((s) => s.setActiveSheet);
  const setWorkMode = useRevitWorkflowStore((s) => s.setWorkMode);
  const setActiveScheduleId = useRevitWorkflowStore((s) => s.setActiveScheduleId);
  const activeScheduleId = useRevitWorkflowStore((s) => s.activeScheduleId);
  const selectedFamilyId = useRevitWorkflowStore((s) => s.selectedFamilyId);
  const setSelectedFamilyId = useRevitWorkflowStore((s) => s.setSelectedFamilyId);
  const levels = useBimModelStore((s) => s.snapshot?.levels ?? []);
  const elements = useBimModelStore((s) => s.snapshot?.elements ?? []);
  const selectedElementId = useBimModelStore((s) => s.selectedElementId);
  const selectElement = useBimModelStore((s) => s.selectElement);
  const activeLevelId = useBimModelStore((s) => s.activeLevelId);
  const setActiveLevel = useBimModelStore((s) => s.setActiveLevel);
  const walls = elements.filter((el) => el.kind === "wall");
  const doors = elements.filter((el) => el.kind === "door");
  const windows = elements.filter((el) => el.kind === "window");
  const rooms = elements.filter((el) => el.kind === "room");

  const plans = views.filter((v) => v.kind === "plan");
  const elevations = views.filter((v) => v.kind === "elevation");
  const sections = views.filter((v) => v.kind === "section");
  const threed = views.filter((v) => v.kind === "3d");
  const schedules = useMemo(() => Object.values(SEED_SCHEDULES), []);
  const wiredCount = REVIT_FEATURE_MAP.filter((f) => f.status === "wired").length;

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="project-browser">
      <div className="shrink-0 border-b px-3 py-2">
        <p className="text-xs font-semibold">{t("프로젝트 브라우저", "Project Browser")}</p>
        <p className="text-[10px] text-muted-foreground">
          {t(
            `모델 · 뷰 · 일람표 · 시트 · ${wiredCount}개 레빗 기능 연결`,
            `Model · Views · Schedules · Sheets · ${wiredCount} Revit features wired`
          )}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Accordion
          type="multiple"
          defaultValue={["levels", "views", "schedules", "sheets", "families"]}
          className="w-full"
        >
          <AccordionItem value="levels" className="border-b">
            <AccordionTrigger className="px-3 py-2 text-xs font-semibold hover:no-underline">
              <span className="flex items-center gap-1.5">
                <Layers className="size-3.5" />
                {t("레벨 · 모델", "Levels · Model")}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-1 pb-2">
              <BrowserGroup label={t("레벨", "Levels")}>
                {levels.length === 0 ? (
                  <EmptyRow text={t("트윈 로드 후 생성", "Created after the twin loads")} />
                ) : (
                  levels.map((level) => (
                    <BrowserRow
                      key={level.id}
                      label={`${level.name}  ${level.elevation.toFixed(2)} m`}
                      active={activeLevelId === level.id}
                      onClick={() => {
                        setActiveLevel(level.id);
                        if (level.associatedViewId) {
                          setActiveView(level.associatedViewId);
                          setWorkMode("views");
                        }
                      }}
                    />
                  ))
                )}
              </BrowserGroup>
              <BrowserGroup label={t("벽", "Walls")}>
                {walls.slice(0, 12).map((el) => (
                  <BrowserRow
                    key={el.id}
                    label={el.mark}
                    active={selectedElementId === el.id}
                    onClick={() => {
                      selectElement(el.id);
                    }}
                  />
                ))}
              </BrowserGroup>
              <BrowserGroup label={t("문 / 창", "Doors / Windows")}>
                {[...doors, ...windows].slice(0, 16).map((el) => (
                  <BrowserRow
                    key={el.id}
                    label={`${el.mark} · ${el.family}`}
                    active={selectedElementId === el.id}
                    onClick={() => {
                      selectElement(el.id);
                    }}
                  />
                ))}
              </BrowserGroup>
              <BrowserGroup label={t("실", "Rooms")}>
                {rooms.map((el) => (
                  <BrowserRow
                    key={el.id}
                    label={String(el.instanceParameters.name ?? el.mark)}
                    active={selectedElementId === el.id}
                    onClick={() => selectElement(el.id)}
                  />
                ))}
              </BrowserGroup>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="views" className="border-b">
            <AccordionTrigger className="px-3 py-2 text-xs font-semibold hover:no-underline">
              <span className="flex items-center gap-1.5">
                <Box className="size-3.5" />
                {t("뷰", "Views")}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-1 pb-2">
              <BrowserGroup label={t("평면", "Floor Plans")}>
                {plans.length === 0 ? (
                  <EmptyRow text={t("레시피 로드 후 생성", "Created after recipe loads")} />
                ) : (
                  plans.map((view) => (
                    <BrowserRow
                      key={view.id}
                      label={view.name}
                      active={activeViewId === view.id}
                      onClick={() => {
                        setActiveView(view.id);
                        setWorkMode("views");
                      }}
                    />
                  ))
                )}
              </BrowserGroup>
              <BrowserGroup label={t("입면", "Elevations")}>
                {elevations.map((view) => (
                  <BrowserRow
                    key={view.id}
                    label={view.name}
                    active={activeViewId === view.id}
                    onClick={() => {
                      setActiveView(view.id);
                      setWorkMode("views");
                    }}
                  />
                ))}
              </BrowserGroup>
              {sections.length > 0 && (
                <BrowserGroup label={t("단면", "Sections")}>
                  {sections.map((view) => (
                    <BrowserRow
                      key={view.id}
                      label={view.name}
                      active={activeViewId === view.id}
                      onClick={() => {
                        setActiveView(view.id);
                        setWorkMode("views");
                      }}
                    />
                  ))}
                </BrowserGroup>
              )}
              <BrowserGroup label={t("3D 뷰", "3D Views")}>
                {threed.map((view) => (
                  <BrowserRow
                    key={view.id}
                    label={view.name}
                    active={activeViewId === view.id}
                    onClick={() => {
                      setActiveView(view.id);
                      setWorkMode("views");
                    }}
                  />
                ))}
                <BrowserRow
                  label={t("자유 카메라", "Free camera")}
                  active={activeViewId === null}
                  onClick={() => setActiveView(null)}
                />
              </BrowserGroup>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="schedules" className="border-b">
            <AccordionTrigger className="px-3 py-2 text-xs font-semibold hover:no-underline">
              <span className="flex items-center gap-1.5">
                <FileSpreadsheet className="size-3.5" />
                {t("일람표", "Schedules")}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-1 pb-2">
              {schedules.map((schedule) => (
                <BrowserRow
                  key={schedule.id}
                  label={schedule.name}
                  active={activeScheduleId === schedule.id}
                  onClick={() => {
                    setActiveScheduleId(schedule.id);
                    setWorkMode("schedules");
                  }}
                />
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sheets" className="border-b">
            <AccordionTrigger className="px-3 py-2 text-xs font-semibold hover:no-underline">
              <span className="flex items-center gap-1.5">
                <LayoutTemplate className="size-3.5" />
                {t("시트", "Sheets")}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-1 pb-2">
              {sheets.length === 0 ? (
                <EmptyRow text={t("시트 작업에서 생성", "Create from the Sheets work mode")} />
              ) : (
                sheets.map((sheet) => (
                  <BrowserRow
                    key={sheet.id}
                    label={`${sheet.titleBlock.sheetNumber} ${sheet.name}`}
                    active={activeSheetId === sheet.id}
                    onClick={() => {
                      setActiveSheet(sheet.id);
                      setWorkMode("sheets");
                    }}
                  />
                ))
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="families" className="border-b-0">
            <AccordionTrigger className="px-3 py-2 text-xs font-semibold hover:no-underline">
              <span className="flex items-center gap-1.5">
                <Layers className="size-3.5" />
                {t("패밀리", "Families")}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-1 pb-2">
              <p className="px-3 pb-1 text-[10px] text-muted-foreground">
                {t(
                  "패밀리 작성은 스튜디오 도면에서 합니다. 3D는 생성된 결과를 봅니다.",
                  "Place families on the studio schematic. 3D reviews the compiled result."
                )}
              </p>
              {AUTHORING_TOOLS.map((tool) => (
                <BrowserGroup
                  key={tool.id}
                  label={t(tool.categoryKo, tool.categoryEn)}
                >
                  {familiesForTool(tool.id).map((family) => (
                    <BrowserRow
                      key={family.id}
                      label={familyTypeLabel(family, lang === "ko" ? "ko" : "en")}
                      active={selectedFamilyId === family.id}
                      onClick={() => {
                        setSelectedFamilyId(
                          selectedFamilyId === family.id ? null : family.id
                        );
                      }}
                    />
                  ))}
                </BrowserGroup>
              ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

function BrowserGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1.5">
      <p className="px-3 py-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function BrowserRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center truncate px-3 py-1 text-left text-[11px]",
        active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-3 py-1 text-[10px] text-muted-foreground">{text}</p>;
}
