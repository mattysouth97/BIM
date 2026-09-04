// src/lib/rendering/shader-chunks.ts
// GLSL injected into MeshStandardMaterial / MeshPhysicalMaterial via
// onBeforeCompile. World-space triplanar, stochastic sampling, multi-scale
// variation, weathering, wetness, and a cheap screen-space edge bevel.

export const ARCH_VERTEX_PARS = /* glsl */ `
varying vec3 vArchWorldPos;
varying vec3 vArchWorldNormal;
`;

export const ARCH_VERTEX_TAIL = /* glsl */ `
{
  vec4 archPos = vec4(transformed, 1.0);
  vec3 archNrm = objectNormal;
  #ifdef USE_INSTANCING
    archPos = instanceMatrix * archPos;
    archNrm = mat3(instanceMatrix) * archNrm;
  #endif
  vArchWorldPos = (modelMatrix * archPos).xyz;
  vArchWorldNormal = normalize(mat3(modelMatrix) * archNrm);
}
`;

export const ARCH_FRAGMENT_PARS = /* glsl */ `
varying vec3 vArchWorldPos;
varying vec3 vArchWorldNormal;
uniform float uArchMetersX;
uniform float uArchMetersY;
uniform float uArchSeed;
uniform float uArchHeight;
uniform float uArchRain;
uniform float uArchDirt;
uniform float uArchOxidation;
uniform float uArchFade;
uniform float uArchWetness;
uniform float uArchDetail;
uniform float uArchStochastic;
uniform float uArchWeathering;
uniform vec3 uArchTint;

float archHash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float archHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
vec2 archHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float archNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = archHash11(dot(i, vec2(127.1, 311.7)));
  float b = archHash11(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7)));
  float c = archHash11(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7)));
  float d = archHash11(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float archFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * archNoise(p);
    p = p * 2.03 + 17.0;
    a *= 0.5;
  }
  return v;
}
mat2 archRot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}
vec2 archStochasticUv(vec2 uv, vec3 cell) {
  vec2 j = archHash22(cell.xy + cell.z + uArchSeed);
  uv += (j - 0.5) * 0.37;
  if (uArchStochastic > 0.5) {
    float ang = (j.x + uArchSeed) * 6.2831853;
    uv = archRot(ang) * (uv - 0.5) + 0.5;
  }
  return uv;
}
vec4 archTriplanar(sampler2D tex, vec3 wpos, vec3 wn) {
  vec3 blending = abs(wn);
  blending = pow(blending, vec3(4.0));
  blending /= max(blending.x + blending.y + blending.z, 1e-5);
  vec3 cell = floor(wpos / 4.0 + uArchSeed);
  vec2 uvx = archStochasticUv(wpos.zy / vec2(uArchMetersY, uArchMetersX), cell);
  vec2 uvy = archStochasticUv(wpos.xz / vec2(uArchMetersX, uArchMetersY), cell);
  vec2 uvz = archStochasticUv(wpos.xy / vec2(uArchMetersX, uArchMetersY), cell);
  vec4 cx = texture2D(tex, uvx);
  vec4 cy = texture2D(tex, uvy);
  vec4 cz = texture2D(tex, uvz);
  return cx * blending.x + cy * blending.y + cz * blending.z;
}
`;

/**
 * Procedural base surfaces.
 *
 * The triplanar path already generates weathering, multi-scale variation and
 * wetness in-shader; the JPEG atlas only supplied base albedo and roughness
 * underneath all of that. These functions synthesise that base instead, which
 * removes the texture fetch entirely and has no tiling period to alias.
 *
 * `uArchFamily` selects the surface: 0 concrete-clean, 1 concrete-rough,
 * 2 brick, 3 metal panel, 4 wood, 5 roof tile, 6 roof membrane.
 *
 * Returns rgb = albedo multiplier around 1.0, a = roughness delta.
 */
