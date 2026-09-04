// src/app/building/[id]/raw-pk-not-routable.tsx
// Friendlier explanation for a raw 건축물대장 mgmBldrgstPk in the URL — see
// isRawLedgerPk in src/lib/constants.ts for why this can't be a redirect.

import Link from "next/link";

export default function RawPkNotRoutable({ id }: { id: string }) {
  return (
    <div className="flex h-[70vh] w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-bold tracking-tight text-muted-foreground">404</p>
      <div>
        <h2 className="text-lg font-semibold">이 관리번호로는 바로 열 수 없습니다</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <code className="rounded bg-muted px-1 py-0.5">{id}</code> looks like a
          건축물대장 관리번호(mgmBldrgstPk), not a routable building id — search
          for the building by name or address instead.
        </p>
      </div>
      <Link
        href="/diagnostics/new?method=ledger"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        건물 검색으로 이동 / Go to building search
      </Link>
    </div>
  );
}
