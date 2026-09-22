import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

// Shared decoder instance: workers are spawned lazily, only when a
// Draco-compressed file is actually loaded.
let sharedDracoLoader: DRACOLoader | null = null

function getSharedDracoLoader(): DRACOLoader {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader()
    sharedDracoLoader.setDecoderPath('/draco-decoder/')
  }
  return sharedDracoLoader
}

/**
 * GLTFLoader with Draco support. Use this instead of `new GLTFLoader()` so
 * models optimized by `npm run optimize` (Draco-compressed) load anywhere.
 */
export function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader()
  loader.setDRACOLoader(getSharedDracoLoader())
  return loader
}
