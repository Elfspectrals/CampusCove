import * as THREE from 'three'

/**
 * The group a store fills with its displays, clerk and tags inside its interior. Store interiors are cached by the
 * town between two visits of /game while the store composables are created again, so a group left by the previous
 * visit is removed first: without it every clerk, model and tag shows twice after coming back to the game.
 */
export function freshDisplayGroup(interior: THREE.Group, name: string): THREE.Group {
  for (const stale of interior.children.filter((child) => child.name === name)) interior.remove(stale)
  const group = new THREE.Group()
  group.name = name
  interior.add(group)
  return group
}
