import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **Die Paletten bestehen bei jedem Push** (T173): `npm run contrast` prüft die
 * Farbpaare aus `tokens.css`, auch die getönten Flächen (`color-mix`) — lief
 * aber nur von Hand. axe in der Laufzeit-Messung sieht nur, was in den
 * gemessenen Zuständen gezeichnet ist; diese Probe jedes Paar beider Paletten.
 */
describe('Kontrast der Paletten', () => {
  it('aller Text in beiden Paletten ist lesbar (`npm run contrast`)', () => {
    const lauf = spawnSync(process.execPath, [join(import.meta.dirname, 'check-contrast.mjs')], { encoding: 'utf8' })
    expect(lauf.stderr).toBe('')
    expect(lauf.status).toBe(0)
    expect(lauf.stdout).toContain('Beide Paletten vollständig, aller Text lesbar.')
  })
})
