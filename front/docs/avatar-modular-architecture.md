# Modular Avatar Architecture (Head / Torso / Legs)

This document defines a practical, implementation-ready architecture for Fortnite-style modular avatars in CampusCove (`Vue 3 + TypeScript + Three.js`), using three base slots:

- `head`
- `torso`
- `legs`

Goal: load wearable parts from different sources while keeping a predictable runtime contract and fast failures when assets do not match requirements.

## 1) Slot Model

Use one canonical enum in app code:

- `head`: helmets, hats, hair meshes, masks
- `torso`: upper-body garments and chest armor
- `legs`: pants, skirts, lower-body armor, boots when authored as lower-body mesh

Recommended scene assembly:

1. Load one base avatar skeleton/profile (or a hidden fallback body mesh).
2. Resolve selected part for each slot from inventory/loadout.
3. Attach part roots to expected anchors (or bind to skeleton) in deterministic order:
   - `legs` -> `torso` -> `head`
4. Apply optional tint/material overrides.
5. Validate and render only when all required slot checks pass.

Why this order: lower-body often defines scale/proportions; torso and head are more likely to use relative offsets from it.

## 2) Multi-Source Asset Format Requirements

Mixing sources is possible only when constraints are strict. Treat this as non-negotiable.

### Required format

- Container: `.glb` strongly preferred (single-file, CDN-friendly).
- Coordinate system: Y-up, meters, +Z forward (or converted in import pipeline once).
- Pivot/origin:
  - Part root pivot centered and stable for its slot.
  - No arbitrary offsets baked for preview-only scenes.
- Transform hygiene:
  - Frozen transforms before export (scale = `1,1,1`, rotation = `0,0,0` on root).
  - Avoid negative scales and shears.
- Topology expectations:
  - Real-time safe triangle count budget per slot.
  - No non-manifold mesh or degenerate faces.
- Materials:
  - PBR (`MeshStandardMaterial` compatibility).
  - Bounded texture sizes (for web, typically 1K-2K per map unless hero item).
- Skeleton policy:
  - If skinned: identical bone naming and hierarchy contract to base rig.
  - If rigid/static: explicit anchor metadata per slot.

### Strong recommendation for mixed providers

- Normalize every incoming source through one internal conversion pipeline (Blender/CI script) into your house `.glb` standard.
- Reject raw provider exports at runtime; runtime should consume only validated internal artifacts.

## 3) Naming Conventions

Stable naming is required for automation, caching, and debugging.

### File and asset IDs

- Asset ID: `avatar.<slot>.<set>.<variant>`
  - Example: `avatar.head.urban_rider.v2`
- File name: `<assetId>.glb`
  - Example: `avatar.head.urban_rider.v2.glb`

### Internal node naming

- Root node: `part_<slot>_root`
- Optional mesh groups:
  - `part_<slot>_geo`
  - `part_<slot>_lod0`, `part_<slot>_lod1`
- Optional anchor nodes:
  - `anchor_head`
  - `anchor_torso`
  - `anchor_legs`

### Texture naming

- `<assetId>_<map>.webp|png` where map is one of:
  - `baseColor`, `normal`, `orm`, `emissive`

## 4) Runtime Loading Contract

Runtime should never assume "best effort". It should either load a valid part or return a typed error reason.

### Contract summary

Loader input must include:

- Part descriptor (`slot`, `assetId`, source URI, expected format, optional hash/version)
- Context (`player rig profile`, quality tier, optional tint overrides)

Loader output must include:

- Loaded `Object3D` root
- Validation result with normalized warnings/errors
- Metrics (load ms, tri count, texture memory estimate)

### Validation checklist (run before attaching)

1. **Descriptor integrity**
   - `slot` in `head|torso|legs`
   - `assetId` present and unique
2. **Source checks**
   - URI reachable
   - extension/format allowed (`glb`)
3. **Geometry checks**
   - triangle budget per slot not exceeded
   - bounding box in allowed size envelope for slot
4. **Rig/anchor checks**
   - if skinned: required bones exist and hierarchy matches profile
   - if static: required `anchor_<slot>` (or compatible root) exists
5. **Material checks**
   - unsupported shader graphs rejected or downgraded
   - texture dimensions under configured max
6. **Security/safety checks**
   - no external texture URL references
   - no embedded scripts/custom extensions you do not support
7. **Compatibility checks**
   - part authored for same avatar profile/version
   - optional hash/version match for cache integrity

If any mandatory check fails, fail closed and use a known fallback part for that slot.

## 5) Suggested Folder and Data Shape

Recommended front-end organization:

- `front/src/avatar/avatarTypes.ts` for contracts
- `front/src/avatar/avatarCatalog.ts` for manifest/index
- `front/src/avatar/avatarLoader.ts` for loading/validation
- `front/src/avatar/avatarAssembler.ts` for final scene composition

Suggested data flow:

1. API returns owned cosmetic IDs.
2. Client maps IDs to local part descriptors (catalog/manifest).
3. Loader fetches + validates each selected slot part.
4. Assembler binds/attaches parts and applies cosmetics.
5. Cache valid parts by `assetId + version`.

## 6) Pipeline Recommendations (Practical)

For this codebase, keep pipeline intentionally simple first:

1. **Ingestion**
   - Accept provider assets into a staging folder only.
2. **Normalization**
   - Convert to house `.glb`, fix transforms, rename nodes, repack textures.
3. **Validation script**
   - Node script using `gltf-transform` (or similar) checks triangle budget, node names, and texture limits.
4. **Manifest generation**
   - Emit JSON/TS manifest with typed descriptors and checksums.
5. **Runtime**
   - Runtime loads only validated artifacts from manifest, never raw uploads.

This sequence is cheaper long-term than debugging random asset quirks in production.

## 7) Frank Critique of gltfjsx (Vue + Three.js)

`gltfjsx` is excellent for React Three Fiber ergonomics. In a Vue + plain Three setup, it is usually the wrong default for modular avatar parts.

### Where gltfjsx helps

- Fast inspection of GLTF structure.
- Great when React component wrappers are directly consumed.
- Handy for one-off static hero models.

### Why it is weak for this stack

- Output targets React component patterns, not Vue SFC patterns.
- Encourages compile-time embedding of asset structure instead of runtime-driven manifests.
- Adds friction for hot-swapping multi-source cosmetics by descriptor.
- Can lock you into generated component diffs that are noisy for asset updates.

### Practical recommendation here

- Do **not** use `gltfjsx` as the core pipeline for modular cosmetics.
- Use GLTF runtime loading (`GLTFLoader`) + typed manifests/contracts.
- Optionally run `gltfjsx` only as a developer inspection/debug helper when reverse-engineering asset node structure.

In short: for CampusCove's Vue + TS + modular loadout goals, `gltfjsx` is useful as a tooling sidecar, not as architecture.
