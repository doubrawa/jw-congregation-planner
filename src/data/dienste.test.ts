import { describe, expect, it } from 'vitest'
import {
  dienstAusWochenEntfernen,
  dienstBereichEntfernen,
  dienstZusagenKeys,
  gruppeInWochenUmbenennen,
  ohneDienstZusagen,
} from './dienste'
import { emptyQualifications, privWert, serviceQualKey } from './helpers'
import { helferKey } from './planning'
import type { Person, Service, Week } from './types'

/**
 * **Was ein gelöschter Hilfsdienst hinterlässt — und wer es wegräumt.**
 *
 * Ein Dienst zieht drei Spuren durch die Daten, und alle drei liegen in JSONB;
 * die Datenbank kann hier also keinen Fremdschlüssel anbieten. Bis zum
 * 18. September 2026 blieb deshalb alles stehen:
 *
 *  1. je Person ein Aufgabenbereich `svc:<key>`,
 *  2. je Zusammenkunft eine Platzreihe `helpers[<key>]`,
 *  3. je besetztem Platz eine Bestätigung.
 *
 * **Sichtbar war das nicht** — die Anzeige geht über die Liste der Dienste, und
 * ein gelöschter steht nicht mehr darin. Gemerkt hätte man es erst bei einem
 * Dienst mit festem Schlüssel (`ton`, `mik`, …): Wer ihn löscht und später neu
 * anlegt, bekäme lautlos die alten Freigaben und die alten Besetzungen zurück.
 * Genau diese Stille ist der Grund für diese Datei.
 *
 * Das Gegenstück, das Löschen einer **Gruppe**, räumt seit jeher auf
 * (`fsGruppeEntfernen`); hier fehlte es schlicht.
 */

const person = (id: string, ...bereiche: string[]): Person => {
  const priv = emptyQualifications()
  for (const b of bereiche) priv[b as `svc:${string}`] = true
  return { id, fn: id, ln: 'Test', role: 'verkuendiger', mail: '', priv }
}

const TON = serviceQualKey('ton')
const MIK = serviceQualKey('mik')

/** Eine Woche mit zwei Hilfsdiensten je Zusammenkunft. */
function woche(start = '2026-09-07'): Week {
  const leer = { end: '', sections: [], date: '' }
  return {
    range: '',
    book: '',
    start,
    
    mid: { ...leer, helpers: { ton: [{ name: 'A. Berg' }], mik: [{ name: 'B. Kern' }] } },
    we: { ...leer, helpers: { ton: [{ name: 'C. Wald' }] } },
  }
}

describe('Der Aufgabenbereich verschwindet mit dem Dienst', () => {
  it('nimmt `svc:<key>` aus jeder Person, die ihn trägt', () => {
    const persons = [person('p1', TON, MIK), person('p2', MIK)]
    const next = dienstBereichEntfernen(persons, 'ton')
    expect(privWert(next[0]!.priv, TON)).toBe(false)
    expect(TON in next[0]!.priv).toBe(false) // nicht auf false gesetzt, sondern weg
    expect(privWert(next[0]!.priv, MIK)).toBe(true)
  })

  it('trägt ihn niemand, bleibt die Liste identisch', () => {
    // Daran erkennt `persist.ts`, dass nichts zu schreiben ist — dieselbe Linie
    // wie in `fs.ts`, `meeting-edit.ts` und `termine.ts`.
    const persons = [person('p1', MIK)]
    expect(dienstBereichEntfernen(persons, 'ton')).toBe(persons)
  })

  it('unbeteiligte Personen behalten ihre Referenz', () => {
    const persons = [person('p1', TON), person('p2', MIK)]
    const next = dienstBereichEntfernen(persons, 'ton')
    expect(next[0]).not.toBe(persons[0])
    expect(next[1]).toBe(persons[1])
  })
})

describe('Die Platzreihe verschwindet aus den geladenen Wochen', () => {
  it('nimmt `helpers[<key>]` aus beiden Zusammenkünften', () => {
    const weeks = [woche()]
    const next = dienstAusWochenEntfernen(weeks, 'ton')
    expect('ton' in next[0]!.mid.helpers).toBe(false)
    expect('ton' in next[0]!.we.helpers).toBe(false)
    // Der andere Dienst bleibt unberührt — sonst verlöre ein Löschen mehr als
    // seinen eigenen Platz.
    expect(next[0]!.mid.helpers.mik).toEqual([{ name: 'B. Kern' }])
  })

  it('eine Woche ohne diesen Dienst behält ihre Referenz', () => {
    const weeks = [woche(), woche('2026-09-14')]
    delete weeks[1]!.mid.helpers.ton
    delete weeks[1]!.we.helpers.ton
    const next = dienstAusWochenEntfernen(weeks, 'ton')
    expect(next[0]).not.toBe(weeks[0])
    expect(next[1]).toBe(weeks[1])
  })

  it('ohne jede Spur bleibt dieselbe Liste stehen', () => {
    const weeks = [woche()]
    expect(dienstAusWochenEntfernen(weeks, 'gibtsnicht')).toBe(weeks)
  })
})

