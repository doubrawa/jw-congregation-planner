/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { gleich, nurZuteilungen } from '../../supabase/functions/_shared/zuteilen-grenze.ts'
import { isSong, istArt } from '../data/helpers'
import type { SectionKind } from '../data/constants'
import type { MeetingKey, PartItem, SlotAssignment, Week } from '../data/types'
import type { AppAction, AppState } from './context'
import { reducer } from './reducer'

/**
 * **Die Grenze der Rechte-Stufe „Planer" — an den echten Aktionen gemessen.**
 *
 * `nurZuteilungen` (Edge Function `zuteilen`) entscheidet, ob ein Planer eine
 * Woche schreiben darf. Geprüft wird es hier nicht an nachgebauten Wochen,
 * sondern an dem, was der Reducer aus den Testdaten macht: **Jede Aktion, die
 * ein Planer auslösen kann, muss durchgehen** — sonst weist der Server ihn beim
 * Zuteilen ab, und die App lädt nach, ohne dass er weiß, warum. **Jede Aktion,
 * die dem Admin vorbehalten ist, muss abgewiesen werden** — sonst wäre die
 * Grenze ein ausgeblendeter Knopf.
 *
 * Die Wochen gehen vorher einmal durch JSON, wie über die Leitung: `undefined`
 * fällt weg, und genau so kommt die Woche bei der Function an.
 */

const leitung = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

const ablauf = (s: AppState, aktionen: AppAction[]): AppState => aktionen.reduce(reducer, s)

/** Jede Woche, die eine Aktion geändert hat — vorher und nachher, wie sie die Function sieht. */
function geaendert(vorher: AppState, nachher: AppState): Array<[Week, Week]> {
  const paare: Array<[Week, Week]> = []
  nachher.weeks.forEach((w, i) => {
    const alt = vorher.weeks[i]
    if (alt && w !== alt) paare.push([leitung(alt), leitung(w)])
  })
  return paare
}

interface Stelle {
  si: number
  ii: number
  item: PartItem
}

/** Der erste Programmpunkt einer Zusammenkunft, auf den `passt` zutrifft. */
function punkt(w: Week, tab: MeetingKey, passt: (item: PartItem, art: SectionKind | undefined) => boolean): Stelle {
  const sections = w[tab].sections
  for (let si = 0; si < sections.length; si++) {
    const section = sections[si]!
    for (let ii = 0; ii < section.items.length; ii++) {
      const item = section.items[ii]!
      if (isSong(item)) continue
      const art = (['eroeffnung', 'abschluss', 'lac', 'vortrag'] as const).find((a) => istArt(section, a))
      if (passt(item, art)) return { si, ii, item }
    }
  }
  throw new Error(`kein passender Punkt in ${tab}`)
}

const hat = (item: PartItem, test: (s: SlotAssignment) => boolean): boolean => item.names.some(test)

/** Ausgangsstand: die Testdaten mit eingeschalteter Zusätzlicher Klasse (Ratgeber, zweite Reihe). */
function basis(): AppState {
  return ablauf(demoZustand(), [{ type: 'setAuxClass', on: true }])
}

function teil(s: AppState, tab: MeetingKey, stelle: Stelle, ni: number, extra: { aux?: boolean; guest?: boolean } = {}): AppAction {
  return {
    type: 'openSlot',
    sel: { kind: 'part', wi: s.week, tab, si: stelle.si, ii: stelle.ii, ni, priv: null, groups: false, label: 'x', ...extra },
  }
}

/** Eine Planer-Handlung: ein Name und die Aktionen, ausgehend vom Stand davor. */
interface Schritt {
  name: string
  aktionen: (s: AppState) => AppAction[]
}

const PERSON = (s: AppState) => s.persons.find((p) => !p.female)!

