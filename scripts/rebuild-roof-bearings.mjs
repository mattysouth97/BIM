// Regenerate derived bearings from the already published measured normals.
// Geometry, areas, elevations, source refs and obstructions remain untouched.
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { roofAzimuthDeg, roofPlanesSvg } from "./lib/ifc-roof-planes.mjs";

const base = path.join(process.cwd(), "public/reference-buildings");
for (const entry of await readdir(base, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const folder = path.join(base, entry.name);
  let original;
  try { original = await readFile(path.join(folder, "roof-planes.json"), "utf8"); }
  catch (error) { if (error.code === "ENOENT") continue; throw error; }
  const data = JSON.parse(original);
  const manifest = JSON.parse(await readFile(path.join(folder, "manifest.json"), "utf8"));
  const trueNorthDeg = manifest.orientation?.trueNorthDeg ?? null;
  if (trueNorthDeg !== null && !Number.isFinite(trueNorthDeg)) throw new Error(`${entry.name}: invalid source true north`);
  data.trueNorthDeg = trueNorthDeg;
  data.northAssumed = trueNorthDeg === null;
  let changed = 0;
  for (const plane of data.planes) {
    const bearing = roofAzimuthDeg(plane.normal, trueNorthDeg ?? 0);
    if (plane.azimuthDeg !== bearing) changed++;
    plane.azimuthDeg = bearing;
  }
  data.note = data.note.replace(/clockwise from project north \(the model's −Z\), null where the plane is flat\./,
    "clockwise from source true north when stated, otherwise project north (the model's −Z); trueNorthDeg records the rotation, and flat planes carry null.");
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  await writeFile(path.join(folder, "roof-planes.json"), `${JSON.stringify(data, null, 2)}\n`.replaceAll("\n", eol));
  await writeFile(path.join(folder, "roof-planes-qa.svg"), roofPlanesSvg(data.planes, { id: entry.name, title: manifest.name.en, trueNorthDeg }));
  console.log(`${entry.name}: ${changed} bearings corrected; true north ${trueNorthDeg ?? "assumed project -Z"}`);
}
