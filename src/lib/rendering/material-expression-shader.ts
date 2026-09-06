import * as THREE from "three";

/** The texture projection follows each local face, but its units must include
 * both node and instance scale. Schependomlaan stores reusable shapes in mm
 * with a 0.001 instance matrix. Geometry positions/indices/TRS stay unchanged. */
const METRE_UV = /* glsl */`
mat4 bimPlacement = modelMatrix;
#ifdef USE_INSTANCING
  bimPlacement = modelMatrix * instanceMatrix;
#endif
vec3 bimAxisScale = vec3(length(bimPlacement[0].xyz), length(bimPlacement[1].xyz), length(bimPlacement[2].xyz));
vec3 bimFace = abs(normal);
vec2 bimUvScale = bimFace.x > bimFace.y && bimFace.x > bimFace.z ? bimAxisScale.zy :
  (bimFace.y >= bimFace.x && bimFace.y >= bimFace.z ? bimAxisScale.xz : bimAxisScale.xy);
vec2 bimMetreUv = uv * bimUvScale;
`;

/** Standard derivative-based normal mapping and mip filtering are retained.
 * No vertex displacement, position noise, time input or depth changes. */
export function installMaterialExpressionShader(material: THREE.MeshStandardMaterial, roughnessRange: readonly [number, number]) {
  const range = new THREE.Vector2(...roughnessRange);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.bimRoughnessRange = { value: range };
    const uvChunk = THREE.ShaderChunk.uv_vertex.replace(/\b(MAP_UV|NORMALMAP_UV|ROUGHNESSMAP_UV)\b/g, "bimMetreUv");
    shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `${METRE_UV}\n${uvChunk}`);
    shader.fragmentShader = `uniform vec2 bimRoughnessRange;\n${shader.fragmentShader}`.replace(
      "#include <roughnessmap_fragment>",
      THREE.ShaderChunk.roughnessmap_fragment.replace("roughnessFactor *= texelRoughness.g;", "roughnessFactor = mix(bimRoughnessRange.x, bimRoughnessRange.y, texelRoughness.g);"),
    );
  };
  material.customProgramCacheKey = () => "reference-material-metres-roughness-v1";
}
