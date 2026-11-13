type Vec3 = [number, number, number]

export interface PoliceStationLayout {
  desk: Vec3
  officer: Vec3
  lockers: Vec3
}

export const FRONT_DESK_REACH = 2.8
export const LOCKER_REACH = 2.3
const HEIGHT_REACH = 2

export interface Position {
  x: number
  y: number
  z: number
}

function within(point: Vec3, at: Position, reach: number): boolean {
  return Math.hypot(point[0] - at.x, point[2] - at.z) <= reach && Math.abs(point[1] - at.y) <= HEIGHT_REACH
}

export function atFrontDesk(station: PoliceStationLayout, at: Position): boolean {
  return within(station.desk, at, FRONT_DESK_REACH) || within(station.officer, at, FRONT_DESK_REACH)
}

export function atLockers(station: PoliceStationLayout, at: Position): boolean {
  return within(station.lockers, at, LOCKER_REACH)
}
