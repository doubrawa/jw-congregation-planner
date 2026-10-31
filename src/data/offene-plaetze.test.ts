import { describe, expect, it } from 'vitest'
import { buildAbsences } from './absence'
import { emptyQualifications, serviceQualKey } from './helpers'
import { offenePlaetze, planGesendet, platzAuswahl } from './offene-plaetze'
import { montagNach } from './meeting-dates'
import { helferKey, punktKey, ratgeberKey, sentKey } from './planning'
import { angebotsBereich } from '../../supabase/functions/_shared/freie-plaetze.ts'
import type { Absence, Meeting, Person, SentLog, Service, Week } from './types'

/**
 * **Freie Plätze, die man selbst übernehmen kann** (4.10.2026) — wann einer
 * angeboten wird und wann nicht. Zuschnitt des Betreibers: erst nach „Plan
 * senden", direkt eintragen — und seit dem 25.10.2026 **nur Hilfsdienste**:
 * „freie plätze dürfen nur hilfsdienste betreffen. aufgaben weist der planer
 * zu". Bis dahin auch Programmpunkte und der Ratgeber.
 */

const MONTAG = '2026-09-07' // Zusammenkünfte Dienstag 8.9. und Sonntag 13.9.
const ZEITEN = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
/** Montag früh — beide Zusammenkünfte kommen noch. */
const HEUTE = new Date('2026-09-07T09:00:00Z')

const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

const ich = (over: Partial<Person> = {}, ...bereiche: string[]): Person => ({
  id: 'ich', fn: 'Ich', ln: 'Selbst', role: 'dienstamtgehilfe', 
  priv: {
    ...emptyQualifications(),
    ...Object.fromEntries(
      (bereiche.length ? bereiche : ['gebet', 'vortrag', 'bibellesung', 'leser', 'studium', 'ratgeber', 'svc:mik', 'svc:rein']).map((b) => [b, true]),
    ),
  },
  ...over,
})

function dienstag(): Meeting {
  return {
    date: '', end: '',
    sections: [
      { label: 'ERÖFFNUNG', farbe: 'neutral', items: [
        { iid: 'k1', title: 'Lied 1 · Gebet · Einleitende Worte', names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] },
      ] },
      { label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol', items: [
        { iid: 'k2', title: 'Platzhalter-Thema', names: [{ name: '', bereichsKey: 'vortrag', male: true }] },
        { iid: 'k3', title: 'Bibellesung', names: [{ name: '', bereichsKey: 'bibellesung' }] },
      ] },
      { label: 'UNSER LEBEN ALS CHRIST', farbe: 'wein', items: [
        // Ich leite das Studium (`schonHeute`); der Leser daneben ist leer.
        { iid: 'k4', title: 'Versammlungsbibelstudium', names: [
          { name: 'Ich Selbst', pid: 'ich', rolle: 'Leiter', bereichsKey: 'studium' },
          { name: '', rolle: 'Leser', bereichsKey: 'leser' },
        ] },
      ] },
    ],
    helpers: { mik: [{ name: 'Andere Person', pid: 'x' }] },
  } as Meeting
}

function sonntag(): Meeting {
  return {
    date: '', end: '',
    sections: [
      { label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol', items: [
        { iid: 'v1', title: 'Platzhalter-Vortrag', names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }] },
      ] },
    ],
    // Am Sonntag sind die Mikrofone besetzt — dort bleibt nur der Rednerplatz offen.
    helpers: { mik: [{ name: 'Andere Person', pid: 'x' }, { name: 'Noch Jemand', pid: 'y' }] },
  } as Meeting
}

function woche(over: Partial<Week> = {}): Week {
  return { range: '', book: '', start: MONTAG, mid: dienstag(), we: sonntag(), ...over }
}

/** Der Plan der Woche ist gesendet — ein Eintrag zu irgendeinem ihrer Plätze genügt. */
const GESENDET: SentLog = { [sentKey(punktKey(MONTAG, 'mid', 'k4', 0), 'Ich Selbst')]: '2026-09-01T10:00:00Z' }

