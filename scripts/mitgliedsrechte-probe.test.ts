import { describe, expect, it } from 'vitest'
import {
  bewerteVersuch,
  dienstAusSchluessel,
  eigeneSlots,
  fremdeSlots,
  helferSchluessel,
  qualifiziertFuer,
  slotSchluessel,
} from './mitgliedsrechte-probe.mjs'
import { helferKey, punktKey } from '../src/data/planning'
import { isQualified, serviceQualKey } from '../src/data/helpers'
import type { PartItem, Person } from '../src/data/types'

/**
 * Die Probe selbst läuft nur gegen eine echte Datenbank. Geprüft wird hier das,
 * woran sie **still falsch** werden könnte: der Schlüssel.
 *
 * Ein falsch gebauter `task_key` wäre die tückischste Art zu scheitern — die
 * Datenbank nähme ihn anstandslos an, die Probe meldete „durchgelassen", und
 * der Befund wäre trotzdem nicht belegt: Der Schlüssel bezöge sich auf gar
 * keinen Slot. Deshalb wird er gegen `planning.ts` gehalten, nicht gegen eine
 * hier abgeschriebene Erwartung.
 */

const punkt = (iid = 'k3f9x'): PartItem => ({ iid, title: 'Probe', names: [] })

describe('Der Schlüssel ist derselbe wie in der App', () => {
  it('Programmpunkt: Woche, Zusammenkunft, Raum, Kennung, Platz', () => {
    const item = punkt()
    expect(slotSchluessel(item, '2026-08-17', 'mid', 0)).toBe(punktKey('2026-08-17', 'mid', item.iid, 0))
  })

  it('und die Zusätzliche Klasse trägt „aux" statt „part"', () => {
    const item = punkt()
    expect(slotSchluessel(item, '2026-08-17', 'we', 1, true)).toBe(punktKey('2026-08-17', 'we', item.iid, 1, true))
    expect(slotSchluessel(item, '2026-08-17', 'we', 1, true)).toContain('|aux|')
  })

  it('Hilfsdienste ebenso', () => {
    expect(helferSchluessel('2026-08-17', 'mid', 'mik', 1)).toBe(helferKey('2026-08-17', 'mid', 'mik', 1))
  })
})

describe('Fremde Aufgaben finden', () => {
  const week = {
    start: '2026-08-17',
    mid: {
      sections: [
        {
          items: [
            { song: 'Lied 1' },
            { iid: 'a1', title: 'Einleitung', names: [{ name: 'Ich', pid: 'ich' }, { name: 'Anderer', pid: 'fremd' }] },
          ],
        },
      ],
      helpers: { mik: [{ name: 'Ich', pid: 'ich' }, { name: 'Dritter', pid: 'fremd2' }] },
    },
    we: {
      sections: [
        { items: [{ iid: 'b1', title: 'Vortrag', names: [{ name: 'H. Brügger', rolle: 'Gastredner · Vers. Oberau' }] }] },
      ],
      helpers: {},
    },
  }

  it('findet fremde Programmplätze und Hilfsdienste, nicht die eigenen', () => {
    const treffer = fremdeSlots(week, 'ich')
    expect(treffer.map((t) => t.wer).sort()).toEqual(['Anderer', 'Dritter'])
  })

  it('externe Redner bleiben außen vor — sie haben keinen Bestätigungs-Flow', () => {
    // Der Gastredner am Wochenende steht ohne `pid` im Platz.
    expect(fremdeSlots(week, 'ich').some((t) => t.wer === 'H. Brügger')).toBe(false)
  })

  it('die Schlüssel tragen Woche, Zusammenkunft und Art', () => {
    const treffer = fremdeSlots(week, 'ich')
    expect(treffer.find((t) => t.art === 'Programm')?.key).toBe('2026-08-17|mid|part|a1|1')
    expect(treffer.find((t) => t.art.startsWith('Hilfsdienst'))?.key).toBe('2026-08-17|mid|helper|mik|1')
  })

  it('findet umgekehrt die eigenen — der Gegenbeweis zur Strenge', () => {
    /*
     * Ohne diesen Fund misst die Probe nur die halbe Wahrheit: Eine Richtlinie,
     * die ALLES abweist, bestünde jede Fremd-Probe glänzend und bräche die App.
     * Fall (5) braucht deshalb eine Aufgabe, die dem Mitglied wirklich gehört.
     */
    const treffer = eigeneSlots(week, 'ich')
    expect(treffer.map((t) => t.art)).toEqual(['Programm', 'Hilfsdienst mik'])
    expect(treffer.every((t) => t.wer === 'Ich')).toBe(true)
  })

  it('ohne eigene Person gibt es keine eigenen Plätze', () => {
    // Ein Konto ohne verknüpfte Person hat keine Aufgaben — dann bleibt (5)
    // ungemessen, statt zufällig einen fremden Platz zu treffen.
    expect(eigeneSlots(week, null)).toEqual([])
  })

  it('ohne eigene Person gilt alles Besetzte als fremd — bis auf den Gastredner', () => {
    // Vier Plätze mit `pid` (zwei im Programm, zwei im Hilfsdienst); der
    // Gastredner hat keine und bleibt auch hier draußen.
    expect(fremdeSlots(week, null).map((t) => t.wer)).toEqual(['Ich', 'Anderer', 'Ich', 'Dritter'])
  })
})

