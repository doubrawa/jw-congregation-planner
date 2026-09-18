import { describe, expect, it } from 'vitest'
import { fehlendeAngaben, PFLICHT, schritte } from './neuaufbau-fahren.mjs'

/**
 * **Die Reihenfolge ist der Zweck dieses Skripts.**
 *
 * Die sechs Schritte gibt es einzeln, und genau daran ist der Neuaufbau am
 * 18. September 2026 gescheitert: Die Abwesenheiten blieben liegen, weil die
 * Liste im README unvollständig war. Gemessen wird deshalb die Liste selbst —
 * ohne irgendetwas zu starten.
 *
 * Zwei Reihenfolgen sind keine Geschmacksfrage, sondern Datenverlust:
 * `versammlung-zuruecksetzen.mjs` leert `weeks` mit, muss also **vor** dem
 * Wochen-Import laufen; die Wochenplanung trägt Namen in Wochen ein und
 * braucht deshalb beide.
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
})

describe('schritte', () => {
  it('fährt alle sechs in der Reihenfolge, die die Daten verlangen', () => {
    expect(namen(vollstaendig)).toEqual([
      'versammlung-anlegen.mjs',
      'versammlung-zuruecksetzen.mjs',
      'wochen-importieren.mjs',
      'wochenplanung-importieren.mjs',
      'abwesenheiten-importieren.mjs',
      'treffpunkte-importieren.mjs',
    ])
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

  it('setzt mit --ab-schritt fort, ohne die vorigen zu wiederholen', () => {
    // Nach einem Abbruch: Schritt 1 legte sonst eine zweite Versammlung an.
    const liste = schritte({ ...vollstaendig, 'ab-schritt': '3' })
    expect(liste.map((s) => s.nr)).toEqual([3, 4, 5, 6])
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

  it('setzt Zusammenkunftszeiten nur als Rückfall, nicht über die Angabe', () => {
    expect(schritte(vollstaendig)[0].argv).toContain('2 19:00')
    const eigen = schritte({ ...vollstaendig, mid: '5 19:00', we: '0 10:00' })[0]
    expect(eigen.argv).toContain('5 19:00')
    expect(eigen.argv).not.toContain('2 19:00')
  })
})