const angebot = (opts: { weeks?: Week[]; sentLog?: SentLog; me?: Person; absences?: Absence[]; heute?: Date } = {}) => {
  const weeks = opts.weeks ?? [woche()]
  return offenePlaetze(
    weeks,
    DIENSTE,
    opts.sentLog ?? GESENDET,
    opts.me ?? ich(),
    ZEITEN,
    buildAbsences(opts.absences ?? [], weeks, ZEITEN),
    opts.heute ?? HEUTE,
  )
}
const keys = (liste: { key: string }[]) => liste.map((p) => p.key)

describe('offenePlaetze — was angeboten wird', () => {
  it('der leere Hilfsdienst mit meinem Bereich: ein Mikrofon', () => {
    expect(keys(angebot())).toEqual([helferKey(MONTAG, 'mid', 'mik', 1)])
  })

  it('kein Programmpunkt und kein Ratgeber — die teilt der Planer zu (25.10.2026)', () => {
    // Ich habe jeden Bereich dazu, und alle diese Plätze sind leer: Gebet,
    // Vortrag, Bibellesung, der Leser, der Gastredner, der Ratgeber.
    const mid = dienstag()
    mid.auxRatgeber = { name: '', rolle: 'Ratgeber', bereichsKey: 'ratgeber', male: true }
    const angeboten = keys(angebot({ weeks: [woche({ mid })] }))
    for (const key of [
      punktKey(MONTAG, 'mid', 'k1', 0),
      punktKey(MONTAG, 'mid', 'k2', 0),
      punktKey(MONTAG, 'mid', 'k3', 0),
      punktKey(MONTAG, 'mid', 'k4', 1),
      punktKey(MONTAG, 'we', 'v1', 0),
      ratgeberKey(MONTAG, 'mid'),
    ]) {
      expect(angeboten, key).not.toContain(key)
    }
    expect(angeboten).toEqual([helferKey(MONTAG, 'mid', 'mik', 1)])
  })

  it('beschriftet wie eine Aufgabe: Der Dienst trägt allein', () => {
    expect(angebot()[0]).toMatchObject({ title: '', rolle: 'Mikrofone' })
  })

  it('nennt, was ich an dem Tag schon habe — vor dem Übernehmen', () => {
    expect(angebot()[0]?.schonHeute).toEqual([{ text: 'Leiter', lang: 'u' }])
  })

  it.each([
    ['über die Person-Id', { name: 'Ich Selbst', pid: 'ich' }],
    ['über den Namen, wo der Platz keine Id trägt', { name: 'Ich Selbst' }],
  ])('nicht der zweite Platz eines Dienstes, in dem ich schon stehe (%s) — er brächte niemanden dazu', (_wie, eigener) => {
    const mid = dienstag()
    mid.helpers.mik = [eigener]
    expect(angebot({ weeks: [woche({ mid })] })).toEqual([])
  })

  it('nicht die Reinigung — sie übernimmt eine Gruppe, keine Person', () => {
    expect(keys(angebot())).not.toContain(helferKey(MONTAG, 'mid', 'rein', 0))
  })

  it('nicht ohne den Bereich des Dienstes — ein Programmbereich zählt dafür nicht', () => {
    expect(angebot({ me: ich({}, 'gebet', 'vortrag') })).toEqual([])
  })

  it('erst nach „Plan senden" — und ein gesendeter Treffpunkt zählt dafür nicht', () => {
    expect(angebot({ sentLog: {} })).toEqual([])
    expect(angebot({ sentLog: { [`fs|${MONTAG}|i1 Ich Selbst`]: '2026-09-01T10:00:00Z' } })).toEqual([])
  })

  it('nicht für eine ausgefallene, vergangene oder abwesende Zusammenkunft', () => {
    const ausfall = woche({ dev: { mid: { cancelled: true } } })
    expect(angebot({ weeks: [ausfall] })).toEqual([])
    // Mittwoch: Der Dienstag ist vorbei.
    expect(angebot({ heute: new Date('2026-09-09T09:00:00Z') })).toEqual([])
    const weg: Absence = { id: 'a', personId: 'ich', userId: null, from: '2026-09-08', to: '2026-09-08', reason: '' }
    expect(angebot({ absences: [weg] })).toEqual([])
  })

  it('die nächste Zusammenkunft zuerst', () => {
    const zweite = woche({ start: '2026-09-14', mid: dienstag(), we: sonntag() })
    const sentLog = { ...GESENDET, [sentKey(punktKey('2026-09-14', 'mid', 'k4', 0), 'Ich Selbst')]: '2026-09-02T10:00:00Z' }
    const liste = angebot({ weeks: [zweite, woche()], sentLog })
    expect(liste.map((p) => p.at)).toEqual([...liste.map((p) => p.at)].sort((a, b) => (a ?? 0) - (b ?? 0)))
    expect(liste[0]?.key.startsWith(MONTAG)).toBe(true)
  })
})

