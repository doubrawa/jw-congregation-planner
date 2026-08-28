/**
 * Was passiert, wenn eine Tabelle eine Lücke hat?
 *
 * T1 war genau das: der Monat stand in der einen Tabelle und nicht in der
 * anderen, `undefined` lief weiter, und im Programm stand „Tue, undefined 8" —
 * im Intl-Pfad ein `RangeError`, ohne Error Boundary der Totalausfall der App.
 *
 * Geprüft wird deshalb nicht der Normalfall (das tut translate.test.ts),
 * sondern der Datenpflege-Unfall: ein Wochentags- oder Monatsname, den die
 * Sprache nicht führt. Die Regel muss dann **ganz entfallen** und der deutsche
 * Text stehen bleiben — sichtbar unübersetzt ist immer besser als „undefined".
 *
 * Die Lücke wird über einen Mock der Datentabellen erzeugt: von Hand lässt sie
 * sich nicht auslösen, weil Ausdruck und Tabelle heute übereinstimmen. Genau
 * dieses Übereinstimmen ist aber eine Verabredung zwischen zwei Dateien — und
 * Verabredungen halten nur, solange jemand sie prüft.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../supabase/functions/_shared/i18n/translate-data.ts', async () => {
  const echt =
    await vi.importActual<typeof import('../../supabase/functions/_shared/i18n/translate-data.ts')>('../../supabase/functions/_shared/i18n/translate-data.ts')
  const en = echt.D.en
  if (!en) throw new Error('Testaufbau: D.en fehlt')
  return {
    ...echt,
    D: {
      ...echt.D,
      // „Sprache mit unvollständig gepflegten Listen": Wochentage brechen nach
      // Mittwoch ab, Monate nach Februar. Kein übernommener jw.org-Inhalt —
      // die echten Listen bleiben, gekürzt wird nur.
      en: { ...en, wd: en.wd.slice(0, 3), wda: en.wda.slice(0, 3), mon: en.mon.slice(0, 2), mona: en.mona.slice(0, 2) },
    },
  }
})

const { makeTr } = await import('./translate')

describe('Lücke in den Datumslisten einer Sprache', () => {
  const tr = makeTr('en')

  it('ein fehlender Wochentag lässt das Datum deutsch stehen', () => {
    // Mittwoch (Index 2) ist noch da, Donnerstag (3) nicht mehr.
    expect(tr('Mittwoch, 8. Januar')).not.toBe('Mittwoch, 8. Januar')
    expect(tr('Donnerstag, 8. Januar')).toBe('Donnerstag, 8. Januar')
    expect(tr('Do, 8. Januar')).toBe('Do, 8. Januar')
    expect(tr('Do 19:00')).toBe('Do 19:00')
  })

  it('ein fehlender Monat lässt das Datum deutsch stehen', () => {
    // Februar (Index 1) ist noch da, März (2) nicht mehr.
    expect(tr('Montag, 8. Februar')).not.toBe('Montag, 8. Februar')
    expect(tr('Montag, 8. März')).toBe('Montag, 8. März')
    expect(tr('7.–13. März')).toBe('7.–13. März')
    expect(tr('28. Mär – 4. Apr')).toBe('28. Mär – 4. Apr')
  })

  it('nirgends steht „undefined", „NaN" oder „Invalid Date"', () => {
    const formen = [
      'Donnerstag, 8. Januar', 'Do, 8. Januar', 'Do 19:00',
      'Montag, 8. März', '7.–13. März', '28. Mär – 4. Apr',
      'Demoaufgabe 10 · Do, 8. Mär · ca. 19:35',
    ]
    for (const s of formen) {
      expect(() => tr(s)).not.toThrow()
      expect(tr(s), s).not.toMatch(/undefined|Invalid Date|NaN/)
    }
  })
})
