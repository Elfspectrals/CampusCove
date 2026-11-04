<script setup lang="ts">
import Globe, { type GlobeInstance } from 'globe.gl'
import type { MeshPhongMaterial } from 'three'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface GlobeImpact {
  country: string
  events: number
  banned: boolean
}

interface CountryFeature {
  properties: { iso2: string | null, name: string, lat: number, lng: number }
}

interface PlacedImpact extends GlobeImpact {
  lat: number
  lng: number
}

const props = defineProps<{ impacts: GlobeImpact[] }>()

const COUNTRIES_URL = `${import.meta.env.BASE_URL}assets/security/countries.geojson`
const GOLD = '#d4af37'
const RED = '#e24b4a'
const LAND = '#5c4f24'
const ZOOM_STEP = 0.4
const MIN_ALTITUDE = 1.2
const MAX_ALTITUDE = 4
const NARROW_WIDTH = 500
const NARROW_ALTITUDE = 3.6
const WIDE_ALTITUDE = 1.9

const container = ref<HTMLElement | null>(null)
const rotating = ref(true)
const loadError = ref<string | null>(null)
const centers = new Map<string, { lat: number, lng: number }>()
let globe: GlobeInstance | null = null
let resizeObserver: ResizeObserver | null = null

function placedImpacts(): PlacedImpact[] {
  return props.impacts.flatMap((impact) => {
    const center = centers.get(impact.country)
    return center ? [{ ...impact, ...center }] : []
  })
}

function impactRadius(impact: PlacedImpact, impacts: PlacedImpact[]): number {
  const busiest = Math.max(...impacts.map((i) => i.events))
  return 0.4 + 1.6 * Math.sqrt(impact.events / busiest)
}

function drawImpacts(): void {
  if (!globe) return
  const impacts = placedImpacts()
  globe
    .pointsData(impacts)
    .pointRadius((d) => impactRadius(d as PlacedImpact, impacts))
    .ringsData(impacts)
    .ringMaxRadius((d) => 3 * impactRadius(d as PlacedImpact, impacts))
}

function ringColor(impact: PlacedImpact): (t: number) => string {
  const rgb = impact.banned ? '226, 75, 74' : '212, 175, 55'
  return (t) => `rgba(${rgb}, ${1 - t})`
}

function zoom(direction: 1 | -1): void {
  if (!globe) return
  const { altitude } = globe.pointOfView()
  globe.pointOfView({ altitude: Math.min(MAX_ALTITUDE, Math.max(MIN_ALTITUDE, altitude - direction * ZOOM_STEP)) }, 300)
}

function toggleRotation(): void {
  if (!globe) return
  rotating.value = !rotating.value
  globe.controls().autoRotate = rotating.value
}

onMounted(async () => {
  const element = container.value
  if (!element) return

  let countries: { features: CountryFeature[] }
  try {
    const response = await fetch(COUNTRIES_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    countries = (await response.json()) as { features: CountryFeature[] }
  } catch (error) {
    loadError.value = `World map failed to load: ${error instanceof Error ? error.message : String(error)}`
    return
  }
  for (const { properties } of countries.features) {
    if (properties.iso2) centers.set(properties.iso2, { lat: properties.lat, lng: properties.lng })
  }

  globe = new Globe(element, { animateIn: false })
    .backgroundColor('rgba(0,0,0,0)')
    .width(element.clientWidth)
    .height(element.clientHeight)
    .showAtmosphere(true)
    .atmosphereColor(GOLD)
    .atmosphereAltitude(0.12)
    .hexPolygonsData(countries.features)
    .hexPolygonResolution(3)
    .hexPolygonMargin(0.35)
    .hexPolygonColor(() => LAND)
    .pointLat('lat')
    .pointLng('lng')
    .pointAltitude(0.01)
    .pointColor((d) => ((d as PlacedImpact).banned ? RED : GOLD))
    .pointLabel((d) => `${(d as PlacedImpact).country} · ${(d as PlacedImpact).events} events`)
    .ringLat('lat')
    .ringLng('lng')
    .ringColor((d: object) => ringColor(d as PlacedImpact))
    .ringPropagationSpeed(2)
    .ringRepeatPeriod(1400)
  const material = globe.globeMaterial() as MeshPhongMaterial
  material.color.set('#141210')
  globe.controls().autoRotate = true
  globe.controls().autoRotateSpeed = 0.4
  globe.pointOfView({ altitude: element.clientWidth < NARROW_WIDTH ? NARROW_ALTITUDE : WIDE_ALTITUDE })
  drawImpacts()

  resizeObserver = new ResizeObserver(() => globe?.width(element.clientWidth).height(element.clientHeight))
  resizeObserver.observe(element)
})

watch(() => props.impacts, drawImpacts)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  globe?._destructor()
  globe = null
})
</script>

<template>
  <div class="globe">
    <div ref="container" class="globe-canvas" />
    <p v-if="loadError" class="globe-error" role="alert">{{ loadError }}</p>
    <div class="globe-controls">
      <button type="button" class="sec-btn" aria-label="Zoom out" @click="zoom(-1)">−</button>
      <button type="button" class="sec-btn" aria-label="Zoom in" @click="zoom(1)">+</button>
      <button type="button" class="sec-btn" @click="toggleRotation">{{ rotating ? 'Pause rotation' : 'Resume rotation' }}</button>
    </div>
  </div>
</template>

<style scoped>
.globe {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.globe-canvas {
  height: clamp(320px, 65vh, 640px);
  overflow: hidden;
}

.globe-error {
  margin: 0;
  color: #f09595;
  font-size: 0.85rem;
}

.globe-controls {
  display: flex;
  gap: 0.5rem;
  padding-top: 0.5rem;
}
</style>