describe('planGesendet', () => {
  it('offenePlaetze liest das Tagebuch einmal, nicht je Woche (16.10.2026)', () => {
    // Bis dahin lief für jede geladene Woche ein Durchlauf über das ganze
    // Tagebuch — bei 52 Wochen und bis zu 3120 Einträgen 41 bis 112 ms je
    // Ableitung, also bei jeder Zuteilung.
    let durchlaeufe = 0
    const sentLog = new Proxy(
      { ...GESENDET },
      {
        ownKeys(ziel) {
          durchlaeufe++
          return Reflect.ownKeys(ziel)
        },
      },
    )
    const weeks = Array.from({ length: 10 }, (_, i) => woche({ start: montagNach(MONTAG, i) }))
    angebot({ weeks, sentLog })
    expect(durchlaeufe).toBe(1)
  })

  it('liest nur die Zusammenkünfte der Woche', () => {
    expect(planGesendet(GESENDET, MONTAG)).toBe(true)
    expect(planGesendet(GESENDET, '2026-09-14')).toBe(false)
    expect(planGesendet({ [`fs|${MONTAG}|i1 X`]: 'z' }, MONTAG)).toBe(false)
  })
})

describe('platzAuswahl — vom Schlüssel zur Stelle im Programm', () => {
  it('findet Punkt, Klasse, Ratgeber und Hilfsdienst über denselben Durchlauf', () => {
    const mid = dienstag()
    mid.auxRatgeber = { name: '', rolle: 'Ratgeber', bereichsKey: 'ratgeber' }
    const weeks = [woche({ mid })]
    expect(platzAuswahl(weeks, DIENSTE, punktKey(MONTAG, 'mid', 'k4', 1))).toMatchObject({
      kind: 'part', wi: 0, tab: 'mid', si: 2, ii: 0, ni: 1,
    })
    expect(platzAuswahl(weeks, DIENSTE, ratgeberKey(MONTAG, 'mid'))).toMatchObject({ kind: 'ratgeber', wi: 0, tab: 'mid' })
    expect(platzAuswahl(weeks, DIENSTE, helferKey(MONTAG, 'mid', 'mik', 1))).toMatchObject({ kind: 'helper', svc: 'mik', pos: 1 })
  })

  it('null für einen Platz, den es nicht (mehr) gibt', () => {
    expect(platzAuswahl([woche()], DIENSTE, punktKey(MONTAG, 'mid', 'weg', 0))).toBeNull()
    expect(platzAuswahl([woche()], DIENSTE, helferKey(MONTAG, 'mid', 'mik', 5))).toBeNull() // jenseits der Platzzahl
    expect(platzAuswahl([woche()], DIENSTE, punktKey('2027-01-04', 'mid', 'k1', 0))).toBeNull() // Woche nicht geladen
    expect(platzAuswahl([woche()], DIENSTE, `fs|${MONTAG}|i1`)).toBeNull()
  })
})

describe('Eine Regel für App und Server (`angebotsBereich`)', () => {
  it('der Bereich eines Dienstes ist der, den die Personen tragen — die Reinigung hat keinen', () => {
    const [mik, rein] = DIENSTE
    expect(angebotsBereich(mik!)).toBe(serviceQualKey('mik'))
    expect(angebotsBereich(rein!)).toBeNull()
  })
})