describe('Einen Schreibversuch bewerten', () => {
  it('angekommen heißt: der Befund ist bestätigt, nicht „bestanden"', () => {
    const e = bewerteVersuch(201, true, true)
    expect(e).toMatchObject({ durch: true, wieErwartet: true })
    expect(e.text).toMatch(/ANGEKOMMEN/)
  })

  it('abgewiesen, wo es abgewiesen gehört', () => {
    expect(bewerteVersuch(403, false, false)).toMatchObject({ durch: false, wieErwartet: true })
  })

  it('und jede Überraschung fällt auf — in beide Richtungen', () => {
    expect(bewerteVersuch(403, false, true).wieErwartet).toBe(false)
    expect(bewerteVersuch(201, true, false).wieErwartet).toBe(false)
  })

  /*
    Der teuer gelernte Fall: Die Mitteilung wurde geschrieben, aber der
    Absender darf sie nicht zurücklesen — PostgreSQL wendet SELECT-Richtlinien
    auf `RETURNING` an, und PostgREST hängt es bei `return=representation` an.
    Die erste Fassung urteilte nach dem Status und hätte S3 fälschlich als
    behoben abgehakt. Seither entscheidet allein, ob die Zeile am Ziel liegt.
  */
  it('ein 403 aus dem RETURNING kippt das Urteil nicht — gezählt wird, was ankam', () => {
    const e = bewerteVersuch(403, true, true)
    expect(e).toMatchObject({ durch: true, wieErwartet: true })
    expect(e.text).toBe('ANGEKOMMEN (HTTP 403)')
  })

  /*
    „Nicht angekommen" ist nur ein Urteil, wenn gemessen wurde. Bis zum
    26.9.2026 hieß ein Schreibversuch mit vertippter Spalte (400) bei jedem
    verbotenen Fall „abgewiesen" — nichts war angekommen, weil nichts
    gefragt wurde. Ebenso ein Nachsehen, das selbst scheiterte.
  */
  it('ein 400 beim Schreiben ist kein Urteil — auch wenn nichts ankam', () => {
    const e = bewerteVersuch(400, false, false)
    expect(e).toMatchObject({ durch: false, wieErwartet: false, kaputt: true })
    expect(e.text).toMatch(/PROBE KAPUTT — Schreiben scheiterte \(HTTP 400\)/)
  })

  it('scheitert das Nachsehen, ist ebenso nichts gemessen', () => {
    const e = bewerteVersuch(201, false, false, { leseStatus: 400 })
    expect(e).toMatchObject({ wieErwartet: false, kaputt: true })
    expect(e.text).toMatch(/Nachsehen scheiterte \(HTTP 400\)/)
  })

  it('aufräumen darf nur, wo die Zeile angekommen sein kann', () => {
    // Durchgekommen, nur nicht nachprüfbar: vorsorglich aufräumen.
    expect(bewerteVersuch(201, false, false, { leseStatus: 400 }).vielleichtDurch).toBe(true)
    // Schon das Schreiben scheiterte — etwa 409, weil die Zusage längst in der
    // App steht. Gelöscht würde dann genau die, nicht eine Zeile der Probe.
    expect(bewerteVersuch(409, true, true).vielleichtDurch).toBe(false)
    // Von der Regel abgewiesen, und das Nachsehen scheiterte: ebenso nichts da.
    expect(bewerteVersuch(403, false, false, { leseStatus: 500 }).vielleichtDurch).toBe(false)
  })

  it('bei einer Edge Function sagt der Aufrufer, welcher Fehler ein Urteil ist', () => {
    // `substitute` meldet mit 409 sowohl „not-sought" (das Urteil über S13)
    // als auch „slot-taken" (keins); am Status allein ist das nicht zu sehen.
    expect(bewerteVersuch(409, false, false, { urteil: true })).toMatchObject({ wieErwartet: true })
    expect(bewerteVersuch(409, false, false, { urteil: false })).toMatchObject({ kaputt: true })
    expect(bewerteVersuch(403, false, false, { urteil: false })).toMatchObject({ kaputt: true })
  })
})

describe('Ist das Mitglied für den Platz überhaupt qualifiziert? (Fall 9)', () => {
  /*
    Ohne diese Vorprüfung misst Fall 9 nichts: `take` weist zuerst ab, wer für
    den Dienst nicht freigeschaltet ist („not-qualified"), und das sähe genauso
    aus wie die Prüfung, um die es geht („not-sought"). Die Probe muss den
    Unterschied kennen, sonst meldet sie S13 als geschlossen, ohne dort gewesen
    zu sein.
  */
  it('liest den Dienst aus einem Hilfsdienst-Schlüssel', () => {
    expect(dienstAusSchluessel(helferKey('2026-08-17', 'mid', 'mik', 1))).toBe('mik')
  })

  it.each([
    ['Programmpunkt', '2026-08-17|mid|part|k3f9x|0'],
    ['Treffpunkt', 'fs|2026-08-17|abc'],
    ['zu kurz', '2026-08-17|mid'],
    ['leer', ''],
    ['nichts', undefined],
  ])('%s ist kein Hilfsdienst — null', (_name, key) => {
    expect(dienstAusSchluessel(key)).toBeNull()
  })

  it('die Freischaltung wird genauso gelesen wie in der App', () => {
    const person = { priv: { 'svc:mik': true } } as unknown as Person
    expect(qualifiziertFuer(person, 'mik')).toBe(isQualified(person, serviceQualKey('mik')))
    expect(qualifiziertFuer(person, 'ton')).toBe(isQualified(person, serviceQualKey('ton')))
  })

  it('und eine Person ohne priv fällt nicht auf die Nase', () => {
    // Im Altbestand kann `priv` fehlen; ein Absturz hier bräche die ganze Probe
    // ab, statt Fall 9 als „nicht gemessen" zu melden.
    for (const p of [undefined, null, {}, { priv: null }]) {
      expect(qualifiziertFuer(p, 'mik')).toBe(false)
    }
  })
})
