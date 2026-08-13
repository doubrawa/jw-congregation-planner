import { describe, expect, it } from 'vitest'
import {
  gedaechtnismahlDatum,
  gedaechtnismahlWoche,
  istLeseprogramm,
  leseprogrammJahr,
  montagDerWoche,
  wochenSpanne,
} from './gedaechtnismahl'

/**
 * T65 — die Woche, die das Arbeitsheft auslässt.
 *
 * **Der Befund, der den Zuschnitt geändert hat:** Die Lücke gibt es *nicht* in
 * jedem Jahr. Nachgemessen an zwei Ausgaben:
 *
 * | Ausgabe         | Gedächtnismahl       | Wochenseiten | Lücke |
 * | --------------- | -------------------- | ------------ | ----- |
 * | März/April 2024 | Sonntag, 24. März    | 9            | keine |
 * | März/April 2026 | Donnerstag, 2. April | 8            | eine  |
 *
 * Im Arbeitsheft steht nur die Zusammenkunft unter der Woche. Fällt das Mahl
 * auf einen Werktag, entfällt genau diese — dann gibt es nichts zu drucken.
 * Fällt es aufs Wochenende, läuft sie normal, und die Seite ist da.
 *
 * Die Vorlagen unten tragen deshalb die **gemessene Struktur**, aber keinen
 * übernommenen jw.org-Text: die Tagesüberschriften sind Datumsformen, das Wort
 * „GEDÄCHTNISMAHL" steht ohnehin als Anker im Code, und alles Übrige ist frei
 * erfunden.
 */

/** Seite in der gemessenen Form: Tagesüberschriften, eine davon mit dem Mahl. */
const SEITE = `
<article>
  <h1>Bibellese&shy;programm — Beispielseite</h1>
  <p>Einleitender Absatz, frei erfunden.</p>
  <h2>MITTWOCH, 1. APRIL</h2>
  <p>SONNENAUFGANG · Beispielverweis 1:1-5</p>
  <p>SONNENUNTERGANG (13. Nisan beginnt)</p>
  <h2>DONNERSTAG, 2. APRIL</h2>
  <p><strong>GEDÄCHTNISMAHL</strong> (NACH SONNENUNTERGANG)</p>
  <p>SONNENAUFGANG · Beispielverweis 2:1-9</p>
  <h2>FREITAG, 3. APRIL</h2>
  <p>Weiterer Absatz.</p>
</article>`

describe('gedaechtnismahlDatum: das Datum wird gemessen, nicht geraten', () => {
  it('nimmt die Tagesüberschrift unmittelbar vor dem Mahl', () => {
    expect(gedaechtnismahlDatum(SEITE, 2026)).toBe('2026-04-02')
  })

  it('das Jahr kommt von außen — die Seite nennt es bei den Tagen nicht', () => {
    expect(gedaechtnismahlDatum(SEITE, 2031)).toBe('2031-04-02')
  })

  it('auch wenn das Mahl auf einen Sonntag fällt', () => {
    // Der Fall 2024 — und der, in dem hinterher **keine** Woche fehlt.
    const seite = SEITE.replace('DONNERSTAG, 2. APRIL', 'SONNTAG, 24. MÄRZ')
    expect(gedaechtnismahlDatum(seite, 2024)).toBe('2024-03-24')
  })

  it('ohne das Wort steht kein Datum fest', () => {
    expect(gedaechtnismahlDatum(SEITE.replace('GEDÄCHTNISMAHL', 'ETWAS ANDERES'), 2026)).toBeNull()
  })

  it('und ein unbekannter Monat wird nicht geraten', () => {
    // Lieber keine Woche als eine falsch datierte: an ihr hinge der Ausfall
    // einer Zusammenkunft.
    expect(gedaechtnismahlDatum(SEITE.replace('2. APRIL', '2. GRUMBEL'), 2026)).toBeNull()
  })

  it('ohne Tagesüberschrift davor ebenfalls nicht', () => {
    // Der Seitentitel nennt das Wort auch — er trägt aber kein Datum vor sich.
    expect(gedaechtnismahlDatum('<h1>Programm zum GEDÄCHTNISMAHL 2026</h1>', 2026)).toBeNull()
  })
})