export const ARCH_PROCEDURAL_PARS = /* glsl */ `
uniform float uArchProcedural;
uniform float uArchFamily;

// Dominant-axis planar projection, in metres.
vec2 archPlanarUv(vec3 wp, vec3 wn) {
  vec3 b = abs(wn);
  if (b.y >= b.x && b.y >= b.z) return wp.xz;
  if (b.x >= b.z) return wp.zy;
  return wp.xy;
}

// Running-bond courses. x = brick length, y = course height, both metres.
// Returns x = mortar mask (1 at joint), y = per-brick random.
vec2 archCourses(vec2 uv, vec2 unit, float joint) {
  float row = floor(uv.y / unit.y);
  float offset = mod(row, 2.0) * 0.5 * unit.x;
  vec2 cell = vec2(floor((uv.x + offset) / unit.x), row);
  vec2 f = vec2(fract((uv.x + offset) / unit.x), fract(uv.y / unit.y));
  float jx = min(f.x, 1.0 - f.x);
  float jy = min(f.y, 1.0 - f.y);
  float j = 1.0 - smoothstep(0.0, joint, min(jx * unit.x, jy * unit.y));
  return vec2(j, archHash11(dot(cell, vec2(127.1, 311.7)) + uArchSeed));
}

vec4 archProceduralSurface(vec3 wp, vec3 wn) {
  vec2 uv = archPlanarUv(wp, wn);
  float fam = uArchFamily;
  vec3 tint = vec3(1.0);
  float rough = 0.0;

  float grit = archFbm(uv * 34.0) - 0.5;
  float blotch = archFbm(uv * 2.1 + uArchSeed) - 0.5;

  if (fam < 1.5) {
    // Concrete. Board-form lines, pour blotching, fine aggregate.
    float boards = sin(uv.y * 3.14159 / 0.6 + uArchSeed) * 0.5 + 0.5;
    boards = smoothstep(0.86, 1.0, boards);
    float coarse = fam > 0.5 ? 1.0 : 0.45;
    tint *= 1.0 + blotch * 0.10 * coarse + grit * 0.055 * coarse;
    tint *= 1.0 - boards * 0.045 * coarse;
    rough += blotch * 0.10 * coarse + boards * 0.06;
  } else if (fam < 2.5) {
    // Brick. 190x75 nominal with a 10 mm joint.
    vec2 c = archCourses(uv, vec2(0.20, 0.085), 0.011);
    vec3 mortar = vec3(0.78, 0.77, 0.74);
    tint *= mix(vec3(1.0) * (0.88 + c.y * 0.24), mortar, c.x);
    tint *= 1.0 + grit * 0.05;
    rough += c.x * 0.22 + (c.y - 0.5) * 0.08;
  } else if (fam < 3.5) {
    // Metal panel. Seams and a slight per-panel value shift.
    vec2 c = archCourses(uv, vec2(1.2, 0.9), 0.006);
    tint *= 0.985 + (c.y - 0.5) * 0.05;
    tint *= 1.0 - c.x * 0.12;
    rough += c.x * 0.18 + (c.y - 0.5) * 0.03;
  } else if (fam < 4.5) {
    // Wood. Grain runs along the dominant horizontal axis.
    float grain = archFbm(vec2(uv.x * 2.0, uv.y * 46.0) + uArchSeed);
    float rings = archFbm(vec2(uv.x * 5.5, uv.y * 8.0));
    tint *= 0.90 + grain * 0.16 + rings * 0.06;
    rough += (grain - 0.5) * 0.14;
  } else if (fam < 5.5) {
    // Roof tile. Overlapping rows with a shadowed leading edge.
    vec2 c = archCourses(uv, vec2(0.26, 0.17), 0.008);
    float lap = smoothstep(0.0, 0.35, fract(uv.y / 0.17));
    tint *= (0.86 + c.y * 0.26) * (0.80 + 0.20 * lap);
    rough += c.x * 0.14 + (1.0 - lap) * 0.08;
  } else {
    // Roof membrane. Broad mottle, welded seams about a metre apart.
    float seam = abs(fract(uv.x / 1.05) - 0.5);
    seam = 1.0 - smoothstep(0.0, 0.012, seam * 1.05);
    tint *= 1.0 + blotch * 0.07 + grit * 0.03;
    tint *= 1.0 - seam * 0.09;
    rough += seam * 0.10 + blotch * 0.06;
  }

  return vec4(tint, rough);
}
`;

