// Runs one NPC's behavior tree (docs/NPC_BEHAVIOR.md). Pure: time, players and randomness come in, the NPC's
// public state comes out, so the room only ticks and broadcasts.
import {
  isComposite,
  isCondition,
  type BehaviorTree,
  type BtNode,
  type CompositeNode,
  type CropKind,
  type Condition,
  type Decorator,
  type NpcClip,
  type TaskNode,
  type Vec3Tuple
} from './npcBehavior.ts'
import type { ShopNav } from './shopNav.ts'
import { queueSpot, type CheckoutLine, type ShelfItem, type ShelfSpot, type ShopLayout } from './shopSpots.ts'

export const NPC_TICK_MS = 100
export const WALK_SPEED = 2.5
export const RUN_SPEED = 7.5
export const TARGET_STOP_DISTANCE = 1.5
export const TARGET_KEEP_MARGIN = 2
/** Same length as the Pick clip and the players' orchard pick (PICK_MS). */
export const NPC_PICK_MS = 3000
/** How far from a plant the NPC stands to pick it: crops at its feet, trees by the trunk. */
export const PICK_STAND = { crop: 0.7, tree: 1.3 }
/** Lengths of the TakeItem and Pay clips on the base body. */
export const NPC_TAKE_MS = 1500
export const NPC_PAY_MS = 1500
/** The paying shopper lingers at the counter this long after the Pay clip. */
export const AFTER_PAY_MS = 800

/** Plants of a kind anywhere in the world (socket/src/world.ts crops and orchard trees). */
export type PlantSource = (kind: CropKind) => readonly Vec3Tuple[]

export type Status = 'success' | 'failure' | 'running'

export interface NpcState {
  id: string
  x: number
  y: number
  z: number
  ry: number
  clip: NpcClip
  /** Bumped each time a clip starts, so the same one-shot clip twice in a row plays twice. */
  clipSeq: number
  move: { x: number; y: number; z: number; ms: number } | null
  say: string | null
  /** The item a shopper took from a shelf, in its hand until it pays. */
  held: ShelfItem | null
}

export interface BrainWorld {
  now: number
  /** Hour of the day, Paris time (0-23). */
  hour: number
  players: readonly { sessionId: string; x: number; z: number }[]
}

interface Move {
  from: Vec3Tuple
  to: Vec3Tuple
  start: number
  end: number
}

interface Memory {
  running: boolean
  cooldownUntil: number
  loops: number
  index: number
  chosen: number
  started: boolean
  endsAt: number
  /** Where a multi-step task (walk, then act) stands. */
  stage: Stage | null
  serviceAt: number[]
}

type Stage =
  | { kind: 'pick'; plant: Vec3Tuple }
  | { kind: 'browse'; spot: ShelfSpot; step: 'walk' | 'look' | 'take' }
  | { kind: 'line'; place: number; step: 'queue' | 'pay' }

/** The shop the NPC's zone is, if any: shelves to browse and the checkout line it shares with the other shoppers. */
export interface NpcShop {
  layout: ShopLayout
  line: CheckoutLine
  /** Walks around the shelves; null walks in straight lines. */
  nav: ShopNav | null
}

export interface BrainEnv {
  random: () => number
  plants: PlantSource
  shop: NpcShop | null
}

export interface NpcHome {
  position: Vec3Tuple
  yaw: number
}

export class NpcBrain {
  private readonly memory = new Map<string, Memory>()
  private position: Vec3Tuple
  private ry: number
  private clip: NpcClip = 'idle'
  private clipSeq = 0
  private move: Move | null = null
  /** Waypoints still to walk after the current move, each started when the previous one ends. */
  private path: Array<{ to: Vec3Tuple; ms: number }> = []
  private say: string | null = null
  private sayUntil = 0
  private target: string | null = null
  private changed = true
  private world: BrainWorld = { now: 0, hour: 12, players: [] }

  readonly id: string
  private readonly tree: BehaviorTree
  private readonly home: NpcHome
  private readonly points: Readonly<Record<string, Vec3Tuple>>
  private readonly random: () => number
  private readonly plants: PlantSource
  private readonly shop: NpcShop | null
  private held: ShelfItem | null = null

