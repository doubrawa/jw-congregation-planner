import { describe, expect, it } from 'vitest'
import { appZahlenLaden, offeneZusagen } from '../_shared/app-zahl.ts'
import { fsKey, helferKey, punktKey } from '../_shared/aufgaben-schluessel.ts'
import type { Rest } from '../_shared/rest.ts'
import type { FsInstance, ServiceRow, Week } from '../_shared/zuteilungen.ts'
import { erfuelltVergleiche, likeMuster, nurSpalten, passtAufMuster } from './attrappe.ts'

/**
 * **Die Zahl am App-Symbol, wie der Server sie zählt** (T184): die offenen
 * Zusagen eines Kontos über alle künftigen Wochen — für den Push, der sie auch
 * bei geschlossener App aufs Symbol bringt. Dass sie der Zahl der App gleicht,
 * hält `src/data/app-zahl-parity.test.ts`.
 *
 * Die Uhr: Mittwoch, 18. November 2026. Der Dienstag dieser Woche ist vorbei.
 */

const HEUTE = Date.UTC(2026, 10, 18)
const ZEITEN = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
const DIENSTE: ServiceRow[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]
const ANTON = { name: 'Anton Probe', pid: 'p-a' }
const BERTA = { name: 'Berta Probe', pid: 'p-b' }

/** Eine Woche: am Dienstag Anton und Berta am Mikrofon, am Sonntag Anton als Leser und — nur mit Namen — am Mikrofon. */
function woche(): Week {
  return {
    mid: { helpers: { mik: [ANTON, BERTA], rein: [{ name: 'Gruppe 1' }] } },
    we: {
      sections: [
        {
          label: 'WACHTTURM-STUDIUM',
          items: [{ iid: 'i-wt', title: 'Studium', names: [{ ...ANTON, rolle: 'Leser' }, { name: 'Gast', rolle: 'Gastredner' }] }],
        },
      ],
      helpers: { mik: [{ name: 'Anton Probe' }] },
    },
  }
}
const DIESE = '2026-11-16'
const NAECHSTE = '2026-11-23'
const treffpunkt: FsInstance = { id: 'f1', wd: 6, time: '09:30', place: 'Saal', leader: 'Anton Probe', lpid: 'p-a' }

const zaehle = (wochen: { start: string; data: Week }[], conf: string[] = [], fs: FsInstance[] = []) =>
  offeneZusagen(wochen, [{ start: NAECHSTE, data: fs }], DIENSTE, new Map(conf.map((k) => [k, ''])), ZEITEN, HEUTE)

describe('Die offenen Zusagen je Person', () => {
  it('zählt jeden künftigen Platz ohne Antwort — über die Id, ohne Id über den Namen', () => {
    const zahl = zaehle([{ start: NAECHSTE, data: woche() }])
    // Dienstag Mikrofon, Sonntag Leser, Sonntag Mikrofon (nur Name).
    expect(zahl('p-a', 'Anton Probe')).toBe(3)
    expect(zahl('p-b', 'Berta Probe')).toBe(1)
  })

  it('Zusage und Absage zählen nicht — beide sind eine Antwort', () => {
    const zahl = zaehle(
      [{ start: NAECHSTE, data: woche() }],
      [helferKey(NAECHSTE, 'mid', 'mik', 0), punktKey(NAECHSTE, 'we', 'i-wt', 0)],
    )
    expect(zahl('p-a', 'Anton Probe')).toBe(1)
  })

  it('Vergangenes zählt nicht — der Dienstag dieser Woche ist vorbei, ihr Sonntag nicht', () => {
    expect(zaehle([{ start: DIESE, data: woche() }])('p-a', 'Anton Probe')).toBe(2)
  })

  it('eine ausgefallene Zusammenkunft trägt keine Aufgaben', () => {
    const ohneSonntag = { ...woche(), dev: { we: { cancelled: true } } }
    expect(zaehle([{ start: NAECHSTE, data: ohneSonntag }])('p-a', 'Anton Probe')).toBe(1)
  })

  it('Treffpunkte zählen mit', () => {
    const programm = [{ start: NAECHSTE, data: {} }]
    expect(zaehle(programm, [], [treffpunkt])('p-a', 'Anton Probe')).toBe(1)
    expect(zaehle(programm, [fsKey(NAECHSTE, 'f1')], [treffpunkt])('p-a', 'Anton Probe')).toBe(0)
  })

  it('…aber nur neben einer Programmwoche — wie in der App, die sie parallel zu den Wochen führt', () => {
    expect(zaehle([], [], [treffpunkt])('p-a', 'Anton Probe')).toBe(0)
  })

  it('Gegenprobe: ein Gleichnamiger mit anderer Id bekommt die Plätze mit Id nicht', () => {
    expect(zaehle([{ start: NAECHSTE, data: woche() }])('p-anderer', 'Anton Probe')).toBe(1)
  })
})

