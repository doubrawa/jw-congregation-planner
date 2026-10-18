import { describe, expect, it } from 'vitest'
import { besuchsTreffpunktText } from './gruppenbesuch-anzeige'
import { treffpunktTagLabel } from './treffpunkt-beschriftung'

/**
 * **Der Treffpunkt der Besuchswoche als eine Zeile** („Samstag, 19. September
 * · 09:30 · Bei Familie A"). Der Ort ist ein freies Feld und darf fehlen —
 * beim Bearbeiten einer Regel im Grundplan wird er ungekürzt gespeichert. Dann
 * endet die Zeile mit der Zeit, ohne Trenner dahinter; ein Ort aus Leerzeichen
 * gilt wie überall als keiner (Review 18.10.2026: an drei Stellen hieß es so,
 * hier nicht).
 */
describe('besuchsTreffpunktText', () => {
  const ohneUebersetzung = (s: string) => s
  const tag = treffpunktTagLabel('2026-09-14', 6, 'de')

  it('Tag, Zeit und Ort, durch Punkte getrennt', () => {
    expect(besuchsTreffpunktText('2026-09-14', { wd: 6, time: '09:30', place: 'Bei Familie A' }, 'de', ohneUebersetzung)).toBe(
      `${tag} · 09:30 · Bei Familie A`,
    )
  })

  it('ohne Ort endet sie mit der Zeit — auch wenn nur Leerzeichen dastehen', () => {
    for (const place of ['', '   ']) {
      expect(besuchsTreffpunktText('2026-09-14', { wd: 6, time: '09:30', place }, 'de', ohneUebersetzung)).toBe(`${tag} · 09:30`)
    }
  })
})
