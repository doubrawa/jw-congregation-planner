import { describe, expect, it } from 'vitest'
import { congMitSchrittEins, fehlendeAngaben, PFLICHT, schritte } from './neuaufbau-fahren.mjs'

/**
 * **Die Reihenfolge ist der Zweck dieses Skripts.**
 *
 * Die sechs Schritte gibt es einzeln, und genau daran ist der Neuaufbau am
 * 18. September 2026 gescheitert: Die Abwesenheiten blieben liegen, weil die
 * Liste im README unvollständig war. Gemessen wird deshalb die Liste selbst —
 * ohne irgendetwas zu starten.
 *
 * Drei Reihenfolgen sind keine Geschmacksfrage, sondern Datenverlust oder ein
 * falscher Plan: `versammlung-zuruecksetzen.mjs` leert `weeks` mit, muss also
 * **vor** dem Wochen-Import laufen; die Wochenplanung trägt Namen in Wochen
 * ein und braucht deshalb beide; und die Abwesenheiten kommen vor die Wochen,
 * weil mit jeder Woche der feste Leiter des Wachtturm-Studiums hineinkommt —
 * nur dort, wo er da ist (18.10.2026).
 */

const vollstaendig = {
  name: 'Musterstadt',
  vorname: 'Anna',
  nachname: 'Beispiel',
  sql: 'C:/daten/personen.sql',
}

const namen = (arg: Record<string, unknown>) => schritte(arg).map((s) => s.skript)

describe('fehlendeAngaben', () => {
  it('nennt jede fehlende Pflichtangabe', () => {
    expect(fehlendeAngaben({ name: 'Musterstadt' })).toEqual(['vorname', 'nachname', 'sql'])
  })

  it('ist zufrieden, wenn alle dastehen', () => {
    expect(fehlendeAngaben(vollstaendig)).toEqual([])
  })

  it('lässt leere Zeichenketten und Flaggen nicht als Angabe durchgehen', () => {
    // `--name` ohne Wert wird von `argumente()` zu `true`.
    expect(fehlendeAngaben({ ...vollstaendig, name: '   ' })).toEqual(['name'])
    expect(fehlendeAngaben({ ...vollstaendig, sql: true })).toEqual(['sql'])
  })

  it('kennt genau vier Pflichtangaben', () => {
    expect(PFLICHT).toEqual(['name', 'vorname', 'nachname', 'sql'])
  })

  it('verlangt beim Fortsetzen nur, was die übrigen Schritte brauchen (16.10.2026)', () => {
    // Name, Vor- und Nachname braucht nur Schritt 1 (die Versammlung anlegen).
    expect(fehlendeAngaben({ 'ab-schritt': '2' })).toEqual(['sql'])
    expect(fehlendeAngaben({ 'ab-schritt': '2', sql: 'C:/daten/personen.sql' })).toEqual([])
    expect(fehlendeAngaben({ 'ab-schritt': '3' })).toEqual([])
  })
})