  constructor(id: string, tree: BehaviorTree, home: NpcHome, points: Readonly<Record<string, Vec3Tuple>>, env: Partial<BrainEnv> = {}) {
    this.id = id
    this.tree = tree
    this.home = home
    this.points = points
    this.random = env.random ?? Math.random
    this.plants = env.plants ?? (() => [])
    this.shop = env.shop ?? null
    this.position = [...home.position]
    this.ry = home.yaw
  }

  /** One step of the tree; true when the public state changed and should be broadcast. */
  tick(world: BrainWorld): boolean {
    this.world = world
    while (this.move && world.now >= this.move.end) {
      this.position = [...this.move.to]
      const next = this.path.shift()
      this.move = next ? { from: [...this.position], to: next.to, start: this.move.end, end: this.move.end + next.ms } : null
      if (next) this.faceTowards(next.to)
      this.changed = true
    }
    if (this.say !== null && world.now >= this.sayUntil) this.setSay(null)
    this.run(this.tree.root)
    const changed = this.changed
    this.changed = false
    return changed
  }

  state(now: number): NpcState {
    const [x, y, z] = this.positionAt(now)
    const move = this.move ? { x: this.move.to[0], y: this.move.to[1], z: this.move.to[2], ms: Math.max(0, this.move.end - now) } : null
    return { id: this.id, x, y, z, ry: this.ry, clip: this.clip, clipSeq: this.clipSeq, move, say: this.say, held: this.held }
  }

  // ---------------------------------------------------------------- tree walk

  private mem(node: BtNode): Memory {
    let m = this.memory.get(node.id)
    if (!m) {
      m = { running: false, cooldownUntil: 0, loops: 0, index: 0, chosen: -1, started: false, endsAt: 0, serviceAt: [], stage: null }
      this.memory.set(node.id, m)
    }
    return m
  }

  private run(node: BtNode): Status {
    const m = this.mem(node)
    if (!m.running) {
      if (!this.canEnter(node) || !this.rollChance(node)) return 'failure'
      m.running = true
      m.loops = 0
      m.serviceAt = isComposite(node) ? node.services.map(() => this.world.now) : []
    } else if (node.decorators.some((d) => isCondition(d) && (d.abort === 'self' || d.abort === 'both') && !this.check(d))) {
      this.deactivate(node, true)
      return 'failure'
    }
    if (isComposite(node)) this.runServices(node, m)
    const status = isComposite(node) ? this.runComposite(node, m) : this.runTask(node, m)
    if (status === 'running') return status
    const loop = node.decorators.find((d): d is Extract<Decorator, { type: 'loop' }> => d.type === 'loop')
    if (status === 'success' && loop && (loop.count === 0 || ++m.loops < loop.count)) {
      this.restart(node)
      return 'running'
    }
    this.deactivate(node, true)
    return status
  }

  private canEnter(node: BtNode): boolean {
    const m = this.mem(node)
    if (this.world.now < m.cooldownUntil) return false
    return node.decorators.every((d) => !isCondition(d) || this.check(d))
  }

  private rollChance(node: BtNode): boolean {
    return node.decorators.every((d) => d.type !== 'chance' || this.random() * 100 < d.percent)
  }

  private check(c: Condition): boolean {
    let pass: boolean
    if (c.type === 'has_target') pass = this.targetPlayer() !== null
    else pass = c.from < c.to ? this.world.hour >= c.from && this.world.hour < c.to : this.world.hour >= c.from || this.world.hour < c.to
    return pass !== c.invert
  }

  private runComposite(node: CompositeNode, m: Memory): Status {
    if (node.type === 'random') {
      if (m.chosen < 0) m.chosen = this.pickWeighted(node.children)
      return this.run(node.children[m.chosen]!)
    }
    if (node.type === 'selector') this.checkLowerAborts(node, m)
    while (m.index < node.children.length) {
      const status = this.run(node.children[m.index]!)
      if (status === 'running') return status
      if (status === (node.type === 'selector' ? 'success' : 'failure')) return status
      m.index++
    }
    return node.type === 'selector' ? 'failure' : 'success'
  }

