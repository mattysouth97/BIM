"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CorpusRecord } from "@/lib/corpus/schema";
import type { PublishedCorpusRelease } from "@/lib/corpus/publication";
import { useT } from "@/lib/i18n";

interface RecordPage { releaseId: string; records: CorpusRecord[]; total: number; page: number; pageSize: number; totalPages: number }
const control = "min-w-0 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const action = "inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-40";
const section = "border-t border-border py-6";

/** Read-only dataset outlet. Only published API records enter this component. */
export function CorpusBrowser() {
  const { t } = useT();
  const [releases, setReleases] = useState<PublishedCorpusRelease[] | null>(null);
  const [releaseError, setReleaseError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [releaseId, setReleaseId] = useState("");
  const [region, setRegion] = useState("");
  const [useType, setUseType] = useState("");
  const [era, setEra] = useState("");
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<{ key: string; data: RecordPage | null; error: boolean } | null>(null);
  const release = releases?.find((item) => item.releaseId === releaseId) ?? null;
  const params = new URLSearchParams({ releaseId, page: String(page), pageSize: "20" });
  if (region) params.set("region", region);
  if (useType) params.set("useType", useType);
  if (era) params.set("era", era);
  if (q) params.set("q", q);
  const query = `/api/corpus/records?${params}`;
  const data = response?.key === query ? response.data : null;
  const recordError = response?.key === query && response.error;
  const loading = Boolean(release && response?.key !== query);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/corpus/releases", { signal: controller.signal }).then(async (res) => {
      if (!res.ok) throw new Error("unavailable");
      const result = await res.json() as { releases: PublishedCorpusRelease[] };
      if (controller.signal.aborted) return;
      setReleases(result.releases);
      setReleaseId((previous) => result.releases.some((item) => item.releaseId === previous) ? previous : result.releases[0]?.releaseId ?? "");
      setReleaseError(false);
    }).catch(() => { if (!controller.signal.aborted) setReleaseError(true); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!releaseId) return;
    const controller = new AbortController();
    fetch(query, { signal: controller.signal }).then(async (res) => {
      if (!res.ok) throw new Error("unavailable");
      const result = await res.json() as RecordPage;
      if (!controller.signal.aborted) setResponse({ key: query, data: result, error: false });
    }).catch(() => { if (!controller.signal.aborted) setResponse({ key: query, data: null, error: true }); });
    return () => controller.abort();
  }, [query, releaseId, retry]);

  function chooseRelease(value: string) {
    setReleaseId(value); setRegion(""); setUseType(""); setEra(""); setDraft(""); setQ(""); setPage(1);
  }

  return <div className="mx-auto max-w-6xl px-4 py-8 font-sans [overflow-wrap:anywhere] sm:px-8 sm:py-12" data-testid="corpus-browser">
    <Link href="/" className="text-xs text-muted-foreground hover:underline">{t("모델 갤러리로", "Back to model gallery")}</Link>
    <header className="max-w-3xl pb-8 pt-6">
      <p className="text-xs font-medium text-muted-foreground">{t("공개 데이터", "Open data")}</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight">{t("건물 에너지 계산 데이터", "Building energy calculation data")}</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">{t("건축물대장에 기재된 면적과 용도에, 시기별 외피·설비 가정을 적용한 간이 계산입니다. 실측 사용량이 아니며, 국내 건물 전체를 대표하거나 실제 성능을 검증한 표본이 아닙니다.", "Screening calculations combine registered areas and use with era-based envelope and system assumptions. These are not metered consumption or a representative, validated sample of Korean buildings.")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a className={action} href="/api/corpus/dictionary">{t("데이터 사전 · 필드와 단위", "Data dictionary · fields and units")}</a>
        <a className={action} href="/api/corpus/releases">{t("릴리스 API", "Releases API")}</a>
      </div>
    </header>

    {releaseError ? <div role="alert" className={section} data-testid="corpus-unavailable">
      <p>{t("현재 데이터 저장소에 연결할 수 없습니다. 계산 데이터가 공개되었다고 확인할 수 없습니다.", "The data store is unavailable. Published calculation data cannot currently be confirmed.")}</p>
      <button className={`${action} mt-3`} onClick={() => setRetry((value) => value + 1)}>{t("다시 시도", "Retry")}</button>
    </div> : releases === null ? <p role="status">{t("공개 릴리스 확인 중…", "Loading published releases…")}</p> : releases.length === 0 ? <div className={section} data-testid="corpus-empty">
      <h2 className="text-lg font-medium">{t("아직 공개된 릴리스가 없습니다", "No published release yet")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("출처·라이선스·개인정보 검토를 통과한 데이터가 공개되면 이곳에서 제공 범위와 계산 가정을 확인할 수 있습니다.", "When a release passes source, licence and privacy review, its coverage and calculation assumptions will appear here.")}</p>
    </div> : release && <>
      <section className={section} aria-label={t("릴리스", "Release")}>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <label className="text-xs font-medium">{t("릴리스 선택", "Select release")}
            <select className={`${control} mt-2`} value={releaseId} onChange={(event) => chooseRelease(event.target.value)} data-testid="corpus-release-select">
              {releases.map((item) => <option key={item.releaseId} value={item.releaseId}>{item.releaseId} · {item.publishedAt.slice(0, 10)}</option>)}
            </select>
          </label>
          <div className="text-sm leading-6">
            <p className="font-medium">{release.recordCount.toLocaleString()} {t("개 레코드", "records")} · {t("공개일", "Published")} <time dateTime={release.publishedAt}>{release.publishedAt.slice(0, 10)}</time></p>
            <p className="mt-1 text-xs text-muted-foreground">{t("스키마", "Schema")} {release.schemaVersion} · {t("계산 엔진", "Engine")} {release.engineVersion}</p>
            <p className="mt-2">{release.coverage.description}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <a className={action} href={`/api/corpus/releases/${encodeURIComponent(releaseId)}/download`} download data-testid="corpus-download">{t("이 릴리스 전체 JSON", "Download release JSON")}</a>
          <a className={action} href={`/api/corpus/releases/${encodeURIComponent(releaseId)}`}>{t("릴리스 명세", "Release manifest")}</a>
        </div>
        <details className="mt-5 text-sm leading-6" data-testid="corpus-release-evidence">
          <summary className="cursor-pointer font-medium">{t("제공 범위 · 제외 내역 · 가정 · 변경 이력", "Coverage · exclusions · assumptions · changelog")}</summary>
          <div className="mt-4 space-y-5 text-xs text-muted-foreground">
            <p>{t("지역 코드", "Region codes")}: {release.coverage.regionCodes.join(", ")}<br />{t("용도 코드", "Use codes")}: {release.coverage.useTypeCodes.join(", ")}<br />{t("시기", "Eras")}: {release.coverage.eras.join(", ")}</p>
            <div><h3 className="font-medium text-foreground">{t("포함되지 않은 범위", "Omitted coverage")}</h3><ul className="mt-1 list-disc space-y-1 pl-5">{release.omittedCoverage.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h3 className="font-medium text-foreground">{t("제외된 입력", "Excluded inputs")}: {release.exclusionCount}</h3>{Object.entries(release.exclusionsByReason).map(([reason, count]) => <p key={reason}>{reason}: {count}</p>)}</div>
            <div><h3 className="font-medium text-foreground">{t("가정 적용 빈도", "Assumption prevalence")}</h3><ul className="mt-1 space-y-2">{release.assumptionPrevalence.map((item) => <li key={item.id}>{item.title} — {item.count}/{release.recordCount} ({(item.fraction * 100).toFixed(1)}%)</li>)}</ul></div>
            <div><h3 className="font-medium text-foreground">{t("검증 범위", "Validation scope")}</h3><p>{release.claims.internalConsistency}</p><p className="mt-2">{release.claims.stockAccuracy}</p><ul className="mt-2 list-disc pl-5">{release.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h3 className="font-medium text-foreground">{t("변경 이력", "Changelog")}</h3><ul className="mt-1 list-disc pl-5">{release.changelog.map((item) => <li key={item}>{item}</li>)}</ul>{release.previousReleaseId && <p className="mt-2">{t("이전 릴리스", "Previous release")}: {release.previousReleaseId}</p>}</div>
            <div><a className="underline" href={release.licence.url} target="_blank" rel="noreferrer">{release.licence.id}</a><p>{release.licence.statement}</p><p className="mt-2">{t("출처 코드 버전", "Source commit")}: {release.sourceCommit}</p><p>SHA-256: {release.snapshotSha256}</p></div>
          </div>
        </details>
      </section>

      <section className={section} aria-label={t("레코드 검색", "Search records")}>
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={(event) => { event.preventDefault(); setQ(draft.trim()); setPage(1); }}>
          <label className="text-xs font-medium">{t("지역 코드", "Region code")}<select className={`${control} mt-2`} value={region} onChange={(event) => { setRegion(event.target.value); setPage(1); }} data-testid="corpus-region"><option value="">{t("전체 지역", "All regions")}</option>{release.coverage.regionCodes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-medium">{t("용도 코드", "Use code")}<select className={`${control} mt-2`} value={useType} onChange={(event) => { setUseType(event.target.value); setPage(1); }} data-testid="corpus-use"><option value="">{t("전체 용도", "All uses")}</option>{release.coverage.useTypeCodes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-medium">{t("시기", "Era")}<select className={`${control} mt-2`} value={era} onChange={(event) => { setEra(event.target.value); setPage(1); }} data-testid="corpus-era"><option value="">{t("전체 시기", "All eras")}</option>{release.coverage.eras.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-medium sm:col-span-2">{t("레코드 ID · 코드 · 시기 검색", "Search record ID · code · era")}<input className={`${control} mt-2`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={100} data-testid="corpus-search" /></label>
          <button type="submit" className={`${action} self-end`}>{t("검색", "Search")}</button>
        </form>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("주소·건물명·소유자 정보는 제공하거나 검색하지 않습니다. 필터는 선택한 릴리스에 실제 포함된 코드만 표시합니다.", "Addresses, building names and owners are not exposed or searchable. Filters list only codes present in the selected release.")}</p>
        <div className="mt-6" aria-live="polite" aria-busy={loading}>
          {loading ? <p>{t("레코드 확인 중…", "Loading records…")}</p> : recordError ? <div role="alert"><p>{t("레코드를 불러올 수 없습니다. 이전 검색 결과를 대신 표시하지 않습니다.", "Records could not be loaded. No previous search results are substituted.")}</p><button className={`${action} mt-2`} onClick={() => setRetry((value) => value + 1)}>{t("다시 시도", "Retry")}</button></div> : data && <>
            <p className="mb-4 text-sm font-medium" data-testid="corpus-result-count">{data.total.toLocaleString()} {t("개 결과", "results")}</p>
            {data.records.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{t("조건에 맞는 공개 레코드가 없습니다.", "No published records match these filters.")}</p> : <ul className="divide-y divide-border border-y border-border">{data.records.map((record) => <li key={record.id}><CorpusRecordCard record={record} /></li>)}</ul>}
            {data.totalPages > 0 && <nav className="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label={t("결과 페이지", "Result pages")}>
              <button className={action} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("이전", "Previous")}</button>
              <span className="text-xs tabular-nums">{data.page} / {data.totalPages}</span>
              <button className={action} disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>{t("다음", "Next")}</button>
            </nav>}
          </>}
        </div>
      </section>
    </>}
  </div>;
}

function CorpusRecordCard({ record }: { record: CorpusRecord }) {
  const { t } = useT();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const metrics = [
    [t("계산 대상 면적", "Modeled floor area"), record.building.floorAreaSqm, "m²"],
    [t("에너지 사용 강도 · 계산", "Site intensity · modeled"), record.energy.siteKwhPerSqm, "kWh/m²·yr"],
    [t("1차 에너지 강도 · 계산", "Primary intensity · modeled"), record.energy.primaryKwhPerSqm, "kWh/m²·yr"],
    [t("연간 탄소 · 계산", "Annual carbon · modeled"), record.energy.co2Tonnes, "tCO₂/yr"],
  ] as const;
  return <article className="min-w-0 py-6" data-testid="corpus-record">
    <a className="text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground" href={record.permalink}>{record.id}</a>
    <p className="mt-2 text-xs leading-6 text-muted-foreground">{t("지역", "Region")} {record.building.regionCode} · {t("용도", "Use")} {record.building.useTypeCode} · {record.building.era} · {t("사용승인 연도", "Approval year")} {record.building.approvalYear ?? t("자료 없음", "Unavailable")}</p>
    <dl className="mt-4 grid grid-cols-2 gap-5 lg:grid-cols-4">{metrics.map(([label, value, unit]) => <div key={label} className="min-w-0"><dt className="text-xs leading-5 text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-medium tabular-nums">{value.toLocaleString(undefined, { maximumFractionDigits: 1 })}<span className="ml-1 block text-[10px] font-normal text-muted-foreground">{unit}</span></dd></div>)}</dl>
    <p className="mt-3 text-xs text-muted-foreground">{t("간이 계산 등급", "Screening grade")}: {record.energy.grade} · {t("실측·공인 인증 아님", "Not measured or certified")}</p>
    <details className="mt-4 text-xs leading-6" onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}><summary className="cursor-pointer font-medium">{t("이 레코드의 출처 · 가정 · 한계", "Record sources · assumptions · limitations")}</summary>
      {evidenceOpen && <div className="mt-3 space-y-3 text-muted-foreground">
        <p>{record.source.provider} · <a className="underline" href={record.source.endpoint}>{t("원천 API", "Source API")}</a><br />{t("원천 레코드", "Source record")}: {record.source.recordId}<br />{t("조회 시각", "Retrieved")}: {record.source.retrievedAt}<br />{t("계산 시각", "Calculated")}: {record.generatedAt}<br />{t("입력 해시", "Input hash")}: {record.source.inputHash}</p>
        <ul className="list-disc pl-5">{record.assumptions.map((item) => <li key={item.id}>{item.title} ({item.id})</li>)}</ul>
        <dl className="space-y-2" data-testid="corpus-record-provenance">{record.provenance.map((item) => <div key={item.key}><dt className="font-medium text-foreground">{item.key}</dt><dd>{item.status} · {t("참조", "references")}: {item.sourceRefCount}{item.assumptionId ? ` · ${item.assumptionId}` : ""}</dd></div>)}</dl>
        <ul className="list-disc pl-5">{record.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
        <a className="inline-block underline" href={record.permalink}>{t("전체 레코드 JSON · 단위는 데이터 사전 참조", "Full record JSON · units in data dictionary")}</a>
      </div>}
    </details>
  </article>;
}