const PLANER_SCHRITTE: Schritt[] = [
  {
    name: 'Programmpunkt zuteilen',
    aktionen: (s) => {
      const stelle = punkt(s.weeks[s.week]!, 'mid', (it) => hat(it, (n) => n.bereichsKey === 'gebet'))
      return [teil(s, 'mid', stelle, 0), { type: 'assign', name: `${PERSON(s).fn} ${PERSON(s).ln}`, pid: PERSON(s).id }]
    },
  },
  {
    name: 'Zuteilung entfernen',
    aktionen: (s) => {
      const stelle = punkt(s.weeks[s.week]!, 'mid', (it) => hat(it, (n) => Boolean(n.name) && !n.rolle?.includes('Gastredner')))
      return [teil(s, 'mid', stelle, 0), { type: 'assign', name: '' }]
    },
  },
  {
    name: 'Gastredner mit Heimatversammlung eintragen',
    aktionen: (s) => {
      const stelle = punkt(s.weeks[s.week]!, 'we', (it) => hat(it, (n) => n.bereichsKey === 'vortrag'))
      return [teil(s, 'we', stelle, 0, { guest: true }), { type: 'assign', name: 'Gast Redner', rolle: 'Gastredner', herkunft: 'Vers. Beispieldorf' }]
    },
  },
  {
    name: 'eigenen Redner zuteilen (Rolle wechselt auf „Redner")',
    aktionen: (s) => {
      const stelle = punkt(s.weeks[s.week]!, 'we', (it) => hat(it, (n) => n.bereichsKey === 'vortrag'))
      return [teil(s, 'we', stelle, 0, { guest: true }), { type: 'assign', name: `${PERSON(s).fn} ${PERSON(s).ln}`, rolle: 'Redner', pid: PERSON(s).id }]
    },
  },
  {
    name: 'Redner entfernen (fällt auf Gastredner zurück)',
    aktionen: (s) => {
      const stelle = punkt(s.weeks[s.week]!, 'we', (it) => hat(it, (n) => n.bereichsKey === 'vortrag'))
      return [teil(s, 'we', stelle, 0, { guest: true }), { type: 'assign', name: '', rolle: 'Gastredner' }]
    },
  },
  {
    name: 'Hilfsdienst zuteilen — auch hinter der gespeicherten Platzreihe',
    aktionen: (s) => {
      const svc = s.services[0]!
      return [
        { type: 'openSlot', sel: { kind: 'helper', wi: s.week, tab: 'mid', svc: svc.key, pos: svc.count - 1, priv: null, groups: false, label: 'x' } },
        { type: 'assign', name: `${PERSON(s).fn} ${PERSON(s).ln}`, pid: PERSON(s).id },
      ]
    },
  },
  {
    name: 'Ratgeber der Zusätzlichen Klasse',
    aktionen: (s) => [
      { type: 'openSlot', sel: { kind: 'ratgeber', wi: s.week, tab: 'mid', priv: null, groups: false, label: 'x' } },
      { type: 'assign', name: `${PERSON(s).fn} ${PERSON(s).ln}`, pid: PERSON(s).id },
    ],
  },
  {
    name: 'Platz in der Zusätzlichen Klasse',
    aktionen: (s) => {
      const stelle = punkt(s.weeks[s.week]!, 'mid', (it) => (it.aux?.length ?? 0) > 0)
      return [teil(s, 'mid', stelle, 0, { aux: true }), { type: 'assign', name: `${PERSON(s).fn} ${PERSON(s).ln}`, pid: PERSON(s).id }]
    },
  },
  { name: 'Automatisch zuteilen (unter der Woche)', aktionen: () => [{ type: 'setTab', tab: 'mid' }, { type: 'autoAssign', scope: 'all' }] },
  { name: 'Automatisch zuteilen (Wochenende)', aktionen: () => [{ type: 'setTab', tab: 'we' }, { type: 'autoAssign', scope: 'all' }] },
  { name: 'Programm leeren', aktionen: () => [{ type: 'setTab', tab: 'mid' }, { type: 'clearAssignments', scope: 'parts' }] },
  { name: 'Hilfsdienste leeren', aktionen: () => [{ type: 'setTab', tab: 'mid' }, { type: 'clearAssignments', scope: 'helpers' }] },
  {
    name: 'Vortragsthema (Grenzfall)',
    aktionen: (s) => {
      const stelle = punkt(s.weeks[s.week]!, 'we', (it) => hat(it, (n) => n.bereichsKey === 'vortrag'))
      return [{ type: 'talkEdit', si: stelle.si, ii: stelle.ii, title: 'Wie man Frieden findet' }]
    },
  },
  { name: 'Anfangslied (Grenzfall)', aktionen: () => [{ type: 'openingSong', song: '12' }] },
  { name: 'Schlusslied (Grenzfall)', aktionen: () => [{ type: 'closingSong', song: '34' }] },
  { name: 'Anfangslied wieder entfernen', aktionen: () => [{ type: 'openingSong', song: '12' }, { type: 'openingSong', song: '' }] },
  {
    name: 'Partner an einem Schülerteil ab- und wieder anschalten (Grenzfall)',
    aktionen: (s) => {
      const stelle = punkt(s.weeks[s.week]!, 'mid', (it) => hat(it, (n) => n.bereichsKey === 'schulungPartner'))
      return [{ type: 'setTab', tab: 'mid' }, { type: 'togglePartner', si: stelle.si, ii: stelle.ii }]
    },
  },
]