  /** A higher-priority sibling whose condition (abort lower/both) now passes takes over the running child. */
  private checkLowerAborts(node: CompositeNode, m: Memory): void {
    for (let j = 0; j < m.index && j < node.children.length; j++) {
      const child = node.children[j]!
      const watches = child.decorators.some((d) => isCondition(d) && (d.abort === 'lower' || d.abort === 'both'))
      if (!watches || !this.canEnter(child)) continue
      const running = node.children[m.index]
      if (running) this.deactivate(running, true)
      m.index = j
      return
    }
  }

  private pickWeighted(children: readonly BtNode[]): number {
    const total = children.reduce((sum, c) => sum + c.weight, 0)
    let roll = this.random() * total
    for (let i = 0; i < children.length; i++) {
      roll -= children[i]!.weight
      if (roll < 0) return i
    }
    return children.length - 1
  }

  /** Loop decorator: same node again, its children from the start. */
  private restart(node: BtNode): void {
    const m = this.mem(node)
    if (isComposite(node)) for (const child of node.children) this.deactivate(child, false)
    // a looping clip plays again next tick: no idle in between
    if (node.type !== 'animate') this.stopTask(node)
    m.index = 0
    m.chosen = -1
    m.started = false
    m.stage = null
  }

  /** Stops a node and everything running under it; `finished` starts its cooldown. */
  private deactivate(node: BtNode, finished: boolean): void {
    const m = this.memory.get(node.id)
    if (!m) return
    if (isComposite(node)) for (const child of node.children) this.deactivate(child, finished)
    if (m.running) {
      this.stopTask(node)
      if (finished) {
        const cooldown = node.decorators.find((d): d is Extract<Decorator, { type: 'cooldown' }> => d.type === 'cooldown')
        if (cooldown) m.cooldownUntil = this.world.now + cooldown.seconds * 1000
      }
    }
    m.running = false
    m.index = 0
    m.chosen = -1
    m.started = false
    m.stage = null
    m.loops = 0
  }

  private stopTask(node: BtNode): void {
    const m = this.mem(node)
    if (isComposite(node) || !m.started) return
    if (this.move) {
      this.position = this.positionAt(this.world.now)
      this.move = null
      this.path = []
      this.changed = true
    }
    if (node.type === 'checkout') this.shop?.line.leave(this.id)
    this.setClip('idle')
  }

  // ---------------------------------------------------------------- services

  private runServices(node: CompositeNode, m: Memory): void {
    node.services.forEach((service, i) => {
      if (this.world.now < (m.serviceAt[i] ?? 0)) return
      m.serviceAt[i] = this.world.now + service.interval * 1000
      this.perceive(service.radius)
    })
  }

  private perceive(radius: number): void {
    const [x, , z] = this.positionAt(this.world.now)
    let nearest: string | null = null
    let best = radius
    let keep = false
    for (const p of this.world.players) {
      const d = Math.hypot(p.x - x, p.z - z)
      if (p.sessionId === this.target && d <= radius + TARGET_KEEP_MARGIN) keep = true
      if (d <= best) {
        best = d
        nearest = p.sessionId
      }
    }
    if (!keep) this.target = nearest
  }

  private targetPlayer(): { x: number; z: number } | null {
    if (this.target === null) return null
    for (const p of this.world.players) if (p.sessionId === this.target) return p
    this.target = null
    return null
  }

  // ---------------------------------------------------------------- tasks

  private runTask(node: TaskNode, m: Memory): Status {
    if (!m.started) {
      m.started = true
      const status = this.startTask(node, m)
      if (status !== 'running') return status
    }
    if (node.type === 'checkout') return this.runCheckout(m)
    if (this.world.now < m.endsAt) return 'running'
    return this.nextStage(node, m)
  }

