// src/app/api/imagery/ortho/route.ts
//
// GET /api/imagery/ortho?z=..&x=..&y=..
//
// One aerial ortho tile, proxied from VWorld's WMTS. Proxied because the key
// sits in the WMTS URL path — serving that URL to the browser would publish it.
//
// This imagery is a VERIFICATION AID and nothing more. No value in the
// reconstruction is derived from it: it is drawn under the outline so a person
// can see the reconstructed plan against the real roof and judge it. Keeping it
// out of the evidence path is deliberate — an image a human eyeballs must never
// become a source a model quietly cites.

import { NextRequest, NextResponse } from "next/server";

/** VWorld's aerial layer. Served as XYZ under a WMTS path of {z}/{y}/{x}. */
const LAYER = "Satellite";
const MIN_ZOOM = 14;
const MAX_ZOOM = 19;

export const dynamic = "force-dynamic";

function intParam(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.VWORLD_API_KEY;
  if (!apiKey) {
    // Server misconfiguration is a 503, matching /api/vworld/footprint.
    return NextResponse.json(
      { error: "VWorld API is not configured on this server" },
      { status: 503 },
    );
  }

  const { searchParams } = request.nextUrl;
  const z = intParam(searchParams.get("z"));
  const x = intParam(searchParams.get("x"));
  const y = intParam(searchParams.get("y"));

  if (z === null || x === null || y === null) {
    return NextResponse.json(
      { error: "z, x and y must be integers" },
      { status: 400 },
    );
  }
  if (z < MIN_ZOOM || z > MAX_ZOOM) {
    return NextResponse.json(
      { error: `z must be between ${MIN_ZOOM} and ${MAX_ZOOM}` },
      { status: 400 },
    );
  }
  // Reject out-of-range indices rather than forwarding them: the path is
  // built from these numbers, so they are bounded before they reach the URL.
  const limit = 2 ** z;
  if (x < 0 || x >= limit || y < 0 || y >= limit) {
    return NextResponse.json(
      { error: "x and y are outside the tile grid for this zoom" },
      { status: 400 },
    );
  }

  const url = `https://api.vworld.kr/req/wmts/1.0.0/${apiKey}/${LAYER}/${z}/${y}/${x}.jpeg`;

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!upstream.ok) {
      // A missing tile is a legitimate 404, not a server fault: coverage is not
      // uniform and the overlay must degrade to "no imagery here".
      const status = upstream.status === 404 ? 404 : 502;
      return NextResponse.json({ error: "tile unavailable" }, { status });
    }

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        // Ortho imagery is re-flown on the order of years.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    // Never echo upstream content, and never leak the key-bearing URL.
    return NextResponse.json({ error: "VWorld imagery error" }, { status: 502 });
  }
}