describe('Planer-Grenze: was ein Planer an einer Woche auslösen kann, geht durch', () => {
  it.each(PLANER_SCHRITTE)('$name', ({ aktionen }) => {
    const vorher = basis()
    const nachher = ablauf(vorher, aktionen(vorher))
    const paare = geaendert(vorher, nachher)
    // Sonst prüfte der Fall nichts: Die Handlung muss eine Woche ändern.
    expect(paare.length).toBeGreaterThan(0)
    for (const [alt, neu] of paare) expect(nurZuteilungen(alt, neu)).toBe(true)
  })

  it('der Partner geht auch wieder an — mit der Zusätzlichen Klasse', () => {
    const s0 = basis()
    const stelle = punkt(s0.weeks[0]!, 'mid', (it) => hat(it, (n) => n.bereichsKey === 'schulungPartner'))
    const aus = ablauf(s0, [{ type: 'togglePartner', si: stelle.si, ii: stelle.ii }])
    const an = ablauf(aus, [{ type: 'togglePartner', si: stelle.si, ii: stelle.ii }])
    const paare = geaendert(aus, an)
    expect(paare.length).toBe(1)
    for (const [alt, neu] of paare) expect(nurZuteilungen(alt, neu)).toBe(true)
  })

  describe('Kreisaufseher-Woche', () => {
    /** Die Dienstwoche richtet der Admin ein; danach plant der Planer darin. */
    const dienstwoche = (): AppState => ablauf(basis(), [{ type: 'setAnlass', art: 'co' }])
    const coPunkt = (w: Week, tab: MeetingKey): Stelle => punkt(w, tab, (it) => hat(it, (n) => n.rolle === 'Kreisaufseher'))

    it('Thema des Dienstvortrags und des Schlussvortrags (Grenzfall)', () => {
      const s = dienstwoche()
      const w = s.weeks[0]!
      for (const tab of ['mid', 'we'] as const) {
        const stelle = coPunkt(w, tab)
        const nachher = ablauf(s, [{ type: 'setPartThema', tab, si: stelle.si, ii: stelle.ii, begriff: stelle.item.title.split(' · ')[0]!, thema: 'Bleibt wach' }])
        const paare = geaendert(s, nachher)
        expect(paare.length).toBe(1)
        for (const [alt, neu] of paare) expect(nurZuteilungen(alt, neu)).toBe(true)
      }
    })

    it('einen Bruder der Versammlung auf den Platz des Kreisaufsehers setzen — und danach das Thema', () => {
      const s = dienstwoche()
      const stelle = coPunkt(s.weeks[0]!, 'mid')
      const zugeteilt = ablauf(s, [
        teil(s, 'mid', stelle, 0, { guest: true }),
        { type: 'assign', name: `${PERSON(s).fn} ${PERSON(s).ln}`, rolle: 'Redner', pid: PERSON(s).id },
      ])
      const thema = ablauf(zugeteilt, [{ type: 'setPartThema', tab: 'mid', si: stelle.si, ii: stelle.ii, begriff: 'Dienstvortrag', thema: 'Neu' }])
      for (const [alt, neu] of [...geaendert(s, zugeteilt), ...geaendert(zugeteilt, thema)]) {
        expect(nurZuteilungen(alt, neu)).toBe(true)
      }
    })
  })
})

