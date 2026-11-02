import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  angleichen,
  appFunktionen,
  GRUND_GRUNDPLAN,
  GRUND_KLASSE,
  GRUND_TREFFPUNKTE_FEHLEN,
  hindernis,
  main,
} from './wochen-angleichen.mjs'
import { fahre, type Aufruf, tabelleVon } from './schema-attrappe'
import { aufbewahrtAb, VERTEILUNG_WOCHEN } from '../src/data/aufbewahrung'
import { syncAuxSlots } from '../src/data/aux-class'

/** Der Tag, an dem die Proben spielen — die Wochen unten liegen kurz davor. */
const HEUTE = new Date(2026, 8, 7, 9, 0)

/**
 * **Das Prüf- und Heilskript für Befund 9** (5.10.2026): Wochen, die nicht so
 * dastehen, wie die App sie lädt, weisen Planer und Gruppenaufseher ab.
 *
 * Geprüft wird hier, dass es die Abweichungen findet, die abweisen lassen, dass
 * es nur schreibt, was abweicht — die Wochen auf ihren Stand —, und dass ein
 * zweiter Lauf nichts mehr findet. Dass seine Kette die des Ladens ist, misst
 * `src/lib/data-load.test.ts` am echten Ladeweg. Alles Platzhalter.
 */

const C = '00000000-0000-4000-8000-000000000001'
const G1 = '00000000-0000-4000-8000-000000000011'
const STAND = '2026-08-20T10:00:00.000000+00:00'
const REGEL = {
  id: '00000000-0000-4000-8000-000000000061', congregation_id: C, grp: G1, wd: 6, time: '09:30:00',
  place: 'Probe-Ort', monthly: 0, skip_cong: false, aus: null, created_at: '2026-01-01T00:00:00Z',
}

/** Eine Woche mit einem Schülerteil, wie der Import sie liefert — ohne Zusätzliche Klasse. */
function probeWoche(start: string) {
  return {
    start,
    range: 'Probewoche',
    book: '',
    mid: {
      date: '', end: '',
      sections: [{ label: 'PROBE', farbe: 'gold', items: [{ iid: `s-${start}`, title: 'Probe-Schülerteil', meta: '', names: [{ name: '', bereichsKey: 'schulung' }] }] }],
      helpers: {},
    },
    we: { date: '', end: '', sections: [], helpers: {} },
  }
}

const zeile = (start: string, data: unknown = probeWoche(start)) => ({ congregation_id: C, start, data, updated_at: STAND })

describe('angleichen', () => {
  it('rechnet im Ladefenster der App: ab dem Montag vor einem Jahr (T125)', async () => {
    const app = await appFunktionen(HEUTE)
    expect(app.ab).toBe(aufbewahrtAb(VERTEILUNG_WOCHEN, HEUTE))
    // Was davor liegt, lädt die App nicht — also gleicht das Skript es auch nicht an.
    const ergebnis = angleichen(
      { wochen: [zeile('2026-08-24'), zeile('2025-09-01')], fsWochen: [], regeln: [], personen: [], auxClass: true },
      app,
    )
    expect(ergebnis.map((e) => e.start)).toEqual(['2026-08-24'])
  })

  it('eine Woche ohne die eingeschaltete Klasse: angleichen — abgewiesen wird seit dem 15.10.2026 niemand mehr', async () => {
    const [e] = angleichen({ wochen: [zeile('2026-09-07')], fsWochen: [], regeln: [], personen: [], auxClass: true }, await appFunktionen(HEUTE))
    expect(e?.gruende).toEqual([GRUND_KLASSE])
    expect(hindernis(e!.gruende)).toBe('')
    expect(e?.woche?.mid.auxRatgeber).toBeDefined()
    expect(e?.treffpunkte).toBeNull()
  })

  it('eine Woche, die schon dasteht wie geladen: nichts zu tun', async () => {
    const angeglichen = syncAuxSlots([probeWoche('2026-09-07') as never], true)[0]
    const [e] = angleichen({ wochen: [zeile('2026-09-07', angeglichen)], fsWochen: [], regeln: [], personen: [], auxClass: true }, await appFunktionen(HEUTE))
    expect(e?.gruende).toEqual([])
    expect(e?.woche).toBeNull()
  })

  it('keine Treffpunkt-Zeile, aber ein Grundplan: anlegen — sonst weist der Trigger den Gruppenaufseher ab', async () => {
    const [e] = angleichen({ wochen: [zeile('2026-09-07')], fsWochen: [], regeln: [REGEL], personen: [], auxClass: false }, await appFunktionen(HEUTE))
    expect(e?.gruende).toEqual([GRUND_TREFFPUNKTE_FEHLEN])
    expect(hindernis(e!.gruende)).toBe('Gruppenaufseher abgewiesen')
    expect(e?.neueTreffpunktZeile).toBe(true)
    expect(e?.treffpunkte).toEqual([expect.objectContaining({ grp: G1, time: '09:30', place: 'Probe-Ort' })])
  })

  it('ein Treffpunkt ohne Regel fällt weg, wie beim Laden', async () => {
    const verwaist = [{ id: 'weg', ruleId: 'gibt-es-nicht', grp: G1, wd: 3, time: '18:00', place: 'Weg', leader: '' }]
    const [e] = angleichen(
      { wochen: [zeile('2026-09-07')], fsWochen: [{ start: '2026-09-07', data: verwaist }], regeln: [REGEL], personen: [], auxClass: false },
      await appFunktionen(HEUTE),
    )
    expect(e?.gruende).toEqual([GRUND_GRUNDPLAN])
    expect(e?.neueTreffpunktZeile).toBe(false)
    expect(e?.treffpunkte?.some((i: { id: string }) => i.id === 'weg')).toBe(false)
  })

  it('eine Woche vor der laufenden gleicht es nicht an — wie die App beim Laden (`wirktAb`)', async () => {
    // Am 7.9. ist der 31.8. vorbei: ohne Klasse und ohne Treffpunkt-Zeile, und so bleibt sie.
    const [e] = angleichen({ wochen: [zeile('2026-08-31')], fsWochen: [], regeln: [REGEL], personen: [], auxClass: true }, await appFunktionen(HEUTE))
    expect(e?.gruende).toEqual([])
    expect(e?.woche).toBeNull()
    expect(e?.treffpunkte).toBeNull()
  })

  it('ohne Grundplan und ohne Zeile: keine leere Treffpunkt-Zeile', async () => {
    const [e] = angleichen({ wochen: [zeile('2026-09-07')], fsWochen: [], regeln: [], personen: [], auxClass: false }, await appFunktionen(HEUTE))
    expect(e?.gruende).toEqual([])
    expect(e?.treffpunkte).toBeNull()
  })
})

