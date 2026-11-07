import { describe, expect, it } from 'vitest'
import type { FsBereich, MeetingTab, Screen } from '../src/data/types'
import { FONT_SCALES } from '../src/data/constants'
import { APP_LANGS, isRTL } from '../src/i18n/langs'
import { BILDSCHIRME } from '../tests/testdaten/bildschirme'
import { parseDebugHash } from '../tests/testdaten/demo-start'
import { DEMO_PERSONS } from '../tests/testdaten/testdaten'
import { uhrAusHash } from '../tests/testdaten/uhr'
import { auftraege, auftragsName, hashVon, SAETZE, SPRACH_ZUSTAENDE, WEITERE_SPRACHEN, ZUSTAENDE } from './laufzeit-auftraege.mjs'

/**
 * **Die Laufzeit-Messung lädt jeden Zustand, den es gibt — und nur solche,
 * die die Entwicklerseite versteht** (T167).
 *
 * Die Zustände stehen als Liste von Hashes da. Zwei Arten, wie sie still
 * auseinanderläuft: Ein neuer Bildschirm, Reiter oder Bereich kommt in die App
 * und nie in die Liste — die Messung bleibt grün, weil sie ihn nie lädt. Oder
 * ein Schalter ist vertippt (`fb=trolley`): `parseDebugHash` übergeht ihn, und
 * gemessen wird ein anderer Zustand als der, der dasteht. Beides prüft diese
 * Datei gegen die App selbst, nicht gegen eine zweite Liste.
 */

const geparst = (hash: string) => {
  const d = parseDebugHash(`#${hash}`)
  if (!d) throw new Error(`parseDebugHash versteht „${hash}" gar nicht`)
  return d
}
const werte = (schluessel: string) =>
  new Set(ZUSTAENDE.map((z) => new URLSearchParams(z).get(schluessel)).filter((w): w is string => w !== null))

describe('Jeder Zustand der App wird geladen', () => {
  it('jeder Bildschirm, auch die Anmeldung', () => {
    const geladen = new Set(ZUSTAENDE.map((z) => geparst(z).screen))
    const alle: Screen[] = [...BILDSCHIRME, 'login']
    expect(alle.filter((s) => !geladen.has(s))).toEqual([])
  })

  it('jeder Reiter in Programm und Planen', () => {
    // `edit` ist kein Reiter, den der Hash kennt — er öffnet sich aus einer Woche.
    const reiter = Object.keys({ mid: 1, we: 1, fs: 1, wp: 1, zusagen: 1 } satisfies Record<Exclude<MeetingTab, 'edit'>, 1>)
    expect(reiter.filter((r) => !werte('tab').has(r))).toEqual([])
  })

  it('jeder Bereich im Predigtdienst', () => {
    const bereiche = Object.keys({ treffpunkte: 1, gruppenbesuche: 1, trolleys: 1, grundplan: 1 } satisfies Record<FsBereich, 1>)
    expect(bereiche.filter((b) => !werte('fb').has(b))).toEqual([])
  })

  it('jede Rolle: Verkündiger, Planer, Admin', () => {
    const rollen = new Set(ZUSTAENDE.map((z) => new URLSearchParams(z).get('pl') ?? 'admin'))
    expect([...rollen].sort()).toEqual(['0', '2', 'admin'])
  })

  it('jede Sprache der App läuft im vollen Satz', () => {
    const sprachen = new Set(auftraege('voll').map((a) => a.sprache))
    expect(APP_LANGS.map((l) => l.code).filter((c) => !sprachen.has(c))).toEqual([])
    expect(WEITERE_SPRACHEN).not.toContain('de')
  })
})

