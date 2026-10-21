import * as THREE from 'three'

const WATER_MATERIAL_NAME = 'TW_PondWater'

function injectAfter(source: string, chunk: string, code: string): string {
  if (!source.includes(chunk)) throw new Error(`[pond water] shader chunk ${chunk} not found`)
  return source.replace(chunk, `${chunk}\n${code}`)
}

function createWaterMaterial(source: THREE.MeshStandardMaterial, uTime: { value: number }): THREE.MeshStandardMaterial {
  const material = source.clone()
  material.roughness = 0.12
  material.transparent = true
  material.opacity = 0.86
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    shader.vertexShader = injectAfter(shader.vertexShader, '#include <common>', 'varying vec3 vPondWorld;')
    shader.vertexShader = injectAfter(shader.vertexShader, '#include <project_vertex>', 'vPondWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = injectAfter(shader.fragmentShader, '#include <common>', 'uniform float uTime;\nvarying vec3 vPondWorld;')
    shader.fragmentShader = injectAfter(shader.fragmentShader, '#include <color_fragment>', `
      float pondRipple = sin(dot(vPondWorld.xz, vec2(0.7, 0.5)) * 2.1 + uTime * 1.2) * sin(dot(vPondWorld.xz, vec2(-0.4, 0.9)) * 1.7 - uTime * 0.9);
      diffuseColor.rgb *= 0.9 + 0.14 * pondRipple;
      diffuseColor.rgb += vec3(0.1, 0.12, 0.12) * smoothstep(0.7, 1.0, pondRipple);`)
    shader.fragmentShader = injectAfter(shader.fragmentShader, '#include <normal_fragment_maps>', `
      vec2 pondP = vPondWorld.xz;
      vec2 pondSlope = vec2(0.9, 0.4) * cos(dot(pondP, vec2(0.9, 0.4)) * 1.6 + uTime * 1.4) * 0.5
        + vec2(-0.5, 0.8) * cos(dot(pondP, vec2(-0.5, 0.8)) * 2.3 + uTime * 1.9) * 0.35
        + vec2(0.3, -0.95) * cos(dot(pondP, vec2(0.3, -0.95)) * 3.7 - uTime * 2.4) * 0.2;
      normal = normalize((viewMatrix * vec4(normalize(vec3(-pondSlope.x * 0.3, 1.0, -pondSlope.y * 0.3)), 0.0)).xyz);`)
  }
  material.customProgramCacheKey = () => 'cove-pond-water'
  return material
}

export function animatePondWater(root: THREE.Object3D): number {
  const uTime = { value: 0 }
  const replaced = new Map<THREE.Material, THREE.MeshStandardMaterial>()
  let meshes = 0
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const source = obj.material
    if (!(source instanceof THREE.MeshStandardMaterial) || source.name !== WATER_MATERIAL_NAME) return
    let water = replaced.get(source)
    if (!water) {
      water = createWaterMaterial(source, uTime)
      replaced.set(source, water)
    }
    obj.material = water
    obj.onBeforeRender = () => {
      uTime.value = performance.now() / 1000
    }
    meshes++
  })
  return meshes
}
