/*
 * **Eine Lücke im Bestand darf die Treffpunkte nicht verschieben** (T100).
 *
 * Die Wochen liegen seit T66 nach Datum nebeneinander, ohne Platzhalter: „eine
 * fehlende Woche ist eine fehlende Woche und verschiebt nichts" (`lib/data.ts`).
 * Die Treffpunkte rechneten ihren Montag aber weiter als `fsBase + wi·7` — also
 * aus der **Ordnungszahl**. Fehlt eine Zeile, liegt von dort an jede Woche
 * sieben Tage daneben, und zwar dreifach:
 *
 *  - der Aufgaben-Schlüssel trifft die Bestätigung nicht mehr,
 *  - die Edge Functions nehmen den Montag aus der **Datenbankzeile** und reden
 *    damit über eine andere Woche als der Client — „Plan senden" meldet
 *    „0 gesendet", und die Zahl auf dem Knopf bleibt stehen,
 *  - das angezeigte Datum und die Monatsregel („1. Samstag") sitzen falsch.
 *
 * Der Fehler ist in jedem Fall still. Nichts schlägt fehl; ein Leiter gilt
 * wieder als unbestätigt, bekommt Erinnerungen für etwas, das er zugesagt hat,
 * und liest ein Datum, an dem nichts stattfindet.
 *
 * **Warum es lange niemand sah:** Ohne Lücke sind beide Rechnungen identisch.
 * Jeder Test mit lückenlosem Bestand ist grün — auch der falsche Code.
 */
import { describe, expect, it } from 'vitest'
import {
  deriveMyFsTasks,
  fsPendingIds,
  fsTag,
  fsTaskKey,
  fsWochenKennungen,
  fsWochenStart,
  genFsWeek,
} from './fs'
import { migrateFsWochenKeys } from '../lib/data'
import { entzogeneZusagen, offeneMeldungen } from './plan-versand'
import type { ConfirmationMap, FsInstance, FsRule, Week } from './types'

/** Drei Wochen — und die mittlere fehlt im Bestand. */
const MIT_LUECKE = [{ start: '2026-09-07' }, { start: '2026-09-21' }, { start: '2026-09-28' }]
/** Dieselben Wochen lückenlos — hier müssen beide Rechnungen übereinstimmen. */
const LUECKENLOS = [{ start: '2026-09-07' }, { start: '2026-09-14' }, { start: '2026-09-21' }]

/** Der Montag, den die alte Rechnung liefern würde. */
const BASIS = new Date(2026, 8, 7, 12)

const leiter = (over: Partial<FsInstance> = {}): FsInstance => ({
  id: 'r1',
  ruleId: 'r1',
  grp: '',
  wd: 6, // Samstag
  time: '09:30',
  place: 'Königreichssaal',
  leader: 'T. Lindner',
  lpid: 'p1',
  ...over,
})

describe('Der Montag einer Treffpunkt-Woche kommt aus der Woche selbst', () => {
  it('bei lückenlosem Bestand ändert sich nichts — genau deshalb fiel es nie auf', () => {
    expect(fsWochenKennungen(LUECKENLOS, BASIS)).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
    ])
    // Die alte Rechnung kommt hier auf dasselbe.
    expect(LUECKENLOS.map((_w, wi) => fsWochenStart(BASIS, wi))).toEqual(
      fsWochenKennungen(LUECKENLOS, BASIS),
    )
  })

  it('mit einer Lücke folgt sie den echten Wochen, nicht der Ordnungszahl', () => {
    expect(fsWochenKennungen(MIT_LUECKE, BASIS)).toEqual([
      '2026-09-07',
      '2026-09-21',
      '2026-09-28',
    ])
    // Und das ist der Unterschied, um den es geht: Die alte Rechnung läge ab
    // der zweiten Woche eine ganze Woche daneben.
    expect(fsWochenStart(BASIS, 1)).toBe('2026-09-14')
  })

  it('ohne Kennung bleibt die Rechnung der Rückfall — Vorlagen und Demo haben keine Zeilen', () => {
    expect(fsWochenKennungen([{}, {}], BASIS)).toEqual(['2026-09-07', '2026-09-14'])
  })
})