export const ARCH_MAP_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = archTriplanar(map, vArchWorldPos, normalize(vArchWorldNormal));
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = vec4(mix(pow(sampledDiffuseColor.rgb * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), sampledDiffuseColor.rgb * 0.0773993808, vec3(lessThanEqual(sampledDiffuseColor.rgb, vec3(0.04045)))), sampledDiffuseColor.w);
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
`;

export const ARCH_COLOR_AFTER = /* glsl */ `
{
  vec3 wp = vArchWorldPos;
  vec3 wn = normalize(vArchWorldNormal);
  float up = saturate(wn.y);
  float vert = saturate(1.0 - abs(wn.y));
  float h01 = saturate(wp.y / max(uArchHeight, 0.5));

  float macro = archHash13(floor(wp * 0.12) + uArchSeed);
  float meso = archFbm(wp.xz * 0.35 + wp.y * 0.08 + uArchSeed);
  float micro = archNoise(vec2(wp.x + wp.z, wp.y) * (6.0 + uArchDetail * 8.0));

  // Synthesised base surface, replacing the sampled albedo when no map is bound.
  if (uArchProcedural > 0.5) {
    diffuseColor.rgb *= archProceduralSurface(wp, wn).rgb;
  }

  // Subtle per-element hue/value drift — never noisy.
  float valueJitter = (macro - 0.5) * 0.08 + (meso - 0.5) * 0.05;
  diffuseColor.rgb *= (0.96 + valueJitter);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uArchTint, 0.18);

  if (uArchWeathering > 0.5) {
    float dirt = (1.0 - smoothstep(0.0, 3.6, wp.y)) * uArchDirt * (0.45 + 0.55 * vert);
    float streaks = archFbm(vec2((wp.x + wp.z) * 7.5, wp.y * 0.28 + uArchSeed)) * vert * uArchRain;
    streaks *= smoothstep(0.15, 0.85, 1.0 - h01);
    float fade = uArchFade * (0.3 + 0.7 * h01);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.52, 0.50, 0.47), saturate(dirt));
    diffuseColor.rgb *= 1.0 - 0.16 * streaks;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.88, fade);

    // Copper / corten oxidation leans toward oxide hue on sky-facing metal-ish surfaces.
    if (uArchOxidation > 0.01) {
      vec3 oxide = mix(vec3(0.35, 0.45, 0.32), vec3(0.45, 0.22, 0.12), saturate(uArchOxidation * 1.4));
      float oxMask = saturate(up * 0.6 + vert * 0.25) * uArchOxidation * (0.5 + 0.5 * meso);
      diffuseColor.rgb = mix(diffuseColor.rgb, oxide, oxMask * 0.45);
    }
  }

  // Rain: darken horizontals, drop roughness later.
  if (uArchWetness > 0.01) {
    float wet = uArchWetness * (0.35 + 0.65 * up);
    diffuseColor.rgb *= 1.0 - 0.28 * wet;
  }

  // Micro-surface speckles (aggregate / pores) — very small.
  diffuseColor.rgb *= 1.0 - (micro - 0.5) * 0.04 * uArchDetail;
}
`;

export const ARCH_ROUGHNESS_AFTER = /* glsl */ `
{
  vec3 wp = vArchWorldPos;
  vec3 wn = normalize(vArchWorldNormal);
  float up = saturate(wn.y);
  float macro = archHash13(floor(wp * 0.12) + uArchSeed);
  roughnessFactor = saturate(roughnessFactor + (macro - 0.5) * 0.10);
  if (uArchProcedural > 0.5) {
    roughnessFactor = saturate(roughnessFactor + archProceduralSurface(wp, wn).a);
  }
  if (uArchWeathering > 0.5) {
    float dirt = (1.0 - smoothstep(0.0, 3.6, wp.y)) * uArchDirt;
    roughnessFactor = saturate(roughnessFactor + dirt * 0.12);
  }
  if (uArchWetness > 0.01) {
    roughnessFactor = mix(roughnessFactor, 0.12, uArchWetness * (0.4 + 0.6 * up));
  }
}
`;

export const ARCH_NORMAL_AFTER = /* glsl */ `
{
  vec3 wn = normalize(vArchWorldNormal);
  float edge = saturate(length(fwidth(wn)) * 2.4);
  // Tiny bevel: lift the geometric normal toward the screen-space curvature.
  normal = normalize(mix(normal, normalize(normal + vec3(0.0, 0.35, 0.0)), edge * 0.28 * uArchDetail));
}
`;
