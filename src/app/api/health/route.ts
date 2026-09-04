// src/app/api/health/route.ts
// Deploy verification, self-proving. Every deploy today was verified by
// observing behaviour and *trusting* a session's report that the deployment was
// built from the commit it claimed — nothing in any response exposed a commit,
// so that link was never measured. This route closes it: fetch it after a
// deploy and assert `commit` equals the SHA you pushed.
//
// `region` is the second segment of `X-Vercel-Id` seen from the inside. It must
// read `icn1`: api.vworld.kr refuses Vercel's `iad1` egress, so a function that
// moves back to the default region silently degrades every GIS read to the
// 건축면적-solved rectangle (see vercel.json and AGENTS.md).

import { NextResponse } from "next/server";

// Never cached, belt and braces. A verification step that can return stale data
// is worse than no verification, because people trust it: an edge-cached answer
// would serve the PREVIOUS build's commit after a deploy, so the Rule 1c check
// would either fail a deploy that succeeded or — worse — echo the new SHA from a
// warm edge while the function region had silently regressed. Same trap as `/`,
// whose one-segment `X-Vercel-Id` says nothing about the build actually running.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Vercel injects VERCEL_GIT_COMMIT_SHA when it can see the git context. This
 * repo deploys from a *detached worktree* precisely so a dirty shared tree
 * cannot ship other sessions' uncommitted work, and that context may not carry
 * it — so the deploy passes the SHA explicitly:
 *
 *   vercel --cwd <worktree> --prod --yes --scope <scope> \
 *     -e DEPLOY_COMMIT_SHA=$(git rev-parse HEAD)
 *
 * An absent value reports `null` rather than a guess: an unknown commit is a
 * useful answer, a wrong one defeats the point of the route.
 */
function commitSha(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.DEPLOY_COMMIT_SHA;
  return sha && sha.length > 0 ? sha : null;
}

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      commit: commitSha(),
      // The region the function actually ran in, readable without parsing
      // `X-Vercel-Id`. Must be `icn1`.
      region: process.env.VERCEL_REGION ?? null,
      environment: process.env.VERCEL_ENV ?? "development",
      // Presence only, never values — this is a public endpoint. Answers in one
      // request the question that cost a burned preview deploy to discover:
      // whether an environment can reach VWorld at all.
      keys: {
        vworld: Boolean(process.env.VWORLD_API_KEY),
        dataGoKr: Boolean(process.env.DATA_GO_KR_API_KEY),
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      },
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
