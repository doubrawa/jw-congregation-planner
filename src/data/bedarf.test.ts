import { describe, expect, it } from 'vitest'
import { bedarfJeBereich, engpaesse, offenTrotzAllem } from './bedarf'
import { buildAbsences } from './absence'
import { emptyQualifications } from './helpers'
import type { Absence, Meeting, Person, Service, Week } from './types'

/**
 * „Es sind gar nicht genug Leute da."
 *
 * Der Fall des Betreibers, wörtlich: Zehn Personen können Mikrofone, drei
 * Plätze sind zu besetzen, an dem Tag fehlen acht — zwei können, einer bleibt
 * offen. Diese Datei hält fest, wann gewarnt wird und wann **nicht**: Eine
 * Warnung, die auch nur manchmal grundlos erscheint, wird weggeklickt und dann
 * auch dann übersehen, wenn sie stimmt.
 */

const MONTAG = '2026-09-07' // Woche 0; Zusammenkünfte Di und So
const ZEITEN = 'Di 19:00 · So 10:00'

const person = (id: string, ...bereiche: string[]): Person => ({
  id, fn: `P${id}`, ln: 'Beispiel', role: 'verkuendiger', tel: '', mail: '',
  priv: { ...emptyQualifications(), ...Object.fromEntries(bereiche.map((b) => [b, true])) },
})

const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 3, groups: false }]

function zusammenkunft(): Meeting {
  return { date: '', end: '', sections: [], helpers: {} }
}

function woche(): Week {
  return { range: '', book: '', start: MONTAG, current: true, mid: zusammenkunft(), we: zusammenkunft() }
}

/** Abwesenheit über den ganzen Zeitraum, damit beide Zusammenkünfte betroffen sind. */
const abw = (personId: string, von = '2026-09-07', bis = '2026-09-13'): Absence =>
  ({ id: `a-${personId}`, personId, userId: null, from: von, to: bis, reason: '' })

/** Der `AbsenceSet`, wie ihn die App baut (`useAbwesend`). */
const set = (absences: Absence[]) =>
  buildAbsences(absences, [woche()], new Date(`${MONTAG}T12:00:00`), ZEITEN)

describe('Der Fall aus der Praxis: zehn können Mikrofone, acht fehlen', () => {
  const zehn = Array.from({ length: 10 }, (_unused, i) => person(`m${i}`, 'svc:mik'))
  const achtWeg = zehn.slice(0, 8).map((p) => abw(p.id))

  it('meldet den einen Platz, der offen bleiben muss', () => {
    const treffer = engpaesse(zusammenkunft(), DIENSTE, zehn, set(achtWeg), 0, 'mid')
    expect(treffer).toEqual([{ key: 'svc:mik', benoetigt: 3, verfuegbar: 2, qualifiziert: 10 }])
    expect(offenTrotzAllem(treffer)).toBe(1)
  })

  it('schweigt, solange es gerade reicht', () => {
    // Sieben weg, drei da, drei Plätze — knapp, aber besetzbar. Genau hier
    // fängt der Unterschied zwischen „eng" und „unmöglich" an.
    const siebenWeg = zehn.slice(0, 7).map((p) => abw(p.id))
    expect(engpaesse(zusammenkunft(), DIENSTE, zehn, set(siebenWeg), 0, 'mid')).toEqual([])
  })

  it('schweigt ganz ohne Abwesenheit', () => {
    expect(engpaesse(zusammenkunft(), DIENSTE, zehn, set([]), 0, 'mid')).toEqual([])
  })
})