describe('Jeder Schalter wird verstanden', () => {
  /** Was `parseDebugHash` aus einem Schalter macht — fehlt er im Ergebnis, war er vertippt. */
  const versteht: Record<string, (d: ReturnType<typeof geparst>, wert: string, hash: string) => boolean> = {
    s: (d, w) => d.screen === w,
    tab: (d, w) => d.tab === w,
    fb: (d, w) => d.fsBereich === w,
    pl: (d, w) => (w === '2' ? d.zuteiler === true : d.planner === (w === '1')),
    me: (d, w) => d.me === w,
    p: (d, w) => d.personId === w,
    konto: (d) => d.konto === true,
    vorlage: (d) => d.vorlage === true,
    ohnevers: (d) => d.keineVersammlung === true,
    stale: (d) => d.staleAt !== undefined,
    langsam: (d) => d.staleLangsam === true,
    uhr: (_d, _w, hash) => uhrAusHash(`#${hash}`) !== null,
  }

  it.each(ZUSTAENDE)('%s', (zustand) => {
    const d = geparst(zustand)
    const unverstanden = [...new URLSearchParams(zustand)].filter(([k, w]) => !versteht[k]?.(d, w, zustand)).map(([k, w]) => `${k}=${w}`)
    expect(unverstanden).toEqual([])
  })

  it('jede genannte Person gibt es in den Testdaten', () => {
    const ids = new Set(DEMO_PERSONS.map((p) => p.id))
    expect([...werte('me'), ...werte('p')].filter((id) => !ids.has(id))).toEqual([])
  })

  it('kein Zustand steht doppelt da', () => {
    expect(new Set(ZUSTAENDE).size).toBe(ZUSTAENDE.length)
  })

  it('die Sprach-Zustände sind Zustände der Liste', () => {
    expect(SPRACH_ZUSTAENDE.filter((z) => !ZUSTAENDE.includes(z))).toEqual([])
  })
})

describe('Die Sätze', () => {
  it('der Kernsatz lädt jeden Zustand — schmal mit größter Schrift, breit und von rechts nach links', () => {
    const kern = auftraege('kern')
    expect(new Set(kern.map((a) => a.zustand))).toEqual(new Set(ZUSTAENDE))
    expect(Math.min(...kern.map((a) => a.breite))).toBe(320)
    expect(Math.max(...kern.map((a) => a.breite))).toBeGreaterThanOrEqual(1440)
    expect(kern.some((a) => a.breite === 320 && a.schrift === String(Math.max(...FONT_SCALES)))).toBe(true)
    expect(kern.some((a) => isRTL(a.sprache as never))).toBe(true)
    expect(new Set(kern.map((a) => a.darstellung))).toEqual(new Set(['hell', 'dunkel']))
  })

  it('der volle Satz enthält den Kernsatz', () => {
    const voll = new Set(auftraege('voll').map(auftragsName))
    expect(auftraege('kern').map(auftragsName).filter((n) => !voll.has(n))).toEqual([])
  })

  it.each(Object.keys(SAETZE))('„%s" hat keinen Auftrag doppelt und nur gültige Fassungen', (satz) => {
    const liste = auftraege(satz)
    expect(new Set(liste.map(auftragsName)).size).toBe(liste.length)
    const sprachen = new Set<string>(APP_LANGS.map((l) => l.code))
    const stufen = new Set(FONT_SCALES.map(String))
    expect(liste.filter((a) => !sprachen.has(a.sprache) || !stufen.has(a.schrift))).toEqual([])
  })

  it('der Hash trägt Sprache, Darstellung und Schriftstufe — die Seite übernimmt sie', () => {
    const a = { zustand: 's=planen&tab=mid', breite: 375, sprache: 'ar', darstellung: 'dunkel' as const, schrift: '1.45' }
    expect(geparst(hashVon(a))).toMatchObject({ screen: 'planen', tab: 'mid', lang: 'ar', theme: 'dunkel', fontScale: 1.45 })
  })

  it('„--nur" filtert über den Namen, ein unbekannter Satz wird abgewiesen', () => {
    const nur = auftraege('kern', '^s=personen&p=p1 · 320 px')
    expect(nur.map(auftragsName)).toEqual(['s=personen&p=p1 · 320 px · de · dunkel · Stufe 1.45'])
    expect(() => auftraege('gibtsnicht')).toThrow(/Unbekannter Satz/)
  })
})
