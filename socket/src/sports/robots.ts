import type { GameRoom, Player, Vec3 } from '../types.ts'

export const ROBOT_LEVELS = ['easy', 'normal', 'hard'] as const
export type RobotLevel = typeof ROBOT_LEVELS[number]

type RobotRoom = Pick<GameRoom, 'sports' | 'forEachClient'>
type RobotFactory = (number: number, at: Vec3, coach: string) => { robot: Player, view: unknown }

let factory: RobotFactory | null = null

export function useRobotFactory(make: RobotFactory): void {
  factory = make
}

export function isRobot(accountId: number): boolean {
  return accountId < 0
}

export function robotLevelOf(raw: unknown): RobotLevel | null {
  return ROBOT_LEVELS.find((level) => level === raw) ?? null
}

export function sportsPlayer(room: Pick<GameRoom, 'players' | 'sports'>, sessionId: string): Player | undefined {
  return room.players.get(sessionId) ?? room.sports.robots.get(sessionId)
}

export function robotViews(room: Pick<GameRoom, 'sports'>): unknown[] {
  return [...room.sports.robotViews.values()]
}

export function addRobot(room: RobotRoom, at: Vec3, coach: string): Player {
  const number = room.sports.nextRobot
  room.sports.nextRobot += 1
  if (!factory) throw new Error('sports robots: useRobotFactory was not called')
  const { robot, view } = factory(number, at, coach)
  room.sports.robots.set(robot.sessionId, robot)
  room.sports.robotViews.set(robot.sessionId, view)
  room.forEachClient((c) => c.send('user_joined', view))
  return robot
}

export function removeRobot(room: RobotRoom, sessionId: string): void {
  if (!room.sports.robots.delete(sessionId)) return
  room.sports.robotViews.delete(sessionId)
  room.forEachClient((c) => c.send('user_left', { sessionId }))
}

export function placeRobot(room: RobotRoom, robot: Player, x: number, y: number, z: number, ry: number, now: number): void {
  Object.assign(robot, { x, y, z, ry, lastMoveAt: now })
  room.forEachClient((c) => c.send('user_moved', { sessionId: robot.sessionId, x, y, z, ry }))
}