describe('main', () => {
  // `main` rechnet das Ladefenster vom heutigen Tag — im Test von HEUTE.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(HEUTE)
  })
  afterEach(() => vi.useRealTimers())

  const bestand = () => ({
    congregations: [{ id: C, name: 'Probe', aux_class: true }],
    weeks: [zeile('2026-09-07'), zeile('2026-09-14')],
    fs_rules: [REGEL],
  })
  const schreibend = (aufrufe: Aufruf[]) => aufrufe.filter((a) => a.method !== 'GET').map((a) => `${a.method} ${tabelleVon(a)}`)

  it('--trocken nennt die Wochen und schreibt nichts', async () => {
    const { aufrufe, ausgabe } = await fahre(() => main(['--trocken']), { bestand: bestand() })
    expect(schreibend(aufrufe)).toEqual([])
    const text = ausgabe.join('\n')
    expect(text).toContain(`2026-09-07  ${GRUND_KLASSE}, ${GRUND_TREFFPUNKTE_FEHLEN}  ← Gruppenaufseher abgewiesen`)
    expect(text).toContain('nichts geschrieben')
  })

  it('gleicht an — die Wochen auf ihren Stand — und ein zweiter Lauf findet nichts mehr', async () => {
    const erster = await fahre(() => main([]), { bestand: bestand() })
    expect(schreibend(erster.aufrufe)).toEqual([
      'POST rpc/woche_speichern', 'POST rpc/treffpunkte_speichern', 'POST rpc/woche_speichern', 'POST rpc/treffpunkte_speichern',
    ])
    const staende = erster.aufrufe.filter((a) => a.method === 'POST').map((a) => (a.body as { p_stand: string | null }).p_stand)
    // Die Woche auf ihren Stand; die Treffpunkt-Zeile gab es noch nicht.
    expect(staende).toEqual([STAND, null, STAND, null])

    // Was der erste Lauf hinterlassen hat, ist der Bestand des zweiten.
    const { tabellen } = erster
    const zweiter = await fahre(() => main([]), { bestand: tabellen })
    expect(schreibend(zweiter.aufrufe)).toEqual([])
    expect(zweiter.ausgabe.join('\n')).toContain('Nichts abweichend')
  })

  it('hat inzwischen jemand gespeichert, bleibt die Woche — samt ihren Treffpunkten', async () => {
    const { aufrufe, ausgabe } = await fahre(() => main([]), {
      bestand: { ...bestand(), weeks: [zeile('2026-09-07')] },
      // Der Vergleich auf den Stand trifft nichts: ein anderer war schneller.
      stoerung: (a) => (tabelleVon(a) === 'rpc/woche_speichern' ? { status: 200, json: [] } : undefined),
    })
    expect(schreibend(aufrufe)).toEqual(['POST rpc/woche_speichern'])
    expect(ausgabe.join('\n')).toContain('inzwischen geändert')
  })
})
