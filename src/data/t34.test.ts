import { describe, expect, it } from 'vitest'
import { fsAutoAssign } from './fs'
import {
  bruderBereicheEinerSchwester,
  doppelteFesteRollen,
  istBruderBereichBeiSchwester,
} from './helpers'
import type { FsInstance, Group, Person, Qualifications } from './types'

/**
 * Die drei freigegebenen Teilpunkte aus T34.
 *
 * - **F4** — Hinweis, wenn ein Bereich, der fachlich Brüdern vorbehalten ist,
 *   bei einer Schwester gesetzt ist. Kein Verbot: die Schalter bleiben frei.
 * - **F7** — Hinweis, wenn zwei Personen dieselbe feste Rolle tragen.
 * - **F8** — Gruppentreffpunkte bevorzugen jemanden aus der Gruppe.
 *
 * F12 ist **nicht** dabei: „Wer Leser ist, darf bei beiden Zusammenkünften
 * lesen" (Betreiber, 7.8.2026) — die fehlende Trennung ist gewollt.
 */

const KEINE: Qualifications = {
  vorsitzMid: false, vorsitzWe: false, vortrag: false, gebet: false,
  bibellesung: false, leser: false, schulung: false, schulungPartner: false,
  studium: false, treffpunkt: false,
}

function person(id: string, patch: Partial<Person> = {}): Person {
  return { id, fn: id, ln: id.toUpperCase(), role: 'verkuendiger', tel: '', mail: '', priv: { ...KEINE }, ...patch }
}

/* ---- F4 ------------------------------------------------------------------ */

describe('F4 — Brüder-Bereiche bei einer Schwester', () => {
  it('meldet Gebet und Vorsitz bei einer Schwester', () => {
    const s = person('s', { female: true, priv: { ...KEINE, gebet: true, vorsitzMid: true } })
    expect(bruderBereicheEinerSchwester(s)).toEqual(['vorsitzMid', 'gebet'])
  })

  it('meldet nichts bei einem Bruder — auch nicht bei denselben Bereichen', () => {
    const b = person('b', { priv: { ...KEINE, gebet: true, vorsitzMid: true } })
    expect(bruderBereicheEinerSchwester(b)).toEqual([])
  })

  it('Schulungsaufgaben sind kein Brüder-Bereich', () => {
    // Schülerteile übernehmen auch Schwestern — ein Hinweis dort wäre falsch
    // und würde die echten Fälle im Rauschen untergehen lassen.
    const s = person('s', { female: true, priv: { ...KEINE, schulung: true, schulungPartner: true } })
    expect(bruderBereicheEinerSchwester(s)).toEqual([])
    expect(istBruderBereichBeiSchwester(s, 'schulung')).toBe(false)
  })

  it('deckt alle Bereiche ab, die befunde.md F4 nennt', () => {
    // Vorsitz, Gebet, Bibellesung, Leser, Studium-Leiter, öffentlicher Vortrag.
    const s = person('s', {
      female: true,
      priv: {
        ...KEINE, vorsitzMid: true, vorsitzWe: true, vortrag: true, gebet: true,
        bibellesung: true, leser: true, studium: true,
      },
    })
    expect(bruderBereicheEinerSchwester(s)).toEqual([
      'vorsitzMid', 'vorsitzWe', 'vortrag', 'gebet', 'bibellesung', 'leser', 'studium',
    ])
  })

  it('erfasst auch die festen Rollen', () => {
    const s = person('s', { female: true, priv: { ...KEINE, wtLeiter: true } })
    expect(bruderBereicheEinerSchwester(s)).toEqual(['wtLeiter'])
  })

  it('ein nicht gesetzter Bereich meldet nichts', () => {
    // Der Hinweis hängt am gesetzten Schalter, nicht am Bereich allein —
    // sonst stünde er in jedem Personen-Detail einer Schwester.
    const s = person('s', { female: true })
    expect(bruderBereicheEinerSchwester(s)).toEqual([])
  })
})

/* ---- F7 ------------------------------------------------------------------ */

describe('F7 — feste Rollen doppelt vergeben', () => {
  it('meldet zwei Wachtturm-Studium-Leiter', () => {
    const p = [
      person('a', { priv: { ...KEINE, wtLeiter: true } }),
      person('b', { priv: { ...KEINE, wtLeiter: true } }),
      person('c'),
    ]
    expect(doppelteFesteRollen(p)).toEqual([{ key: 'wtLeiter', count: 2 }])
  })

  it('einer ist kein Problem, keiner auch nicht', () => {
    expect(doppelteFesteRollen([person('a', { priv: { ...KEINE, wtLeiter: true } })])).toEqual([])
    expect(doppelteFesteRollen([person('a'), person('b')])).toEqual([])
  })

  it('meldet Leiter und Vertreter getrennt', () => {
    const p = [
      person('a', { priv: { ...KEINE, wtLeiter: true, wtVertreter: true } }),
      person('b', { priv: { ...KEINE, wtLeiter: true, wtVertreter: true } }),
    ]
    expect(doppelteFesteRollen(p)).toEqual([
      { key: 'wtLeiter', count: 2 },
      { key: 'wtVertreter', count: 2 },
    ])
  })
})

/* ---- F8 ------------------------------------------------------------------ */

const GRUPPEN: Group[] = [
  { id: 'g1', name: 'Gruppe 1', ov: 'ov1', as: 'as1' },
  { id: 'g2', name: 'Gruppe 2', ov: 'ov2', as: null },
]