/** Eine REST-Attrappe, die Filter und Spalten auswertet wie PostgREST — und mitschreibt, was gefragt wurde. */
function attrappe(tabellen: Record<string, Record<string, unknown>[]>, kaputt?: string): Rest & { pfade: string[] } {
  const pfade: string[] = []
  const inListe = (path: string, spalte: string): string[] | null => {
    const m = new RegExp(`[?&]${spalte}=in\\.\\(([^)]*)\\)`).exec(path)
    return m ? m[1]!.split(',').map(decodeURIComponent) : null
  }
  return {
    pfade,
    get: async <T,>(path: string): Promise<T> => {
      pfade.push(path)
      const tabelle = path.split('?')[0]!
      if (tabelle === kaputt) throw new Error('500 aus der Attrappe')
      const zeilen = (tabellen[tabelle] ?? []).filter((z) => {
        if (!erfuelltVergleiche(z, path, ['congregation_id', 'start', 'id'])) return false
        for (const spalte of ['user_id', 'id']) {
          const liste = inListe(path, spalte)
          if (liste && !liste.includes(String(z[spalte]))) return false
        }
        const muster = likeMuster(path, 'task_key')
        return muster.length === 0 || muster.some((m) => passtAufMuster(String(z.task_key), m))
      })
      return nurSpalten(zeilen, path) as T
    },
    insert: async () => {},
    send: async () => {},
  } as unknown as Rest & { pfade: string[] }
}

const C = 'c1'
const BESTAND = () => ({
  members: [
    { congregation_id: C, user_id: 'u-a', person_id: 'p-a' },
    { congregation_id: C, user_id: 'u-b', person_id: 'p-b' },
    { congregation_id: C, user_id: 'u-ohne', person_id: null },
  ],
  persons: [
    { congregation_id: C, id: 'p-a', fn: 'Anton', ln: 'Probe' },
    { congregation_id: C, id: 'p-b', fn: 'Berta', ln: 'Probe' },
  ],
  weeks: [
    { congregation_id: C, start: '2026-11-09', data: woche() },
    { congregation_id: C, start: NAECHSTE, data: woche() },
  ],
  fs_weeks: [{ congregation_id: C, start: NAECHSTE, data: [treffpunkt] }],
  services: DIENSTE.map((s) => ({ congregation_id: C, ...s })),
  congregations: [{ id: C, mid_wd: 2, mid_time: '19:00', we_wd: 0, we_time: '10:00', zeiten_ab: [] }],
  confirmations: [{ congregation_id: C, task_key: helferKey(NAECHSTE, 'mid', 'mik', 1), status: 'bestätigt' }],
})

describe('Die Zahl je Konto aus der Datenbank', () => {
  it('je Konto die Zahl seiner Person; ein Konto ohne Person hat 0', async () => {
    const zahlen = await appZahlenLaden(attrappe(BESTAND()), C, ['u-a', 'u-b', 'u-ohne'], HEUTE)
    // Anton: Dienstag Mikrofon, Sonntag Leser und Mikrofon, Samstag Treffpunkt.
    expect(Object.fromEntries(zahlen)).toEqual({ 'u-a': 4, 'u-b': 0, 'u-ohne': 0 })
  })

  it('liest die Wochen erst ab dem Montag dieser Woche — Vergangenes zählt ohnehin nicht', async () => {
    const rest = attrappe(BESTAND())
    await appZahlenLaden(rest, C, ['u-a'], HEUTE)
    expect(rest.pfade.find((p) => p.startsWith('weeks?'))).toContain('start=gte.2026-11-16')
  })

  it('die Zusagen je Woche für sich — nie die ganze Tabelle (Zeilengrenze von PostgREST)', async () => {
    const rest = attrappe(BESTAND())
    await appZahlenLaden(rest, C, ['u-a'], HEUTE)
    const zusagen = rest.pfade.filter((p) => p.startsWith('confirmations?'))
    expect(zusagen.length).toBeGreaterThan(0)
    expect(zusagen.every((p) => p.includes('task_key=like.'))).toBe(true)
  })

  it('wirft nie: Scheitert das Lesen, gibt es keine Zahl — der Push geht ohne sie hinaus', async () => {
    await expect(appZahlenLaden(attrappe(BESTAND(), 'weeks'), C, ['u-a'], HEUTE)).resolves.toEqual(new Map())
  })

  it('ohne Empfänger keine Abfrage', async () => {
    const rest = attrappe(BESTAND())
    expect(await appZahlenLaden(rest, C, [], HEUTE)).toEqual(new Map())
    expect(rest.pfade).toEqual([])
  })
})
