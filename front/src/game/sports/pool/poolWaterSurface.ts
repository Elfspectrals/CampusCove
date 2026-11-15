import * as THREE from 'three'

const WATER_MATERIAL = 'TW_SportsPoolWater'
const MAX_RIPPLES = 8
const FIND_EVERY_S = 1
const FAR_PAST = -1000

const vertexShader = `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const fragmentShader = `
#include <fog_pars_fragment>
uniform float uTime;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFromBelow;
varying vec3 vWorld;

vec2 waveSlope(vec2 p, float t) {
  vec2 s = vec2(0.0);
  s += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 1.7 + t * 1.3) * 0.06;
  s += vec2(-0.5, 0.9) * cos(dot(p, vec2(-0.5, 0.9)) * 2.9 + t * 1.9) * 0.04;
  s += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 5.3 + t * 2.7) * 0.025;
  return s;
}

vec2 rippleSlope(vec2 p) {
  vec2 s = vec2(0.0);
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > 2.5) continue;
    vec2 d = p - r.xy;
    float dist = length(d) + 1e-4;
    float front = age * 1.4;
    float band = exp(-pow((dist - front) * 3.0, 2.0));
    float fade = exp(-age * 1.6) * r.w;
    s += (d / dist) * cos((dist - front) * 18.0) * band * fade * 0.35;
  }
  return s;
}

void main() {
  vec2 slope = waveSlope(vWorld.xz, uTime) + rippleSlope(vWorld.xz);
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 toEye = normalize(cameraPosition - vWorld);
  bool below = cameraPosition.y < vWorld.y;
  float facing = abs(dot(normal, toEye));
  float fresnel = pow(1.0 - facing, 3.0);
  vec3 sun = normalize(vec3(0.3, 1.0, 0.2));
  float glint = pow(max(dot(reflect(-sun, normal), toEye), 0.0), 60.0);
  vec3 color = below ? uFromBelow + glint * 0.3 : mix(uShallow, uDeep, 0.35 + 0.65 * fresnel) + glint * 0.8;
  float alpha = below ? 0.75 : mix(0.42, 0.9, fresnel);
  gl_FragColor = vec4(color, alpha);
  #include <fog_fragment>
}
`

export function createPoolWaterSurface(getScene: () => THREE.Scene | undefined) {
  const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, FAR_PAST, 0))
  const time = { value: 0 }
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uDeep: { value: new THREE.Color(0x1d7fa8) },
      uShallow: { value: new THREE.Color(0x6fd0e6) },
      uFromBelow: { value: new THREE.Color(0x9fe3f0) },
    },
  ])
  uniforms.uRipples = { value: ripples }
  uniforms.uTime = time
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true })
  let found = false
  let sinceFind = FIND_EVERY_S
  let next = 0

  function isWater(m: THREE.Material | THREE.Material[]): boolean {
    return !Array.isArray(m) && m.name === WATER_MATERIAL
  }

  function findWater(scene: THREE.Scene): void {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !isWater(mesh.material)) return
      mesh.material = material
      mesh.renderOrder = 1
      found = true
    })
  }

  function ripple(x: number, z: number, strength: number): void {
    ripples[next]!.set(x, z, time.value, strength)
    next = (next + 1) % MAX_RIPPLES
  }

  function tick(dt: number): void {
    time.value += dt
    if (found) return
    sinceFind += dt
    const scene = getScene()
    if (!scene || sinceFind < FIND_EVERY_S) return
    sinceFind = 0
    findWater(scene)
  }

  return { ripple, tick }
}
