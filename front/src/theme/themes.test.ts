import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_THEME, THEME_IDS, THEME_STORAGE_KEY, parseTheme } from './themes.ts'

const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8')
const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

test('a saved theme is read back, anything else falls back to the default', () => {
  assert.equal(parseTheme('arcade'), 'arcade')
  assert.equal(parseTheme('cosy'), 'cosy')
  assert.equal(parseTheme(null), DEFAULT_THEME)
  assert.equal(parseTheme(''), DEFAULT_THEME)
  assert.equal(parseTheme('cove-nights'), DEFAULT_THEME)
  assert.equal(parseTheme('Arcade'), DEFAULT_THEME)
})

test('every theme has its own token block in style.css', () => {
  for (const id of THEME_IDS) {
    assert.ok(styles.includes(`[data-theme='${id}']`), `missing [data-theme='${id}'] in style.css`)
  }
})

test('index.html applies the saved theme before the first paint, with the same storage key', () => {
  assert.ok(indexHtml.includes(`localStorage.getItem('${THEME_STORAGE_KEY}')`))
})