  private startTask(node: TaskNode, m: Memory): Status {
    const now = this.world.now
    switch (node.type) {
      case 'move_to': {
        const to = this.resolve(node.point)
        if (!to) return 'failure'
        return this.startMove(m, node.point === 'target' ? this.shortOf(to) : to, node.speed === 'run' ? RUN_SPEED : WALK_SPEED)
      }
      case 'wander': {
        const r = node.radius * Math.sqrt(this.random())
        const a = this.random() * Math.PI * 2
        const [hx, hy, hz] = this.home.position
        return this.startMove(m, [hx + Math.sin(a) * r, hy, hz + Math.cos(a) * r], node.speed === 'run' ? RUN_SPEED : WALK_SPEED)
      }
      case 'pick_crop': {
        const [hx, , hz] = this.home.position
        const around = this.plants(node.crop).filter(([x, , z]) => Math.hypot(x - hx, z - hz) <= node.radius)
        if (around.length === 0) return 'failure'
        const plant = around[Math.floor(this.random() * around.length)] ?? around[0]!
        m.stage = { kind: 'pick', plant }
        const stand = this.standNear(plant, this.isTree(plant) ? PICK_STAND.tree : PICK_STAND.crop)
        const walking = this.startMove(m, stand, node.speed === 'run' ? RUN_SPEED : WALK_SPEED)
        if (walking === 'success') m.endsAt = now
        return 'running'
      }
      case 'browse_shelf': {
        const [hx, , hz] = this.home.position
        const spots = (this.shop?.layout.spots ?? []).filter(({ stand: [x, , z] }) => Math.hypot(x - hx, z - hz) <= node.radius)
        if (spots.length === 0) return 'failure'
        const spot = spots[Math.floor(this.random() * spots.length)] ?? spots[0]!
        m.stage = { kind: 'browse', spot, step: 'walk' }
        if (this.startMove(m, spot.stand, WALK_SPEED) === 'success') m.endsAt = now
        return 'running'
      }
      case 'checkout': {
        const checkout = this.shop?.layout.checkout
        if (!checkout || !this.held) return 'failure'
        const place = this.shop!.line.join(this.id)
        m.stage = { kind: 'line', place, step: 'queue' }
        if (this.startMove(m, queueSpot(checkout, place), WALK_SPEED) === 'success') m.endsAt = now
        return 'running'
      }
      case 'wait':
        m.endsAt = now + (node.min + this.random() * (node.max - node.min)) * 1000
        return 'running'
      case 'face': {
        const to = this.resolve(node.point)
        if (!to) return 'failure'
        this.faceTowards(to)
        return 'success'
      }
      case 'animate':
        this.setClip(node.clip)
        m.endsAt = now + node.seconds * 1000
        return 'running'
      case 'say':
        this.setSay(node.lines[Math.floor(this.random() * node.lines.length)] ?? node.lines[0]!)
        this.sayUntil = now + node.seconds * 1000
        m.endsAt = this.sayUntil
        return 'running'
    }
  }

  private resolve(point: string): Vec3Tuple | null {
    if (point === 'home') return this.home.position
    if (point === 'target') {
      const p = this.targetPlayer()
      return p ? [p.x, this.position[1], p.z] : null
    }
    return this.points[point] ?? null
  }

  /** A multi-step task's current step is over: start the next one, or succeed. */
  private nextStage(node: TaskNode, m: Memory): Status {
    const now = this.world.now
    const stage = m.stage
    if (node.type === 'pick_crop' && stage?.kind === 'pick') {
      this.faceTowards(stage.plant)
      this.setClip('pick')
      m.stage = null
      m.endsAt = now + NPC_PICK_MS
      return 'running'
    }
    if (node.type === 'browse_shelf' && stage?.kind === 'browse') {
      if (stage.step === 'walk') {
        this.faceTowards(stage.spot.look)
        this.setClip('browse')
        m.stage = { ...stage, step: 'look' }
        m.endsAt = now + node.seconds * 1000
        return 'running'
      }
      if (stage.step === 'look' && this.random() * 100 < node.take) {
        this.setClip('take')
        this.setHeld(stage.spot.items[Math.floor(this.random() * stage.spot.items.length)] ?? stage.spot.items[0]!)
        m.stage = { ...stage, step: 'take' }
        m.endsAt = now + NPC_TAKE_MS
        return 'running'
      }
      this.setClip('idle')
    }
    return 'success'
  }