/** Treffpunkt-qualifizierte Person in Gruppe `grp`. */
const leiter = (id: string, grp: string | null) =>
  person(id, { grp, priv: { ...KEINE, treffpunkt: true } })

function tp(patch: Partial<FsInstance>): FsInstance {
  return { id: 'i', ruleId: null, grp: '', wd: 6, time: '09:30', place: 'KH', leader: '', ...patch }
}

describe('F8 — Gruppentreffpunkte bevorzugen die eigene Gruppe', () => {
  const pool = [leiter('a', 'g1'), leiter('b', 'g2'), leiter('c', 'g2'), leiter('d', null)]

  it('besetzt den Gruppentreffpunkt aus der Gruppe — auch gegen den Lastvergleich', () => {
    // Der Kern des Punktes. Eine Probe mit leeren Strichlisten sagt nichts:
    // sie besteht auch ohne Bevorzugung, wenn der Hash zufällig passt. Hier
    // hat „a“ in der Vorwoche geleitet und alle anderen nicht — ohne
    // Bevorzugung gewänne einer von ihnen, denn hinter dem Lastvergleich hat
    // außerhalb der Gruppe fast immer jemand weniger.
    const vorwoche = [tp({ id: 'v', grp: 'g1', leader: 'a', lpid: 'a' })]
    const { fsWeeks } = fsAutoAssign(
      [vorwoche, [tp({ id: 'x', grp: 'g1' })]], 1, pool, null, [], undefined, GRUPPEN,
    )
    expect(fsWeeks[1][0].lpid).toBe('a')
  })

  it('jeder Gruppentreffpunkt bekommt seine eigene Gruppe', () => {
    const woche = [tp({ id: 'x1', grp: 'g1', time: '09:00' }), tp({ id: 'x2', grp: 'g2', time: '09:30' })]
    const { fsWeeks } = fsAutoAssign([woche], 0, pool, null, [], undefined, GRUPPEN)
    expect(fsWeeks[0][0].lpid).toBe('a')
    expect(['b', 'c']).toContain(fsWeeks[0][1].lpid)
  })

  it('lässt keinen Platz offen, wenn die Gruppe nicht kann', () => {
    // Eine Gruppe ohne treffpunkt-qualifiziertes Mitglied darf den Treffpunkt
    // nicht unbesetzt lassen — die Bevorzugung ist eine Reihenfolge, keine
    // Bedingung.
    const { fsWeeks } = fsAutoAssign([[tp({ id: 'x', grp: 'g3' })]], 0, pool, null, [], undefined, GRUPPEN)
    expect(fsWeeks[0][0].leader).not.toBe('')
  })

  it('wechselt innerhalb der Gruppe weiter durch', () => {
    // Die Fairness darf die Bevorzugung nicht aushöhlen — und umgekehrt. Über
    // sechs Wochen muss der Gruppentreffpunkt zwischen b und c wechseln,
    // nicht bei einem hängenbleiben.
    let fsWeeks: FsInstance[][] = Array.from({ length: 6 }, () => [tp({ id: 'x', grp: 'g2' })])
    for (let wi = 0; wi < 6; wi++) {
      fsWeeks = fsAutoAssign(fsWeeks, wi, pool, null, [], undefined, GRUPPEN).fsWeeks
    }
    const folge = fsWeeks.map((w) => w[0].lpid)
    expect(new Set(folge)).toEqual(new Set(['b', 'c']))
    expect(folge.filter((x) => x === 'b')).toHaveLength(3)
  })

  it('Treffpunkte ohne Gruppe bleiben unberührt', () => {
    // Regressionsprobe: ohne `grp` ist jeder Rang 0, die Reihenfolge muss
    // exakt die sein, die ohne Gruppen herauskäme.
    const ohne = [[tp({ id: 'x', grp: '' })]]
    const mitGruppen = fsAutoAssign(ohne, 0, pool, null, [], undefined, GRUPPEN).fsWeeks
    const ohneGruppen = fsAutoAssign(ohne, 0, pool).fsWeeks
    expect(mitGruppen[0][0].lpid).toBe(ohneGruppen[0][0].lpid)
  })

  it('Aufseher gewinnt nur bei sonst völligem Gleichstand', () => {
    // ov2 und c sind beide in g2 und beide unbelastet — dann entscheidet die
    // Aufseher-Rolle statt des Hashes. Stünde sie weiter vorn, leitete der
    // Aufseher jede Woche.
    const g2 = [leiter('ov2', 'g2'), leiter('c', 'g2')]
    const { fsWeeks } = fsAutoAssign([[tp({ id: 'x', grp: 'g2' })]], 0, g2, null, [], undefined, GRUPPEN)
    expect(fsWeeks[0][0].lpid).toBe('ov2')
  })

  it('ohne Gruppenliste bleibt die Bevorzugung nach Mitgliedschaft bestehen', () => {
    // Die Gruppen sind ein optionales Argument (Altaufrufe, Tests). Fehlt es,
    // entfällt nur die Aufseher-Feinheit, nicht die Gruppenbindung — deshalb
    // wieder mit belastetem „a“ geprüft, sonst sagte es nichts.
    const vorwoche = [tp({ id: 'v', grp: 'g1', leader: 'a', lpid: 'a' })]
    const { fsWeeks } = fsAutoAssign([vorwoche, [tp({ id: 'x', grp: 'g1' })]], 1, pool)
    expect(fsWeeks[1][0].lpid).toBe('a')
  })
})
