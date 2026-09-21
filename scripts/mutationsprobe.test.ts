import { describe, expect, it } from 'vitest'
import { ankerFehler, KATALOG } from './mutationsprobe.mjs'

/**
 * **Zeigt der Katalog der Mutationsprobe noch dorthin, wo er hinzeigen soll?**
 *
 * Die Probe selbst (`npm run mutationsprobe`) kostet je Eintrag bis zu einen
 * vollen Testlauf und läuft deshalb nicht in der CI. Sie ist aber nur so viel
 * wert wie ihr Katalog: Findet ein `suchen` seine Stelle nicht mehr, bricht
 * sie ab — und zwar **bevor sie eine einzige Regel misst**.
 *
 * Genau das ist am 21. September 2026 aufgefallen (T112): 16 von 192 Einträgen
 * zeigten ins Leere, der älteste seit dem 5. September. Zweieinhalb Wochen
 * lang war keine der 192 Regeln gemessen worden, ohne dass irgendetwas rot
 * wurde. Die Umbauten, die die Stellen verschoben hatten, waren alle grün
 * durchgegangen — sie mussten es sein, denn der Katalog gehört zu keinem
 * Testlauf.
 *
 * Seither gehört er zu einem. Die Prüfung liest nur Dateien und mutiert
 * nichts; sie kostet Millisekunden und hält einen Umbau **am selben Tag** an,
 * statt beim nächsten Durchgang Wochen später.
 */
describe('Mutationsprobe: der Katalog zeigt auf vorhandene Stellen', () => {
  /**
   * **Innerhalb der Probe tritt diese Prüfung zurück.**
   *
   * Die Probe bricht je Eintrag absichtlich eine Stelle im Quelltext auf —
   * danach steht dessen `suchen` dort nicht mehr, und die Prüfung unten wäre
   * bei **jeder** Mutation der erste rote Test. Mit `--bail=1` bräche der Lauf
   * dort ab, und die Probe schriebe jeder Regel „bewacht" gut, ohne eine
   * einzige gemessen zu haben. Genau das ist am 21.9.2026 passiert: 14 von 14
   * angeblich bewacht, Wächter jedes Mal diese Datei hier.
   *
   * Ungeprüft bleibt dabei nichts: Die Probe selbst fährt dieselbe Prüfung
   * über den ganzen Katalog, bevor sie die erste Mutation setzt.
   */
  const imProbelauf = Boolean(process.env.MUTATIONSPROBE)

  it.skipIf(imProbelauf)('jeder Eintrag findet seine Stelle genau einmal', () => {
    // Lesbar statt als Objekt-Dump: Im roten Fall soll dastehen, welcher
    // Eintrag wohin zeigte — sonst sucht man es einzeln zusammen.
    const fehler = ankerFehler().map((f) => `${f.id}: ${f.treffer}× in ${f.datei}`)
    expect(
      fehler,
      'Der Katalog ist verrostet. Die Regel an ihrer neuen Stelle suchen und die ' +
        'Mutation so fassen, dass sie wieder denselben Fehler herstellt — oder den ' +
        'Eintrag mit Begründung streichen, wenn es die Regel nicht mehr gibt.',
    ).toEqual([])
  })

  it('keine Kennung kommt zweimal vor', () => {
    // Eine doppelte Kennung fiele im Bericht als „schon gemessen" durch: Der
    // zweite Eintrag stünde mit dem Ergebnis des ersten da.
    const alle: string[] = KATALOG.map((m) => m.id)
    expect(alle.filter((id, i) => alle.indexOf(id) !== i)).toEqual([])
  })
})