  /** In line at the checkout: move up as the shoppers ahead pay, pay at the front, then leave the line. */
  private runCheckout(m: Memory): Status {
    const stage = m.stage
    const checkout = this.shop?.layout.checkout
    if (stage?.kind !== 'line' || !checkout) return 'failure'
    const now = this.world.now
    if (stage.step === 'pay') {
      if (now < m.endsAt) return 'running'
      this.setHeld(null)
      this.shop!.line.leave(this.id)
      this.setClip('idle')
      return 'success'
    }
    const place = this.shop!.line.placeOf(this.id)
    if (place !== stage.place) {
      m.stage = { ...stage, place }
      if (this.startMove(m, queueSpot(checkout, place), WALK_SPEED) === 'success') m.endsAt = now
      return 'running'
    }
    if (now < m.endsAt) return 'running'
    if (place > 0) {
      this.faceTowards(queueSpot(checkout, place - 1))
      return 'running'
    }
    this.faceTowards(checkout.clerk)
    this.setClip('pay')
    m.stage = { ...stage, step: 'pay' }
    m.endsAt = now + NPC_PAY_MS + AFTER_PAY_MS
    return 'running'
  }

  private setHeld(item: ShelfItem | null): void {
    if (this.held?.code === item?.code && this.held?.key === item?.key) return
    this.held = item
    this.changed = true
  }

  private isTree(plant: Vec3Tuple): boolean {
    return this.plants('apple_tree').includes(plant)
  }

  /** A spot `distance` from the plant, on the NPC's side of it. */
  private standNear(plant: Vec3Tuple, distance: number): Vec3Tuple {
    const [x, , z] = this.position
    const d = Math.hypot(x - plant[0], z - plant[2])
    if (d < 0.01) return [plant[0] + distance, plant[1], plant[2]]
    return [plant[0] + ((x - plant[0]) / d) * distance, plant[1], plant[2] + ((z - plant[2]) / d) * distance]
  }

  private shortOf(to: Vec3Tuple): Vec3Tuple {
    const [x, y, z] = this.position
    const d = Math.hypot(to[0] - x, to[2] - z)
    if (d <= TARGET_STOP_DISTANCE) return [x, y, z]
    const k = (d - TARGET_STOP_DISTANCE) / d
    return [x + (to[0] - x) * k, to[1], z + (to[2] - z) * k]
  }

  /** Walks to `to` (around the shelves in a shop); `m.endsAt` is the arrival. */
  private startMove(m: Memory, to: Vec3Tuple, speed: number): Status {
    const now = this.world.now
    // a new move can start mid-walk (moving up in a checkout line): it leaves from where the NPC is now
    this.position = this.positionAt(now)
    const from: Vec3Tuple = [...this.position]
    if (Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) < 0.05) {
      this.move = null
      this.path = []
      return 'success'
    }
    const waypoints = this.shop?.nav?.route(from, to) ?? [to]
    let previous = from
    const legs = waypoints.map((point) => {
      const ms = (Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]) / speed) * 1000
      previous = point
      return { to: [...point] as Vec3Tuple, ms }
    })
    const first = legs.shift()!
    this.move = { from, to: first.to, start: now, end: now + first.ms }
    this.path = legs
    this.faceTowards(first.to)
    if (this.clip !== 'idle') this.setClip('idle')
    m.endsAt = now + first.ms + legs.reduce((sum, leg) => sum + leg.ms, 0)
    this.changed = true
    return 'running'
  }

  private faceTowards(to: Vec3Tuple): void {
    const [x, , z] = this.positionAt(this.world.now)
    if (Math.hypot(to[0] - x, to[2] - z) < 0.01) return
    const ry = Math.atan2(to[0] - x, to[2] - z)
    if (ry === this.ry) return
    this.ry = ry
    this.changed = true
  }

  private positionAt(now: number): Vec3Tuple {
    if (!this.move) return [...this.position]
    const { from, to, start, end } = this.move
    const t = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)))
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]
  }

  private setClip(clip: NpcClip): void {
    if (clip !== 'idle') this.clipSeq++
    else if (this.clip === 'idle') return
    this.clip = clip
    this.changed = true
  }

  private setSay(text: string | null): void {
    this.say = text
    this.changed = true
  }
}
