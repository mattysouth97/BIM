import type { ReferenceMepCoverage as MepCoverage } from "@/lib/reference-buildings/manifest";

export function ReferenceMepCoverage({ coverage, isKo }: { coverage?: MepCoverage; isKo: boolean }) {
  const n = (value: number) => value.toLocaleString("en-US");
  return (
    <section className="mt-4 border-t border-border pt-3 text-[10px] leading-relaxed text-muted-foreground" data-testid="reference-mep-coverage" data-coverage={coverage?.status ?? "not-audited"}>
      <h2 className="font-mono text-[10px] uppercase tracking-wide">{isKo ? "MEP 원본 범위" : "MEP source coverage"}</h2>
      {coverage ? <>
        <p className="mt-1.5" data-testid="reference-mep-summary">{isKo ? coverage.summary.ko : coverage.summary.en}</p>
        <p className="mt-1 font-mono text-[9px]" data-testid="reference-mep-counts">
          {isKo
            ? `원본 파일 ${n(coverage.sources.length)}개 · MEP 유형 요소 기록 ${n(coverage.typedElementCount)}개 · 배분 포트 ${n(coverage.distributionPortCount)}개`
            : `${n(coverage.sources.length)} source files · ${n(coverage.typedElementCount)} typed MEP element records · ${n(coverage.distributionPortCount)} distribution ports`}
        </p>
        <p className="mt-1">
          {isKo
            ? "파일별 기록을 합한 수이며, 복사본·분야별 버전 사이에 중복될 수 있습니다. 실제 설치된 고유 기기나 계통의 수가 아닙니다."
            : "Counts sum source-file records; copies and discipline variants can overlap. They are not counts of unique installed equipment or systems."}
        </p>
        {coverage.limitations.map((limitation, index) => <p key={index} className="mt-1.5">{isKo ? limitation.ko : limitation.en}</p>)}
        <details className="mt-2" data-testid="reference-mep-source-breakdown">
          <summary className="cursor-pointer text-foreground/80">{isKo ? "파일별 확인 결과" : "Inventory by source file"}</summary>
          {coverage.sources.map((source) => <div key={`${source.role}:${source.fileName}:${source.sha256}`} className="mt-2 border-t border-border/50 pt-1.5">
            <p className="break-words font-mono text-[9px]">{source.fileName} · {source.schema}</p>
            <p className="mt-0.5 font-mono text-[9px]">
              {isKo
                ? `MEP 요소 기록 ${n(source.typedElementCount)} · 포트 ${n(source.distributionPorts)} · IfcSystem 기록 ${n(source.systems)}`
                : `${n(source.typedElementCount)} MEP element records · ${n(source.distributionPorts)} ports · ${n(source.systems)} IfcSystem records`}
            </p>
            {Object.keys(source.entitiesByType).length > 0 ? <dl className="mt-1 text-[9px]">
              {Object.entries(source.entitiesByType).map(([type, count]) => <div key={type} className="flex justify-between gap-2">
                <dt>{type}</dt><dd className="tabular-nums">{n(count)}</dd>
              </div>)}
            </dl> : null}
          </div>)}
        </details>
      </> : <p className="mt-1.5">
        {isKo
          ? "이 모델의 MEP 원본 목록은 아직 확인되지 않았습니다. 이 상태를 설비가 없다는 뜻으로 해석할 수 없습니다."
          : "The MEP source inventory has not been established for this model. This does not establish that equipment is absent."}
      </p>}
    </section>
  );
}
