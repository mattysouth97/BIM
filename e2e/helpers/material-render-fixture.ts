import * as THREE from "three";
import { materialProjection } from "../../src/lib/rendering/material-expression";
import { installMaterialExpressionShader } from "../../src/lib/rendering/material-expression-shader";

/** Independent GPU probe: the same one-metre face encoded in metres or in
 * millimetres must sample exactly the same physical texture. No app hooks. */
export function compareMaterialUnits() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(80, 80);
  const target = new THREE.WebGLRenderTarget(80, 80);
  const camera = new THREE.OrthographicCamera(-0.6, 0.6, 0.6, -0.6, 0.1, 10);
  camera.position.z = 2;
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight("#ffffff", 2));
  const bytes = new Uint8Array(8 * 8 * 4);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const i = (y * 8 + x) * 4;
    bytes[i] = x * 31; bytes[i + 1] = y * 31; bytes[i + 2] = (x + y) % 2 ? 230 : 30; bytes[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(bytes, 8, 8);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1 });
  installMaterialExpressionShader(material, [0.7, 1]);
  const render = (units: number, nodeScale: number, instanceScale?: number) => {
    const original = new THREE.PlaneGeometry(units, units);
    const geometry = materialProjection(original);
    const mesh = instanceScale === undefined ? new THREE.Mesh(geometry, material) : new THREE.InstancedMesh(geometry, material, 1);
    mesh.scale.setScalar(nodeScale);
    if (mesh instanceof THREE.InstancedMesh) mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(instanceScale!, instanceScale!, instanceScale!));
    scene.add(mesh);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const pixels = new Uint8Array(80 * 80 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 80, 80, pixels);
    scene.remove(mesh);
    if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
    geometry.dispose(); original.dispose();
    return pixels;
  };
  const baseline = render(1, 1);
  const variants = [render(1000, 0.001), render(1000, 1, 0.001), render(1000, 2, 0.0005)];
  const results = variants.map((pixels) => ({
    maxChannelDifference: pixels.reduce((maximum, value, index) => Math.max(maximum, Math.abs(value - baseline[index])), 0),
    changedChannels: pixels.reduce((total, value, index) => total + Number(value !== baseline[index]), 0),
  }));
  const colours = new Set<string>();
  for (let i = 0; i < baseline.length; i += 4) if (baseline[i + 3]) colours.add(`${baseline[i]},${baseline[i + 1]},${baseline[i + 2]}`);
  target.dispose(); texture.dispose(); material.dispose(); renderer.dispose();
  return { colours: colours.size, results };
}