describe('Die Bestätigungen der Plätze gehen mit', () => {
  it('nennt je Woche, Zusammenkunft und Platz den Schlüssel', () => {
    // Gesucht wird in den **Wochen**, nicht in der Bestätigungs-Karte: Ein
    // Schlüssel entsteht aus Woche, Zusammenkunft, Dienst und Platznummer; wer
    // ihn zurücklesen wollte, käme bei einem Dienstnamen mit `|` durcheinander.
    const keys = dienstZusagenKeys([woche()], 'ton')
    expect(keys).toEqual([
      helferKey('2026-09-07', 'mid', 'ton', 0),
      helferKey('2026-09-07', 'we', 'ton', 0),
    ])
  })

  it('nimmt genau diese aus der Karte — und lässt die übrigen stehen', () => {
    const key = helferKey('2026-09-07', 'mid', 'ton', 0)
    const fremd = helferKey('2026-09-07', 'mid', 'mik', 0)
    const map = { [key]: 'bestätigt' as const, [fremd]: 'verhindert' as const }
    const next = ohneDienstZusagen(map, [key])
    expect(next[key]).toBeUndefined()
    expect(next[fremd]).toBe('verhindert')
    // Ist nichts zu entfernen, bleibt dieselbe Karte — der Zustand ändert sich
    // dann gar nicht.
    expect(ohneDienstZusagen(map, ['nichts'])).toBe(map)
  })
})

/**
 * **Eine umbenannte Gruppe in der geplanten Reinigung** (T121, Phase 6c-3).
 * Ein Gruppen-Dienst kennt seine Gruppe nur beim Namen. Gefunden beim
 * Schreiben des Handbuchs: Seit die Namen frei sind, stand nach dem Umbenennen
 * in jeder geplanten Woche weiter der alte.
 */
describe('Eine umbenannte Gruppe zieht durch die Reinigung', () => {
  const DIENSTE: Service[] = [
    { key: 'ton', name: 'Ton', count: 1, groups: false },
    { key: 'rein', name: 'Reinigung', count: 1, groups: true },
  ]
  const mitReinigung = (start: string, gruppe: string): Week => {
    const w = woche(start)
    return { ...w, mid: { ...w.mid, helpers: { ...w.mid.helpers, rein: [{ name: gruppe }] } } }
  }

  it('ersetzt den alten Namen an den Plätzen der Gruppen-Dienste', () => {
    const weeks = [mitReinigung('2026-09-07', 'Gruppe 3'), mitReinigung('2026-09-14', 'Gruppe 1')]
    const next = gruppeInWochenUmbenennen(weeks, DIENSTE, 'Gruppe 3', 'Nord')
    expect(next[0]!.mid.helpers.rein).toEqual([{ name: 'Nord' }])
    // Die Woche einer anderen Gruppe behält ihre Referenz — `persist.ts` schreibt sie nicht.
    expect(next[1]).toBe(weeks[1])
  })

  it('ein Dienst für Personen bleibt, auch wenn dort zufällig derselbe Text steht', () => {
    const w = woche()
    const weeks = [{ ...w, mid: { ...w.mid, helpers: { ...w.mid.helpers, ton: [{ name: 'Gruppe 3' }] } } }]
    expect(gruppeInWochenUmbenennen(weeks, DIENSTE, 'Gruppe 3', 'Nord')).toBe(weeks)
  })

  it('ohne Gruppen-Dienst, ohne Änderung oder ohne alten Namen bleibt dieselbe Liste', () => {
    const weeks = [mitReinigung('2026-09-07', 'Gruppe 3')]
    expect(gruppeInWochenUmbenennen(weeks, DIENSTE.slice(0, 1), 'Gruppe 3', 'Nord')).toBe(weeks)
    expect(gruppeInWochenUmbenennen(weeks, DIENSTE, 'Gruppe 3', 'Gruppe 3')).toBe(weeks)
    expect(gruppeInWochenUmbenennen(weeks, DIENSTE, '', 'Nord')).toBe(weeks)
  })
})
