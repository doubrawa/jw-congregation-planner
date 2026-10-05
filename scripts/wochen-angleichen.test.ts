import { describe, expect, it } from 'vitest'
import {
  angleichen,
  appFunktionen,
  FENSTER,
  GRUND_GRUNDPLAN,
  GRUND_KLASSE,
  GRUND_TREFFPUNKTE_FEHLEN,
  hindernis,
  main,
} from './wochen-angleichen.mjs'
import { fahre, type Aufruf, tabelleVon } from './schema-attrappe'
import { WEEK_LIMIT } from '../src/lib/data'
import { syncAuxSlots } from '../src/data/aux-class'

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
  it('rechnet im Ladefenster der App', () => {
    expect(FENSTER).toBe(WEEK_LIMIT)
  })

  it('eine Woche ohne die eingeschaltete Klasse: angleichen — sonst weist `zuteilen` den Planer ab', async () => {
    const [e] = angleichen({ wochen: [zeile('2026-08-24')], fsWochen: [], regeln: [], personen: [], auxClass: true }, await appFunktionen())
    expect(e?.gruende).toEqual([GRUND_KLASSE])
    expect(hindernis(e!.gruende)).toBe('Planer abgewiesen')
    expect(e?.woche?.mid.auxRatgeber).toBeDefined()
    expect(e?.treffpunkte).toBeNull()
  })

  it('eine Woche, die schon dasteht wie geladen: nichts zu tun', async () => {
    const angeglichen = syncAuxSlots([probeWoche('2026-08-24') as never], true)[0]
    const [e] = angleichen({ wochen: [zeile('2026-08-24', angeglichen)], fsWochen: [], regeln: [], personen: [], auxClass: true }, await appFunktionen())
    expect(e?.gruende).toEqual([])
    expect(e?.woche).toBeNull()
  })

  it('keine Treffpunkt-Zeile, aber ein Grundplan: anlegen — sonst weist der Trigger den Gruppenaufseher ab', async () => {
    const [e] = angleichen({ wochen: [zeile('2026-08-24')], fsWochen: [], regeln: [REGEL], personen: [], auxClass: false }, await appFunktionen())
    expect(e?.gruende).toEqual([GRUND_TREFFPUNKTE_FEHLEN])
    expect(hindernis(e!.gruende)).toBe('Gruppenaufseher abgewiesen')
    expect(e?.neueTreffpunktZeile).toBe(true)
    expect(e?.treffpunkte).toEqual([expect.objectContaining({ grp: G1, time: '09:30', place: 'Probe-Ort' })])
  })

  it('ein Treffpunkt ohne Regel fällt weg, wie beim Laden', async () => {
    const verwaist = [{ id: 'weg', ruleId: 'gibt-es-nicht', grp: G1, wd: 3, time: '18:00', place: 'Weg', leader: '' }]
    const [e] = angleichen(
      { wochen: [zeile('2026-08-24')], fsWochen: [{ start: '2026-08-24', data: verwaist }], regeln: [REGEL], personen: [], auxClass: false },
      await appFunktionen(),
    )
    expect(e?.gruende).toEqual([GRUND_GRUNDPLAN])
    expect(e?.neueTreffpunktZeile).toBe(false)
    expect(e?.treffpunkte?.some((i: { id: string }) => i.id === 'weg')).toBe(false)
  })

  it('ohne Grundplan und ohne Zeile: keine leere Treffpunkt-Zeile', async () => {
    const [e] = angleichen({ wochen: [zeile('2026-08-24')], fsWochen: [], regeln: [], personen: [], auxClass: false }, await appFunktionen())
    expect(e?.gruende).toEqual([])
    expect(e?.treffpunkte).toBeNull()
  })
})

describe('main', () => {
  const bestand = () => ({
    congregations: [{ id: C, name: 'Probe', aux_class: true }],
    weeks: [zeile('2026-08-24'), zeile('2026-08-31')],
    fs_rules: [REGEL],
  })
  const schreibend = (aufrufe: Aufruf[]) => aufrufe.filter((a) => a.method !== 'GET').map((a) => `${a.method} ${tabelleVon(a)}`)

  it('--trocken nennt die Wochen und schreibt nichts', async () => {
    const { aufrufe, ausgabe } = await fahre(() => main(['--trocken']), { bestand: bestand() })
    expect(schreibend(aufrufe)).toEqual([])
    const text = ausgabe.join('\n')
    expect(text).toContain(`2026-08-24  ${GRUND_KLASSE}, ${GRUND_TREFFPUNKTE_FEHLEN}  ← Planer und Gruppenaufseher abgewiesen`)
    expect(text).toContain('nichts geschrieben')
  })

  it('gleicht an — die Wochen auf ihren Stand — und ein zweiter Lauf findet nichts mehr', async () => {
    const erster = await fahre(() => main([]), { bestand: bestand() })
    expect(schreibend(erster.aufrufe)).toEqual(['PATCH weeks', 'POST fs_weeks', 'PATCH weeks', 'POST fs_weeks'])
    const patch = erster.aufrufe.find((a) => a.method === 'PATCH')!
    expect(new URL(`https://x/${patch.pfad}`).searchParams.get('updated_at')).toBe(`eq.${STAND}`)

    // Was der erste Lauf hinterlassen hat, ist der Bestand des zweiten.
    const { tabellen } = erster
    const zweiter = await fahre(() => main([]), { bestand: tabellen })
    expect(schreibend(zweiter.aufrufe)).toEqual([])
    expect(zweiter.ausgabe.join('\n')).toContain('Nichts abweichend')
  })

  it('hat inzwischen jemand gespeichert, bleibt die Woche — samt ihren Treffpunkten', async () => {
    const { aufrufe, ausgabe } = await fahre(() => main([]), {
      bestand: { ...bestand(), weeks: [zeile('2026-08-24')] },
      // Der Vergleich auf den Stand trifft nichts: ein anderer war schneller.
      stoerung: (a) => (a.method === 'PATCH' && tabelleVon(a) === 'weeks' ? { status: 200, json: [] } : undefined),
    })
    expect(schreibend(aufrufe)).toEqual(['PATCH weeks'])
    expect(ausgabe.join('\n')).toContain('inzwischen geändert')
  })
})
