import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HANDBUCH, HANDBUCH_REPO } from '../src/profil/handbuch'

/**
 * **Die Verweise auf die Handbücher führen dorthin, wo sie liegen**
 * (1.11.2026). Die App zeigt auf GitHub (`src/profil/handbuch.ts`); wird ein
 * Handbuch umbenannt oder verschoben, liefe der Verweis im Profil ins Leere —
 * und das fiele erst dem auf, der ihn antippt.
 */
describe('Handbuch-Verweise', () => {
  it.each(Object.entries(HANDBUCH))('%s zeigt auf eine Datei im Repo', (_rolle, url) => {
    expect(url.startsWith(HANDBUCH_REPO)).toBe(true)
    expect(existsSync(resolve(url.slice(HANDBUCH_REPO.length))), url).toBe(true)
  })

  it('… und jede Rolle auf das Handbuch, das die Übersicht ihr zuordnet', () => {
    // Die Übersicht `docs/user-guide/README.md` sagt, für wen welches Handbuch
    // ist („– für alle Verkündiger", „– zusätzlich für Planer und Admins").
    // Vertauschte Verweise führten den Verkündiger ins Handbuch der Planer.
    const uebersicht = readFileSync(resolve('docs/user-guide/README.md'), 'utf8').split('\n')
    const wofuer: Record<keyof typeof HANDBUCH, string> = { verkuendiger: 'für alle Verkündiger', planer: 'für Planer' }
    for (const [rolle, url] of Object.entries(HANDBUCH) as [keyof typeof HANDBUCH, string][]) {
      const datei = url.split('/').at(-1)!
      expect(uebersicht.find((z) => z.includes(`(${datei})`)), datei).toContain(wofuer[rolle])
    }
  })
})