describe('Datum eines Treffpunkts', () => {
  it('Montag der Woche plus Wochentagsversatz', () => {
    expect(fsTag('2026-09-07', 1)?.getDate()).toBe(7) // Montag
    expect(fsTag('2026-09-07', 6)?.getDate()).toBe(12) // Samstag
    expect(fsTag('2026-09-07', 0)?.getDate()).toBe(13) // Sonntag = Ende der Woche
  })

  it('ohne brauchbare Kennung kein Datum — lieber keines als ein erfundenes', () => {
    expect(fsTag('', 6)).toBeNull()
    expect(fsTag('kein-datum', 6)).toBeNull()
  })
})

describe('Was an der Kennung hängt', () => {
  const KENN = fsWochenKennungen(MIT_LUECKE, BASIS)
  const wochen: FsInstance[][] = [[leiter()], [leiter()], [leiter()]]

  it('der Aufgaben-Schlüssel — für die zweite Woche der 21., nicht der 14.', () => {
    const tasks = deriveMyFsTasks(wochen, KENN, 'T. Lindner', {}, 'p1', 'Treffpunkt-Leiter')
    expect(tasks.map((t) => t.id)).toEqual([
      'fs|2026-09-07|r1',
      'fs|2026-09-21|r1',
      'fs|2026-09-28|r1',
    ])
  })

  it('das angezeigte Datum — Samstag der echten Woche', () => {
    const tasks = deriveMyFsTasks(wochen, KENN, 'T. Lindner', {}, 'p1', 'Treffpunkt-Leiter')
    // Samstag der zweiten geladenen Woche ist der 26. September, nicht der 19.
    expect(tasks[1]?.date).toContain('26. September')
  })

  it('die „…"-Markierung — eine Zusage unter dem echten Schlüssel zählt', () => {
    const conf: ConfirmationMap = { 'fs|2026-09-21|r1': 'bestätigt' }
    // Alle drei Wochen tragen denselben Leiter; bestätigt ist die mittlere.
    // Solange eine offen bleibt, steht er in der Liste — geprüft wird deshalb
    // gegen den umgekehrten Fall: **alle** bestätigt heißt niemand offen.
    const alle: ConfirmationMap = {
      'fs|2026-09-07|r1': 'bestätigt',
      'fs|2026-09-21|r1': 'bestätigt',
      'fs|2026-09-28|r1': 'bestätigt',
    }
    expect(fsPendingIds(wochen, KENN, alle)).toEqual([])
    // Mit der alten Rechnung hätte die mittlere Zusage unter `…09-14…`
    // gestanden und hier nichts bewirkt.
    expect(fsPendingIds(wochen, KENN, conf)).toEqual(['p1'])
  })

  it('die Monatsregel — „1. Samstag" greift in der Woche, in der er wirklich liegt', () => {
    const ersterSamstag: FsRule[] = [
      { id: 'r-1sa', grp: '', wd: 6, time: '09:30', place: 'Saal', monthly: 1, skipCong: false },
    ]
    // Samstag der Woche ab 2026-09-28 ist der 3. Oktober — der erste im Monat.
    expect(genFsWeek('2026-09-28', ersterSamstag)).toHaveLength(1)
    // Samstag der Woche ab 2026-09-21 ist der 26. September — der vierte.
    expect(genFsWeek('2026-09-21', ersterSamstag)).toHaveLength(0)
  })
})

describe('„Plan senden" trifft denselben Schlüssel wie die Edge Function', () => {
  /*
   * Die Function nimmt den Montag aus der Spalte `weeks.start`. Rechnete der
   * Client ihn aus der Ordnungszahl, schriebe sie ihre Tagebuch-Einträge unter
   * einem Schlüssel, den der Client nie sucht — der Knopf zeigte „1 noch nicht
   * gesendet", der Druck meldete „0 gesendet", und die Zahl bliebe stehen.
   * Genau das beschreibt der Kopf von `plan-versand.ts` als den teuren Fehler.
   */
  const woche = (start: string): Week =>
    ({
      range: '',
      book: '',
      start,
      current: false,
      mid: { date: '', end: '', sections: [], helpers: {} },
      we: { date: '', end: '', sections: [], helpers: {} },
    }) as unknown as Week

  it('offene Meldung: der Schlüssel trägt den Montag der Woche', () => {
    // Zweite geladene Woche (wi = 1), die in Wirklichkeit am 21. beginnt.
    const offen = offeneMeldungen(woche('2026-09-21'), [leiter()], 1, BASIS, [], {}, {})
    expect(offen.map((o) => o.key)).toEqual(['fs|2026-09-21|r1'])
  })

  it('Entzug: derselbe Schlüssel, sonst löscht die Function nichts', () => {
    const conf: ConfirmationMap = { 'fs|2026-09-21|r1': 'bestätigt' }
    const raus = entzogeneZusagen(
      woche('2026-09-21'),
      woche('2026-09-21'),
      [leiter()],
      [leiter({ leader: 'M. Albrecht', lpid: 'p2' })],
      1,
      BASIS,
      [],
      '',
      conf,
    )
    expect(raus).toHaveLength(1)
    expect(raus[0]!.key).toBe('fs|2026-09-21|r1')
    // Und der Termin nennt den Samstag dieser Woche.
    expect(raus[0]!.datum).toContain('26. September')
  })
})

