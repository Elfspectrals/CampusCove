import { parseMallTemplate, parseTemplateAssignments, samePreset, type MallCell, type MallTemplate } from './mallTemplate.ts'

const MALL_TEMPLATES_URL = '/assets/store/mall/templates'
export const MALL_TEMPLATE_ASSIGNMENTS_URL = '/assets/store/mall/template_assignments.json'

export interface FilledCell {
  cell: MallCell
  template: MallTemplate
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

export function mallTemplateUrl(key: string): string {
  return `${MALL_TEMPLATES_URL}/${key}.json`
}

export async function fetchFilledCells(mallLayoutUrl: string): Promise<FilledCell[]> {
  const [layout, rawAssignments] = await Promise.all([fetchJson(mallLayoutUrl), fetchJson(MALL_TEMPLATE_ASSIGNMENTS_URL)])
  const cells = (layout as { cells?: MallCell[] }).cells
  if (!Array.isArray(cells)) throw new Error(`${mallLayoutUrl}: no cells array`)
  const assignments = parseTemplateAssignments(rawAssignments)
  for (const cell of cells) {
    if (cell.template && assignments.cells[cell.id] !== cell.template) console.error(`[mall] ${cell.id} was built open for ${cell.template} but is no longer assigned: rebuild the mall`)
  }
  const results = await Promise.allSettled(
    Object.entries(assignments.cells).map(async ([cellId, key]) => {
      const cell = cells.find((c) => c.id === cellId)
      if (!cell) throw new Error(`${MALL_TEMPLATE_ASSIGNMENTS_URL}: cell ${cellId} is not in ${mallLayoutUrl}`)
      if (cell.template !== key) throw new Error(`${cellId} is assigned ${key} but the mall was built with ${cell.template ?? 'no template'}: rebuild the mall`)
      const template = parseMallTemplate(await fetchJson(mallTemplateUrl(key)))
      if (!samePreset(cell, template.preset)) throw new Error(`${key} is ${template.preset.width}×${template.preset.depth}, cell ${cellId} is ${cell.width}×${cell.depth}`)
      return { cell, template }
    }),
  )
  for (const result of results) if (result.status === 'rejected') console.error('[mall] a cell template failed to load', result.reason)
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
}