describe('Der Tag entscheidet, nicht die Woche', () => {
  it('der Dienstag kann knapp sein und der Sonntag nicht', () => {
    /*
     * Abwesenheit gilt taggenau — darauf legt die App überall Wert. Wer nur
     * übers Wochenende weg ist, steht dienstags zur Verfügung; eine Warnung
     * über „die Woche" wäre für einen der beiden Tage schlicht falsch.
     */
    const drei = [person('a', 'svc:mik'), person('b', 'svc:mik'), person('c', 'svc:mik')]
    // Nur am Sonntag (13.9.) weg.
    const nurSonntag = set([abw('a', '2026-09-13', '2026-09-13'), abw('b', '2026-09-13', '2026-09-13')])
    expect(engpaesse(zusammenkunft(), DIENSTE, drei, nurSonntag, 0, 'mid')).toEqual([])
    expect(engpaesse(zusammenkunft(), DIENSTE, drei, nurSonntag, 0, 'we')).toEqual([
      { key: 'svc:mik', benoetigt: 3, verfuegbar: 1, qualifiziert: 3 },
    ])
  })
})

describe('Was gezählt wird und was nicht', () => {
  it('Gruppen-Dienste bleiben draußen — sie brauchen keine Person', () => {
    // Die Reinigung rotiert über Predigtdienstgruppen; eine Abwesenheit kann
    // sie nicht unbesetzbar machen.
    const rein: Service[] = [{ key: 'rein', name: 'Reinigung', count: 1, groups: true }]
    expect(bedarfJeBereich(zusammenkunft(), rein).size).toBe(0)
  })

  it('ein Platz ohne Bereich zählt nirgends mit', () => {
    // Gastredner und Kreisaufseher tragen keinen Bereichs-Schlüssel — für sie
    // gibt es keinen Bewerberkreis, den man zählen könnte.
    const m = zusammenkunft()
    m.sections = [{ label: 'ÖFFENTLICHER VORTRAG', farbe: 'wein', items: [
      { title: 'Vortrag', meta: '', names: [{ name: '', rolle: 'Gastredner' }] },
    ] }]
    expect(bedarfJeBereich(m, []).size).toBe(0)
  })

  it('besetzte Plätze zählen mit — gefragt ist, ob die Versammlung genug Leute HAT', () => {
    /*
     * Sonst verschwände die Warnung, sobald der Planer die zwei Verfügbaren
     * einträgt — und der dritte Platz stünde unerklärt offen da. Die Aussage
     * ist strukturell, nicht ein Fortschrittsbalken.
     */
    const m = zusammenkunft()
    m.helpers = { mik: [{ name: 'P m8' }, { name: 'P m9' }] }
    const zehn = Array.from({ length: 10 }, (_unused, i) => person(`m${i}`, 'svc:mik'))
    const achtWeg = zehn.slice(0, 8).map((p) => abw(p.id))
    expect(engpaesse(m, DIENSTE, zehn, set(achtWeg), 0, 'mid')[0]?.benoetigt).toBe(3)
  })

  it('zählt keine Person doppelt, die für zwei Bereiche taugt — aber warnt dann eben weniger', () => {
    /*
     * Die bewusste Untergrenze: Wer Mikrofone UND Ordner kann, steht in beiden
     * Töpfen, obwohl er an dem Tag nur eine Aufgabe übernimmt. Die Lücke kann
     * also größer ausfallen als gemeldet, nie kleiner — lieber eine Warnung
     * zu wenig als eine grundlose.
     */
    const dienste: Service[] = [
      { key: 'mik', name: 'Mikrofone', count: 1, groups: false },
      { key: 'ord', name: 'Ordner', count: 1, groups: false },
    ]
    const einer = [person('a', 'svc:mik', 'svc:ord')]
    expect(engpaesse(zusammenkunft(), dienste, einer, set([]), 0, 'mid')).toEqual([])
  })

  it('sortiert die größte Lücke nach oben', () => {
    const dienste: Service[] = [
      { key: 'mik', name: 'Mikrofone', count: 3, groups: false },
      { key: 'ord', name: 'Ordner', count: 2, groups: false },
    ]
    const leute = [person('a', 'svc:ord')]
    const treffer = engpaesse(zusammenkunft(), dienste, leute, set([]), 0, 'mid')
    expect(treffer.map((e) => e.key)).toEqual(['svc:mik', 'svc:ord'])
    expect(offenTrotzAllem(treffer)).toBe(4) // 3 Mikrofone ohne jeden, 1 Ordner
  })
})