/** Eine Handlung des Admins: muss an der Grenze scheitern. */
const ADMIN_SCHRITTE: Schritt[] = [
  {
    name: 'eigenen Punkt anlegen',
    aktionen: (s) => [{ type: 'lacAdd', si: punkt(s.weeks[0]!, 'mid', (_it, art) => art === 'lac').si, title: 'Örtliche Bedürfnisse' }],
  },
  {
    name: 'Punkt löschen',
    aktionen: (s) => {
      const stelle = punkt(s.weeks[0]!, 'mid', (_it, art) => art === 'lac')
      return [{ type: 'lacRemove', si: stelle.si, ii: stelle.ii }]
    },
  },
  {
    name: 'Punkt verschieben',
    aktionen: (s) => {
      const stelle = punkt(s.weeks[0]!, 'mid', (_it, art) => art === 'lac')
      return [{ type: 'lacMove', si: stelle.si, ii: stelle.ii, dir: 1 }]
    },
  },
  {
    name: 'Minuten ändern',
    aktionen: (s) => {
      const stelle = punkt(s.weeks[0]!, 'mid', (it, art) => art === 'lac' && (it.mins ?? 0) > 0)
      return [{ type: 'lacMinuten', si: stelle.si, ii: stelle.ii, mins: (stelle.item.mins ?? 10) + 5 }]
    },
  },
  { name: 'Zusammenkunft verlegen', aktionen: () => [{ type: 'setAbweichung', tab: 'mid', patch: { wd: 3 } }] },
  { name: 'Zusammenkunft absagen', aktionen: () => [{ type: 'setAbweichung', tab: 'we', patch: { cancelled: true, reason: 'Kongress' } }] },
  { name: 'Kreisaufseher-Woche einrichten', aktionen: () => [{ type: 'setAnlass', art: 'co' }] },
  { name: 'Gedächtnismahl-Woche', aktionen: () => [{ type: 'setAnlass', art: 'mem' }] },
  { name: 'Weiteren Termin anlegen', aktionen: () => [{ type: 'terminAdd' }] },
  { name: 'Zusätzliche Klasse ausschalten', aktionen: () => [{ type: 'setAuxClass', on: false }] },
]

describe('Planer-Grenze: was dem Admin vorbehalten ist, scheitert', () => {
  it.each(ADMIN_SCHRITTE)('$name', ({ aktionen }) => {
    const vorher = basis()
    const nachher = ablauf(vorher, aktionen(vorher))
    const paare = geaendert(vorher, nachher)
    expect(paare.length).toBeGreaterThan(0)
    // Jede geänderte Woche ist ein Umbau — keine geht als Zuteilung durch.
    for (const [alt, neu] of paare) expect(nurZuteilungen(alt, neu)).toBe(false)
  })
})

