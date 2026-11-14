import { describe, expect, it } from 'vitest'
import { nichtMehrPassend, plaetzeFreigeben, type PlatzStand } from './freiwerden'
import { fsTaskKey } from './fs'
import { emptyQualifications, ROLE_GUEST_SPEAKER, ROLE_OWN_SPEAKER } from './helpers'
import type { FsInstance, Meeting, Person, Qualifications, Service, Week } from './types'
import { helferKey, punktKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'

/**
 * **Wer etwas nicht mehr macht, dessen künftige Plätze werden frei** (T182).
 *
 * Betreiber, 13.11.2026: „was passiert, wenn eine person einen bestimmten
 * dienst oder aufgabe nicht mehr macht, wie z.b. mikrodienst. dann sollten die
 * nun ‚falsch' besetzten plätze frei werden und müssen neu verplant werden."
 *
 * Die Uhr steht auf Mittwoch, 18. November 2026: Die Zusammenkunft vom
 * Dienstag ist vorbei, die vom Sonntag und alles danach nicht.
 */

const HEUTE = new Date(2026, 10, 18, 9, 0)
const ZEITEN = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
const VORBEI = '2026-11-09' // Woche ganz vorbei
const DIESE = '2026-11-16' // Dienstag vorbei, Sonntag kommt
const NAECHSTE = '2026-11-23'

const MIKRO: Service = { key: 'mikro', name: 'Mikrofone', count: 2 }
const ORDNER: Service = { key: 'ordner', name: 'Ordner', count: 1 }

const person = (id: string, fn: string, priv: Partial<Qualifications>, extra: Partial<Person> = {}): Person => ({
  id, fn, ln: 'Probe', role: 'verkuendiger', priv: { ...emptyQualifications(), ...priv }, ...extra,
})

/** Anton macht alles, was es hier gibt. */
const ANTON = person(
  'p-anton', 'Anton',
  { 'svc:mikro': true, 'svc:ordner': true, gebet: true, treffpunkt: true, schulungVortrag: true },
  { role: 'aeltester' },
)
const BERTA = person('p-berta', 'Berta', { schulung: true }, { female: true })
const DORA = person('p-dora', 'Dora', { schulungPartner: true }, { female: true })

const leer = (): Meeting => ({ date: '', end: '', sections: [], helpers: {} })
const an = (p: Person) => ({ name: `${p.fn} ${p.ln}`, pid: p.id })

/** Am Sonntag: Vortrag (eigener Redner) und Schlussgebet. */
function wochenende(redner: Person | null, gebet: Person | null): Meeting {
  return {
    ...leer(),
    sections: [
      {
        label: 'VORTRAG', farbe: 'petrol',
        items: [{ iid: 'i-vortrag', title: 'Thema', names: [{ ...(redner ? an(redner) : { name: '' }), rolle: ROLE_OWN_SPEAKER, herkunft: '' }] }],
      },
      {
        label: 'ABSCHLUSS', farbe: 'neutral',
        items: [{ iid: 'i-gebet', title: 'Lied · Gebet', names: [{ ...(gebet ? an(gebet) : { name: '' }), rolle: 'Gebet', bereichsKey: 'gebet' }] }],
      },
    ],
  }
}

/** Unter der Woche: ein Schülerteil mit Führerin und Partnerin, und ein Vortrag nur für Brüder. */
function unterDerWoche(): Meeting {
  return {
    ...leer(),
    sections: [
      {
        label: 'UNS IM DIENST VERBESSERN', farbe: 'gold',
        items: [
          { iid: 'i-gespraech', title: 'Gespräche beginnen', names: [{ ...an(BERTA), rolle: '', bereichsKey: 'schulung' }, { ...an(DORA), rolle: 'Partner', bereichsKey: 'schulungPartner' }] },
          { iid: 'i-schuelervortrag', title: 'Vortrag', names: [{ ...an(ANTON), rolle: '', bereichsKey: 'schulungVortrag', male: true }] },
        ],
      },
    ],
  }
}

function woche(start: string, mid: Meeting, we: Meeting, extra: Partial<Week> = {}): Week {
  return { range: '', book: '', start, mid, we, ...extra }
}

function stand(over: Partial<PlatzStand> = {}): PlatzStand {
  const vorbei = woche(VORBEI, { ...leer(), helpers: { mikro: [an(ANTON)] } }, wochenende(ANTON, ANTON))
  const diese = woche(
    DIESE,
    { ...unterDerWoche(), helpers: { mikro: [an(ANTON)] } },
    { ...wochenende(ANTON, ANTON), helpers: { mikro: [an(ANTON)], ordner: [an(ANTON)] } },
  )
  // Nur der Name, keine Id — wie aus einem alten Import. Er gehört ihr trotzdem.
  // Der Sonntag fällt aus: Seine Plätze ruhen.
  const naechste = woche(
    NAECHSTE,
    { ...leer(), helpers: { mikro: [{ name: 'Anton Probe' }] } },
    { ...leer(), helpers: { mikro: [an(ANTON)] } },
    { dev: { we: { cancelled: true } } },
  )
  const treffpunkt = (id: string, wd: number): FsInstance => ({
    id, ruleId: null, grp: null, wd, time: '09:30', place: 'Saal', leader: 'Anton Probe', lpid: ANTON.id,
  })
  return {
    weeks: [vorbei, diese, naechste],
    fsWeeks: [[treffpunkt('f-alt', 6)], [treffpunkt('f-sa', 6)], []],
    services: [MIKRO, ORDNER],
    persons: [ANTON, BERTA, DORA],
    congregation: { times: ZEITEN },
    confirmations: {},
    ...over,
  }
}

const keys = (s: PlatzStand, vorher: Person, nachher: Person | null) =>
  nichtMehrPassend(s, vorher, nachher, HEUTE).map((p) => p.key)
const ohne = (p: Person, key: string): Person => ({ ...p, priv: { ...p.priv, [key]: false } })

describe('Welche künftigen Plätze nicht mehr passen', () => {
  it('Mikrofon abgeschaltet: frei werden genau die künftigen Mikrofon-Plätze', () => {
    expect(keys(stand(), ANTON, ohne(ANTON, 'svc:mikro'))).toEqual([
      helferKey(DIESE, 'we', 'mikro', 0),
      helferKey(NAECHSTE, 'mid', 'mikro', 0),
    ])
  })

  it('Gegenprobe: Wer alles behält, verliert keinen Platz', () => {
    expect(keys(stand(), ANTON, ANTON)).toEqual([])
  })

  it('Vergangenes bleibt, wie es war — auch der Dienstag dieser Woche', () => {
    const k = keys(stand(), ANTON, ohne(ANTON, 'svc:mikro'))
    expect(k).not.toContain(helferKey(VORBEI, 'mid', 'mikro', 0))
    expect(k).not.toContain(helferKey(DIESE, 'mid', 'mikro', 0))
  })

  it('eine ausgefallene Zusammenkunft trägt keine Aufgaben — ihre Plätze ruhen', () => {
    expect(keys(stand(), ANTON, ohne(ANTON, 'svc:mikro'))).not.toContain(helferKey(NAECHSTE, 'we', 'mikro', 0))
  })

  it('ein Platz nur mit Namen gehört ihr über den Namen', () => {
    expect(keys(stand(), ANTON, ohne(ANTON, 'svc:mikro'))).toContain(helferKey(NAECHSTE, 'mid', 'mikro', 0))
  })

  it('Rolle: Wer kein Ältester mehr ist, steht nicht mehr am Redner-Platz — das Gebet hängt am Bereich', () => {
    expect(keys(stand(), ANTON, { ...ANTON, role: 'verkuendiger' })).toEqual([punktKey(DIESE, 'we', 'i-vortrag', 0, false)])
  })

  it('Gegenprobe: Ein Dienstamtgehilfe hält den Vortrag weiter', () => {
    expect(keys(stand(), ANTON, { ...ANTON, role: 'dienstamtgehilfe' })).toEqual([])
  })

  it('Treffpunkte: Ohne den Bereich wird die Leitung frei — die vergangene nicht', () => {
    expect(keys(stand(), ANTON, ohne(ANTON, 'treffpunkt'))).toEqual([fsTaskKey(DIESE, 'f-sa')])
  })

  it('Entfernen: jeder künftige Platz, nach Termin — Treffpunkt am Samstag vor dem Sonntag', () => {
    expect(keys(stand(), ANTON, null)).toEqual([
      fsTaskKey(DIESE, 'f-sa'),
      punktKey(DIESE, 'we', 'i-vortrag', 0, false),
      punktKey(DIESE, 'we', 'i-gebet', 0, false),
      helferKey(DIESE, 'we', 'mikro', 0),
      helferKey(DIESE, 'we', 'ordner', 0),
      helferKey(NAECHSTE, 'mid', 'mikro', 0),
    ])
  })

  it('Geschlecht: Am Platz nur für Brüder steht eine Schwester nicht', () => {
    // Der Vortrag eines Schülers liegt am Dienstag — eine Woche später, damit er künftig ist.
    const s = stand()
    s.weeks = [...s.weeks, woche('2026-11-30', unterDerWoche(), leer())]
    expect(keys(s, ANTON, { ...ANTON, female: true })).toEqual([punktKey('2026-11-30', 'mid', 'i-schuelervortrag', 0, false)])
  })

  it('Geschlecht: Eine Partnerin, die nicht mehr zur Führerin passt, wird frei', () => {
    const s = stand()
    s.weeks = [...s.weeks, woche('2026-11-30', unterDerWoche(), leer())]
    expect(keys(s, DORA, { ...DORA, female: false })).toEqual([punktKey('2026-11-30', 'mid', 'i-gespraech', 1, false)])
  })

  it('Gegenprobe: Im selben Haushalt passen Bruder und Schwester zueinander', () => {
    const s = stand()
    s.weeks = [...s.weeks, woche('2026-11-30', unterDerWoche(), leer())]
    s.persons = [ANTON, { ...BERTA, fam: 'h1' }, { ...DORA, fam: 'h1' }]
    expect(keys(s, { ...DORA, fam: 'h1' }, { ...DORA, fam: 'h1', female: false })).toEqual([])
  })

  it('jede Aufgabe trägt ihren Stand der Zusage', () => {
    const key = helferKey(DIESE, 'we', 'mikro', 0)
    const [platz] = nichtMehrPassend(stand({ confirmations: { [key]: 'bestätigt' } }), ANTON, ohne(ANTON, 'svc:mikro'), HEUTE)
    expect(platz).toMatchObject({ key, aufgabe: { id: key, rolle: 'Mikrofone', status: 'bestätigt' } })
  })
})

describe('Plätze freigeben', () => {
  const mikroDiese = helferKey(DIESE, 'we', 'mikro', 0)
  const mikroNaechste = helferKey(NAECHSTE, 'mid', 'mikro', 0)

  it('genau die genannten werden offen — die Woche ohne sie behält ihre Referenz', () => {
    const s = stand()
    const r = plaetzeFreigeben(s, ANTON, new Set([mikroDiese]))
    expect(r.frei).toEqual([mikroDiese])
    expect(r.weeks[1]?.we.helpers.mikro?.[0]).toEqual({ name: '' })
    // Der Ordner am selben Sonntag bleibt.
    expect(r.weeks[1]?.we.helpers.ordner?.[0]).toEqual(an(ANTON))
    expect(r.weeks[0]).toBe(s.weeks[0])
    expect(r.weeks[2]).toBe(s.weeks[2])
  })

  it('Gegenprobe: ohne Schlüssel ändert sich nichts', () => {
    const s = stand()
    const r = plaetzeFreigeben(s, ANTON, new Set())
    expect(r.weeks).toBe(s.weeks)
    expect(r.fsWeeks).toBe(s.fsWeeks)
  })

  it('was inzwischen jemand anderem gehört, bleibt', () => {
    const s = stand()
    s.weeks[1]!.we.helpers.mikro = [an(BERTA)]
    const r = plaetzeFreigeben(s, ANTON, new Set([mikroDiese]))
    expect(r.frei).toEqual([])
    expect(r.weeks[1]?.we.helpers.mikro?.[0]).toEqual(an(BERTA))
  })

  it('ein Platz nur mit Namen wird ebenso frei', () => {
    const r = plaetzeFreigeben(stand(), ANTON, new Set([mikroNaechste]))
    expect(r.frei).toEqual([mikroNaechste])
    expect(r.weeks[2]?.mid.helpers.mikro?.[0]).toEqual({ name: '' })
  })

  it('der Redner-Platz geht zurück auf „Gastredner", ohne Person und Versammlung — wie „Entfernen" im Blatt', () => {
    const key = punktKey(DIESE, 'we', 'i-vortrag', 0, false)
    const r = plaetzeFreigeben(stand(), ANTON, new Set([key]))
    const platz = r.weeks[1]?.we.sections[0]?.items[0]
    expect(platz && 'names' in platz ? platz.names[0] : undefined).toEqual({ name: '', rolle: ROLE_GUEST_SPEAKER })
  })

  it('Treffpunkt: Name und Person-Id gehen', () => {
    const key = fsTaskKey(DIESE, 'f-sa')
    const r = plaetzeFreigeben(stand(), ANTON, new Set([key]))
    expect(r.frei).toEqual([key])
    expect(r.fsWeeks[1]?.[0]).toMatchObject({ leader: '' })
    expect(r.fsWeeks[1]?.[0]?.lpid).toBeUndefined()
    // Der vergangene Treffpunkt hat einen anderen Schlüssel und bleibt.
    expect(r.fsWeeks[0]?.[0]?.leader).toBe('Anton Probe')
  })
})
