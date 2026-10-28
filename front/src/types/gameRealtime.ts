export interface RemoteUserPayload {
  sessionId: string
  id: string
  pseudo: string
  color: number
  x: number
  y: number
  z: number
  /** Camera yaw (radians), 0 = looking towards -Z. */
  ry?: number
  slotHexes?: Record<string, string>
  bodyModelGlb?: string | null
}

/** Another player ate or drank (socket/src/survival.js); `code` is the food item, null for a fountain sip. */
export interface UserActionPayload {
  sessionId: string
  action: 'eat' | 'drink'
  code: string | null
}

export interface HousingUnitPayload {
  unit_id: number
  public_id: string
  offer_type: string
  price_coins: number
  tax_coins: number
  pos_x: number
  pos_y: number
  pos_z: number
  size: number
  base_color_hex: string
  /** House asset key (assets/houses/<model_key>/); null for legacy MVP cubes. */
  model_key: string | null
  status: string
  occupant_account_id: number | null
  occupant_name: string | null
  tax_due_at: string | null
  door_locked: boolean
  room_public_id: string | null
  template_key: string
  key_holder_account_ids: number[]
}

export interface RoomInitPayload {
  me: RemoteUserPayload
  users: RemoteUserPayload[]
  housingUnits?: HousingUnitPayload[]
  houseFurniture?: HouseFurniturePayload[]
  openDoors?: string[]
}

export interface HouseFurniturePayload {
  template_key: string
  model_key: string | null
  occupant_account_id: number
  objects: ApartmentObjectPayload[]
}

export interface ApartmentObjectPayload {
  objectId: string
  objectKey: string
  modelGlb?: string | null
  variant: string | null
  color: string | null
  x: number
  y: number
  z: number
  rotX: number
  rotY: number
  rotZ: number
}

export interface ApartmentInventoryItem {
  item_def_id: number
  code: string
  name: string
  kind: string
  quantity: number
  preview_image: string | null
  model_glb: string | null
  /** Food / drinks: bites per item and bites left on the item being eaten (4/4 -> 3/4 ...). */
  portions?: number | null
  portions_left?: number | null
}
