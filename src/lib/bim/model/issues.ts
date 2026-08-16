// BIM validation — actionable issues, not silent failures.

export type IssueSeverity = "info" | "warning" | "error";

export interface BimIssue {
  id: string;
  severity: IssueSeverity;
  code: string;
  messageKo: string;
  messageEn: string;
  elementId?: string;
}

import type { BimModelSnapshot } from "./types";

export function validateModel(model: BimModelSnapshot): BimIssue[] {
  const issues: BimIssue[] = [];
  const marks = new Map<string, string[]>();

  for (const el of model.elements) {
    if ((el.kind === "door" || el.kind === "window") && el.origin === "authored" && !el.hostId) {
      issues.push({
        id: `host-${el.id}`,
        severity: "warning",
        code: "UNHOSTED_OPENING",
        messageKo: `${el.mark}에 호스트 벽이 없습니다.`,
        messageEn: `${el.mark} has no host wall.`,
        elementId: el.id,
      });
    }
    if (el.kind === "room") {
      const number = String(el.instanceParameters.number ?? el.mark);
      const list = marks.get(number) ?? [];
      list.push(el.id);
      marks.set(number, list);
    }
    if (el.origin === "authored" && !el.mark) {
      issues.push({
        id: `mark-${el.id}`,
        severity: "warning",
        code: "MISSING_MARK",
        messageKo: "번호(Mark)가 비어 있습니다.",
        messageEn: "Mark is empty.",
        elementId: el.id,
      });
    }
    if (el.levelId && !model.levels.some((l) => l.id === el.levelId)) {
      issues.push({
        id: `level-${el.id}`,
        severity: "error",
        code: "ORPHAN_LEVEL",
        messageKo: `${el.mark}가 삭제된 레벨을 참조합니다.`,
        messageEn: `${el.mark} references a missing level.`,
        elementId: el.id,
      });
    }
  }

  for (const [number, ids] of marks) {
    if (ids.length < 2) continue;
    for (const elementId of ids) {
      issues.push({
        id: `dup-${elementId}`,
        severity: "warning",
        code: "DUPLICATE_ROOM",
        messageKo: `실 번호 ${number}가 중복됩니다.`,
        messageEn: `Room number ${number} is duplicated.`,
        elementId,
      });
    }
  }

  return issues;
}
