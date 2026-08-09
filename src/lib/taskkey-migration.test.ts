import { describe, expect, it } from 'vitest'
import { migrateTaskKeyWeeks } from './data'
import type { ConfirmationMap, Meeting, Week } from '../data/types'

/**
 * T66 Stufe 2 — die Woche im `task_key` wandert von der Position auf ihr Datum.
 *
 * Das ist der Teil des Umbaus, an dem **echte Bestätigungen** hängen: Geht hier
 * etwas schief, zeigt die Zusage eines Bruders auf eine andere Woche oder ins
 * Leere. Deshalb dieselben zwei Zusicherungen wie bei T37 — idempotent und
 * verlustfrei — und beide einzeln geprüft.
 */

const leer = (): Meeting => ({ date: '', end: '', sections: [], helpers: {} })
const woche = (start: string): Week => ({
  range: '', book: '', start, current: false, mid: leer(), we: leer(),
})

/** Drei aufeinanderfolgende Wochen ab Montag, 7. September 2026. */
const WOCHEN = [woche('2026-09-07'), woche('2026-09-14'), woche('2026-09-21')]

describe('migrateTaskKeyWeeks', () => {
  it('schreibt die Position auf die Kennung um', () => {
    const alt: ConfirmationMap = {
      '0|mid|part|k3f9x|0': 'bestätigt',
      '2|we|helper|mik|1': 'verhindert',
    }
    const { confirmations, renames } = migrateTaskKeyWeeks(WOCHEN, alt)
    expect(confirmations).toEqual({
      '2026-09-07|mid|part|k3f9x|0': 'bestätigt',
      '2026-09-21|we|helper|mik|1': 'verhindert',
    })
    expect(renames).toEqual([
      ['0|mid|part|k3f9x|0', '2026-09-07|mid|part|k3f9x|0'],
      ['2|we|helper|mik|1', '2026-09-21|we|helper|mik|1'],
    ])
  })

  it('auch die Treffpunkte — dort steht die Woche an zweiter Stelle', () => {
    const { confirmations } = migrateTaskKeyWeeks(WOCHEN, { 'fs|1|inst7': 'bestätigt' })
    expect(confirmations).toEqual({ 'fs|2026-09-14|inst7': 'bestätigt' })
  })

  it('und den alten Positions-Schlüssel aus der Zeit vor T37', () => {
    // Sechs Felder statt fünf: Abschnitt und laufende Nummer statt Kennung.
    const { confirmations } = migrateTaskKeyWeeks(WOCHEN, { '1|mid|part|2|1|0': 'bestätigt' })
    expect(confirmations).toEqual({ '2026-09-14|mid|part|2|1|0': 'bestätigt' })
  })

  it('ist idempotent — ein zweiter Lauf ändert nichts', () => {
    const einmal = migrateTaskKeyWeeks(WOCHEN, { '0|mid|part|k3f9x|0': 'bestätigt' })
    const zweimal = migrateTaskKeyWeeks(WOCHEN, einmal.confirmations)
    expect(zweimal.renames).toEqual([])
    // Dieselbe Referenz zurück: nichts zu tun heißt auch nichts zu schreiben.
    expect(zweimal.confirmations).toBe(einmal.confirmations)
  })

  /*
    **Verlustfrei.** Zeigt ein Schlüssel auf eine Woche, die gerade nicht
    geladen ist (älter als WEEK_LIMIT), kennt der Client ihr Datum nicht. Ihn
    dann zu raten oder wegzuwerfen wäre beides falsch — er bleibt stehen und
    wartet auf einen Ladevorgang, der seine Woche umfasst.
  */
  it('lässt Schlüssel nicht geladener Wochen unangetastet', () => {
    const alt: ConfirmationMap = { '60|mid|part|k3f9x|0': 'bestätigt' }
    const { confirmations, renames } = migrateTaskKeyWeeks(WOCHEN, alt)
    expect(renames).toEqual([])
    expect(confirmations).toBe(alt)
  })

  it('ebenso Wochen ohne Datum (Altbestand vor migration-017)', () => {
    const ohneDatum = [{ ...woche(''), start: '' }]
    const alt: ConfirmationMap = { '0|mid|part|k3f9x|0': 'bestätigt' }
    expect(migrateTaskKeyWeeks(ohneDatum, alt).confirmations).toBe(alt)
  })

  it('und Fremdformate, die gar keine Woche vorn tragen', () => {
    const alt: ConfirmationMap = { 'irgendwas': 'bestätigt', 'x|mid|part|a|0': 'verhindert' }
    expect(migrateTaskKeyWeeks(WOCHEN, alt).confirmations).toBe(alt)
  })

  /*
    Der Fall, an dem die Ganzzahl-Prüfung wirklich hängt — und der einzige:
    `Number('')` ist **0**, nicht `NaN`. Ohne sie würde ein Schlüssel mit leerem
    ersten Feld der Woche 0 zugeschlagen, und eine Bestätigung wanderte an einen
    Punkt, zu dem sie nie gehörte. Bei allem anderen (Datum, Buchstaben) ergibt
    `Number` ein `NaN`, das die Nachschau ohnehin abfängt.
  */
  it('ein leeres erstes Feld ist keine Woche 0', () => {
    const alt: ConfirmationMap = { '|mid|part|a|0': 'bestätigt' }
    expect(migrateTaskKeyWeeks(WOCHEN, alt).confirmations).toBe(alt)
  })

  it('mischt beide Formen, ohne die schon umgestellten anzufassen', () => {
    // Der reale Fall: ein Planer hat geladen (Teil umgestellt), ein zweiter
    // schreibt danach mit einem älteren Client weiter.
    const gemischt: ConfirmationMap = {
      '2026-09-07|mid|part|a|0': 'bestätigt',
      '1|mid|part|b|0': 'verhindert',
    }
    const { confirmations, renames } = migrateTaskKeyWeeks(WOCHEN, gemischt)
    expect(renames).toEqual([['1|mid|part|b|0', '2026-09-14|mid|part|b|0']])
    expect(confirmations).toEqual({
      '2026-09-07|mid|part|a|0': 'bestätigt',
      '2026-09-14|mid|part|b|0': 'verhindert',
    })
  })

  it('verliert keinen Status', () => {
    const alt: ConfirmationMap = {
      '0|mid|part|a|0': 'bestätigt',
      '1|we|part|b|0': 'verhindert',
      'fs|2|inst3': 'bestätigt',
    }
    const { confirmations } = migrateTaskKeyWeeks(WOCHEN, alt)
    expect(Object.keys(confirmations)).toHaveLength(3)
    expect(Object.values(confirmations).sort()).toEqual(['bestätigt', 'bestätigt', 'verhindert'])
  })
})