describe('Planer-Grenze: von Hand verändert', () => {
  /** Die erste Woche der Testdaten, frisch über die Leitung. */
  const woche = (): Week => leitung(basis().weeks[0]!)
  const verbogen = (aendern: (w: Week) => void): boolean => {
    const alt = woche()
    const neu = woche()
    aendern(neu)
    return nurZuteilungen(alt, neu)
  }
  const ersterPunkt = (w: Week): PartItem => punkt(w, 'mid', (it) => hat(it, (n) => n.bereichsKey === 'bibellesung')).item

  it('unverändert geht durch — auch mit anderer Reihenfolge der Schlüssel', () => {
    /** Dieselben Werte, jedes Objekt mit umgekehrter Schlüsselfolge. */
    const umgedreht = (x: unknown): unknown =>
      Array.isArray(x)
        ? x.map(umgedreht)
        : x && typeof x === 'object'
          ? Object.fromEntries(Object.entries(x).reverse().map(([k, v]) => [k, umgedreht(v)]))
          : x
    const alt = woche()
    expect(nurZuteilungen(alt, alt)).toBe(true)
    expect(nurZuteilungen(alt, umgedreht(alt))).toBe(true)
    expect(gleich({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(gleich([1, 2], [2, 1])).toBe(false)
  })

  it('den Titel eines gewöhnlichen Punkts ändern', () => {
    expect(verbogen((w) => (ersterPunkt(w).title = 'Anderer Titel'))).toBe(false)
  })

  it('die Dauer eines Punkts ändern', () => {
    expect(verbogen((w) => (ersterPunkt(w).mins = 99))).toBe(false)
  })

  it('einen Platz entfernen, der kein Partner ist', () => {
    expect(verbogen((w) => ersterPunkt(w).names.pop())).toBe(false)
  })

  it('den Bereich eines Platzes ändern', () => {
    expect(verbogen((w) => (ersterPunkt(w).names[0]!.bereichsKey = 'gebet'))).toBe(false)
  })

  it('einen Platz zum Brüder-Platz machen', () => {
    expect(verbogen((w) => (ersterPunkt(w).names[0]!.male = true))).toBe(false)
  })

  it('die Woche umbenennen oder einen Anlass setzen', () => {
    expect(verbogen((w) => (w.range = '1.–7. Januar'))).toBe(false)
    expect(verbogen((w) => (w.anlass = { art: 'kongress', von: '2026-09-12', bis: '2026-09-13' }))).toBe(false)
    expect(verbogen((w) => (w.dev = { mid: { cancelled: true } }))).toBe(false)
  })

  it('einen Abschnitt anhängen', () => {
    expect(verbogen((w) => w.mid.sections.push({ label: 'NEU', farbe: 'neutral', items: [] }))).toBe(false)
  })

  it('einen gewöhnlichen Titel in einer Sprachvariante ändern', () => {
    const alt = woche()
    alt.alt = { E: { range: 'x', book: 'y', mid: leitung(alt.mid), we: leitung(alt.we) } }
    const neu = leitung(alt)
    const stelle = punkt(neu, 'mid', (it) => hat(it, (n) => n.bereichsKey === 'bibellesung'))
    const variante = neu.alt!.E!.mid.sections[stelle.si]!.items[stelle.ii] as PartItem
    variante.title = 'Bible Reading — anders'
    expect(nurZuteilungen(alt, neu)).toBe(false)
  })

  it('aber das Vortragsthema auch in der Sprachvariante', () => {
    const alt = woche()
    alt.alt = { E: { range: 'x', book: 'y', mid: leitung(alt.mid), we: leitung(alt.we) } }
    const neu = leitung(alt)
    const stelle = punkt(neu, 'we', (it) => hat(it, (n) => n.bereichsKey === 'vortrag'))
    ;(neu.we.sections[stelle.si]!.items[stelle.ii] as PartItem).title = 'Ein neues Thema'
    ;(neu.alt!.E!.we.sections[stelle.si]!.items[stelle.ii] as PartItem).title = 'Ein neues Thema'
    expect(nurZuteilungen(alt, neu)).toBe(true)
  })

  it('aber Namen, Person-Ids und Heimatversammlung überall', () => {
    expect(
      verbogen((w) => {
        for (const tab of ['mid', 'we'] as const) {
          for (const section of w[tab].sections) {
            for (const item of section.items) {
              if (isSong(item)) continue
              for (const n of item.names) {
                n.name = 'Jemand Anderes'
                n.pid = 'p-anders'
                n.herkunft = 'Vers. Anderswo'
              }
            }
          }
          w[tab].helpers = { neu: [{ name: 'Wer', pid: 'p1' }] }
        }
      }),
    ).toBe(true)
  })
})