describe('Bestätigungen aus der Zeit davor werden umgeschrieben', () => {
  it('ein Schlüssel unter der gerechneten Woche wandert auf die echte', () => {
    const alt: ConfirmationMap = { [fsTaskKey('2026-09-14', 'r1')]: 'bestätigt' }
    const { confirmations, renames } = migrateFsWochenKeys(alt, MIT_LUECKE, BASIS)
    expect(renames).toEqual([['fs|2026-09-14|r1', 'fs|2026-09-21|r1']])
    expect(confirmations).toEqual({ 'fs|2026-09-21|r1': 'bestätigt' })
  })

  it('lückenlos gibt es nichts zu tun — und die Liste bleibt dieselbe', () => {
    const alt: ConfirmationMap = { 'fs|2026-09-14|r1': 'bestätigt' }
    const { confirmations, renames } = migrateFsWochenKeys(alt, LUECKENLOS, BASIS)
    expect(renames).toEqual([])
    expect(confirmations).toBe(alt) // unverändert, nicht einmal kopiert
  })

  it('die Kette rutscht als Ganzes, sie überschreibt sich nicht selbst', () => {
    /*
     * Bei einer Lücke ist der **alte** Schlüssel der einen Woche der **neue**
     * der nächsten. Schrittweise angewandt fräße sich die Umbenennung selbst
     * auf: `…09-14` würde zu `…09-21`, und derselbe Durchgang schöbe ihn
     * gleich weiter nach `…09-28`.
     */
    const alt: ConfirmationMap = {
      'fs|2026-09-14|r1': 'bestätigt',
      'fs|2026-09-21|r1': 'verhindert',
    }
    const { confirmations } = migrateFsWochenKeys(alt, MIT_LUECKE, BASIS)
    expect(confirmations).toEqual({
      'fs|2026-09-21|r1': 'bestätigt', // aus 09-14
      'fs|2026-09-28|r1': 'verhindert', // aus 09-21
    })
  })

  it('ein besetztes Ziel bleibt stehen, wenn es nicht selbst weiterzieht', () => {
    // Zwei Wochen mit Lücke: Nur die zweite verschiebt sich (09-14 → 09-21).
    // Steht dort schon ein Eintrag und zieht **er** nicht weiter, ist er der
    // echte — der Irrläufer daneben darf ihn nicht überschreiben.
    const zweiWochen = [{ start: '2026-09-07' }, { start: '2026-09-21' }]
    const alt: ConfirmationMap = {
      'fs|2026-09-14|r1': 'verhindert', // Irrläufer aus der Zeit davor
      'fs|2026-09-21|r1': 'bestätigt', // unter der echten Kennung entstanden
    }
    const { confirmations, renames } = migrateFsWochenKeys(alt, zweiWochen, BASIS)
    expect(renames).toEqual([])
    expect(confirmations['fs|2026-09-21|r1']).toBe('bestätigt')
  })

  it('Schlüssel anderer Wochen bleiben unberührt', () => {
    const alt: ConfirmationMap = {
      '2026-09-07|mid|part|i1|0': 'bestätigt', // Zusammenkunft, kein Treffpunkt
      'fs|2026-09-07|r1': 'bestätigt', // erste Woche, Kennung stimmt schon
    }
    const { renames } = migrateFsWochenKeys(alt, MIT_LUECKE, BASIS)
    expect(renames).toEqual([])
  })
})