describe('istLeseprogramm: das weiche Trennzeichen im Pfad', () => {
  /*
    Im Pfad steckt ein U+00AD mitten in „Bibellese­programm" — je nach Herkunft
    wörtlich, als Entity oder prozentkodiert. Ein Vergleich auf dem rohen Pfad
    ginge leer aus, obwohl er richtig aussieht.
  */
  it('erkennt ihn wörtlich', () => {
    expect(istLeseprogramm('/de/bibliothek/jw-arbeitsheft/x-mwb/Bibellese­programm-fuer-das-Gedaechtnismahl-2026/')).toBe(true)
  })

  it('erkennt ihn prozentkodiert', () => {
    expect(istLeseprogramm('/de/bibliothek/jw-arbeitsheft/x-mwb/Bibellese%C2%ADprogramm-Gedaechtnismahl-2026/')).toBe(true)
  })

  it('und ohne ihn erst recht', () => {
    expect(istLeseprogramm('/de/x/Bibelleseprogramm-2026/')).toBe(true)
  })

  it('eine Wochenseite ist keine', () => {
    expect(istLeseprogramm('/de/bibliothek/jw-arbeitsheft/x-mwb/Zusammenkunft-6-12-April-2026/')).toBe(false)
  })

  it('eine kaputte Prozent-Folge wirft nicht', () => {
    expect(() => istLeseprogramm('/de/%E0%A4%A/Bibelleseprogramm-2026/')).not.toThrow()
    expect(istLeseprogramm('/de/%E0%A4%A/Bibelleseprogramm-2026/')).toBe(true)
  })
})

describe('leseprogrammJahr', () => {
  it('liest die Jahreszahl am Ende des Pfads', () => {
    expect(leseprogrammJahr('/de/x/Bibelleseprogramm-Gedaechtnismahl-2026/')).toBe(2026)
    expect(leseprogrammJahr('/de/x/Bibelleseprogramm-Gedaechtnismahl-2026')).toBe(2026)
  })

  it('ohne Jahreszahl: null statt Rateversuch', () => {
    expect(leseprogrammJahr('/de/x/Bibelleseprogramm/')).toBeNull()
  })
})

describe('montagDerWoche', () => {
  it('der Donnerstag gehört zum Montag davor', () => {
    expect(montagDerWoche('2026-04-02')).toBe('2026-03-30')
  })

  it('ein Montag bleibt er selbst', () => {
    expect(montagDerWoche('2026-03-30')).toBe('2026-03-30')
  })

  it('und ein Sonntag gehört zur Woche davor', () => {
    // Die Falle: der Sonntag ist der **letzte** Tag der Programmwoche, nicht
    // der erste. jw.org legt das so fest — siehe T66.
    expect(montagDerWoche('2026-04-05')).toBe('2026-03-30')
    expect(montagDerWoche('2024-03-24')).toBe('2024-03-18')
  })

  it('ohne Datum bleibt es leer', () => {
    expect(montagDerWoche('kein Datum')).toBe('')
  })
})

describe('wochenSpanne: der Kopf in der Form, die jw.org selbst schreibt', () => {
  it('innerhalb eines Monats zusammengezogen', () => {
    expect(wochenSpanne('2026-03-23')).toBe('23.–29. März')
  })

  it('über den Monatswechsel beide Monate ausgeschrieben', () => {
    // Genau die Form, die der Übersetzer bis T65 nicht kannte.
    expect(wochenSpanne('2026-03-30')).toBe('30. März–5. April')
    expect(wochenSpanne('2026-04-27')).toBe('27. April–3. Mai')
  })

  it('auch über den Jahreswechsel', () => {
    expect(wochenSpanne('2026-12-28')).toBe('28. Dezember–3. Januar')
  })

  it('ohne Datum bleibt es leer', () => {
    expect(wochenSpanne('')).toBe('')
  })
})

describe('gedaechtnismahlWoche: die Woche ohne Seite', () => {
  const w = gedaechtnismahlWoche('2026-03-30', '2026-04-02')

  it('trägt ihre Kennung und den Anlass samt Datum', () => {
    expect(w.start).toBe('2026-03-30')
    expect(w.anlass).toEqual({ art: 'mem', von: '2026-04-02' })
    expect(w.mem).toBe(true)
  })

  it('das Wochenende bekommt die übliche Vorlage — es findet statt', () => {
    expect(w.we.sections.map((s) => s.label)).toEqual([
      'ERÖFFNUNG',
      'ÖFFENTLICHER VORTRAG',
      'WACHTTURM-STUDIUM',
      'ABSCHLUSS',
    ])
  })

  /*
    Die Zusammenkunft unter der Woche bleibt **leer** — nicht als Notbehelf:
    Der Herausgeber druckt für diese Woche kein Programm. Gestrichen wird sie
    nicht hier, sondern im Client aus dem Datum (`setAnlassTermin`). Die Regel
    steht damit an einer Stelle statt in zweien.
  */
  it('die Zusammenkunft unter der Woche bleibt leer und ungestrichen', () => {
    expect(w.mid.sections).toEqual([])
    expect('dev' in w).toBe(false)
  })

  it('kein erfundenes Bibellese-Kapitel', () => {
    expect(w.book).toBe('')
  })

  it('und ein Kopf, den die App übersetzen kann', () => {
    expect(w.range).toBe('30. März–5. April')
    expect(w.mid.date).toBe('30. März–5. April')
  })
})