describe('schritte', () => {
  it('fährt alle sechs in der Reihenfolge, die die Daten verlangen', () => {
    expect(namen(vollstaendig)).toEqual([
      'versammlung-anlegen.mjs',
      'versammlung-zuruecksetzen.mjs',
      'abwesenheiten-importieren.mjs',
      'wochen-importieren.mjs',
      'wochenplanung-importieren.mjs',
      'treffpunkte-importieren.mjs',
    ])
  })

  it('holt die Abwesenheiten vor den Wochen — sonst leitete der Verreiste das Wachtturm-Studium', () => {
    // Beim Holen (`neueWocheEinordnen`) und beim Wochenplan-Import kommt der
    // feste Studienleiter in die Woche, und nur die Abwesenheiten sagen, wann
    // sein Vertreter dran ist. Erst danach geholt, gälte er überall als da.
    const liste = namen(vollstaendig)
    const abwesenheiten = liste.indexOf('abwesenheiten-importieren.mjs')
    expect(abwesenheiten).toBeGreaterThan(liste.indexOf('versammlung-zuruecksetzen.mjs'))
    expect(abwesenheiten).toBeLessThan(liste.indexOf('wochen-importieren.mjs'))
    expect(abwesenheiten).toBeLessThan(liste.indexOf('wochenplanung-importieren.mjs'))
  })

  it('holt die Wochen erst nach dem Zurücksetzen', () => {
    // Das Zurücksetzen leert `weeks` mit. Andersherum wäre der Wochen-Import
    // umsonst gelaufen — und niemand sähe es, weil beide Schritte melden,
    // dass sie fertig sind.
    const liste = namen(vollstaendig)
    expect(liste.indexOf('versammlung-zuruecksetzen.mjs')).toBeLessThan(liste.indexOf('wochen-importieren.mjs'))
  })

  it('trägt die Zuteilungen erst ein, wenn Personen und Wochen stehen', () => {
    const liste = namen(vollstaendig)
    const planung = liste.indexOf('wochenplanung-importieren.mjs')
    expect(planung).toBeGreaterThan(liste.indexOf('versammlung-zuruecksetzen.mjs'))
    expect(planung).toBeGreaterThan(liste.indexOf('wochen-importieren.mjs'))
  })

  it('vergisst die Abwesenheiten nicht', () => {
    // Der eine Schritt, der beim Neuaufbau tatsächlich liegenblieb: Ohne ihn
    // plant die App gegen einen leeren Kalender und teilt Verreiste ein.
    expect(namen(vollstaendig)).toContain('abwesenheiten-importieren.mjs')
  })

  it('reicht --trocken an jeden einzelnen Schritt weiter', () => {
    // Ein Schritt ohne den Schalter schriebe mitten im Trockenlauf.
    const liste = schritte({ ...vollstaendig, trocken: true })
    expect(liste.every((s) => s.argv.includes('--trocken'))).toBe(true)
  })

  it('holt acht Wochen, wenn nichts anderes verlangt ist', () => {
    const wochen = schritte(vollstaendig).find((s) => s.skript === 'wochen-importieren.mjs')
    expect(wochen?.argv).toEqual(['--anzahl', '8'])
    expect(wochen?.titel).toContain('8')
  })

  it('nimmt eine andere Wochenzahl an', () => {
    const wochen = schritte({ ...vollstaendig, wochen: '12' }).find((s) => s.skript === 'wochen-importieren.mjs')
    expect(wochen?.argv).toEqual(['--anzahl', '12'])
  })

  it('bringt mit --ab ein Jahr Geschichte mit: Wochen und Abwesenheiten ab dort (18.10.2026)', () => {
    // Schritt 2 leert `weeks` und `absences` — ohne die Angabe begänne die
    // Auswertung (T126) leer. Zuteilungen und Treffpunkte nehmen ohnehin jede
    // Woche bis ein Jahr zurück, die da ist; sie brauchen sie nicht.
    const liste = schritte({ ...vollstaendig, ab: '2025-10-13', wochen: '60' })
    const argv = (skript: string) => liste.find((s) => s.skript === skript)?.argv ?? []
    expect(argv('wochen-importieren.mjs')).toEqual(['--anzahl', '60', '--ab', '2025-10-13'])
    expect(argv('abwesenheiten-importieren.mjs')).toEqual(['--ab', '2025-10-13'])
    for (const s of liste.filter((s) => !['wochen-importieren.mjs', 'abwesenheiten-importieren.mjs'].includes(s.skript))) {
      expect(s.argv, s.skript).not.toContain('--ab')
    }
    expect(liste.find((s) => s.skript === 'wochen-importieren.mjs')?.titel).toContain('ab 2025-10-13')
  })

  it('ohne --ab bleibt es bei den Wochen ab der laufenden', () => {
    expect(schritte(vollstaendig).some((s) => s.argv.includes('--ab'))).toBe(false)
  })

  it('verwechselt --ab nicht mit --ab-schritt', () => {
    // Beide beginnen gleich; `argumente()` hält sie auseinander, die Kette auch.
    const liste = schritte({ ...vollstaendig, 'ab-schritt': '3' })
    expect(liste.some((s) => s.argv.includes('--ab'))).toBe(false)
  })

  it('setzt mit --ab-schritt fort, ohne die vorigen zu wiederholen', () => {
    // Nach einem Abbruch: Schritt 1 legte sonst eine zweite Versammlung an.
    const liste = schritte({ ...vollstaendig, 'ab-schritt': '4' })
    expect(liste.map((s) => s.nr)).toEqual([4, 5, 6])
    expect(liste[0].skript).toBe('wochen-importieren.mjs')
  })

  it('gibt die Sprache nur weiter, wenn eine genannt ist', () => {
    const ohne = schritte(vollstaendig)[0]
    expect(ohne.argv).not.toContain('--sprache')
    const mit = schritte({ ...vollstaendig, sprache: 'en' })[0]
    expect(mit.argv).toContain('--sprache')
    expect(mit.argv[mit.argv.indexOf('--sprache') + 1]).toBe('en')
  })

  it('übergibt die Personen-Datei unverändert an das Zurücksetzen', () => {
    const zurueck = schritte(vollstaendig).find((s) => s.skript === 'versammlung-zuruecksetzen.mjs')
    expect(zurueck?.argv).toEqual(['--sql', 'C:/daten/personen.sql'])
  })

  it('reicht --cong beim Fortsetzen an jeden Schritt weiter (16.10.2026)', () => {
    // Steht die Testversammlung neben der echten, weist jeder Schritt ohne
    // `--cong` mit „Mehrere Versammlungen" ab — bis hierher ließ sich die Wahl
    // nicht weiterreichen, und ein Fortsetzen ging gar nicht.
    const liste = schritte({ ...vollstaendig, 'ab-schritt': '2', cong: 'c-echt' })
    expect(liste.map((s) => s.nr)).toEqual([2, 3, 4, 5, 6])
    for (const s of liste) {
      expect(s.argv[s.argv.indexOf('--cong') + 1], s.skript).toBe('c-echt')
    }
    // Ohne die Angabe bleibt alles, wie es war.
    expect(schritte(vollstaendig).some((s) => s.argv.includes('--cong'))).toBe(false)
  })

  it('weist --cong mit Schritt 1 ab — der legt eine neue Versammlung an', () => {
    expect(congMitSchrittEins({ ...vollstaendig, cong: 'c-echt' })).toBe(true)
    expect(congMitSchrittEins({ ...vollstaendig, cong: 'c-echt', 'ab-schritt': '1' })).toBe(true)
    expect(congMitSchrittEins({ ...vollstaendig, cong: 'c-echt', 'ab-schritt': '2' })).toBe(false)
    expect(congMitSchrittEins(vollstaendig)).toBe(false)
  })

  it('setzt Zusammenkunftszeiten nur als Rückfall, nicht über die Angabe', () => {
    expect(schritte(vollstaendig)[0].argv).toContain('2 19:00')
    const eigen = schritte({ ...vollstaendig, mid: '5 19:00', we: '0 10:00' })[0]
    expect(eigen.argv).toContain('5 19:00')
    expect(eigen.argv).not.toContain('2 19:00')
  })
})
