import { describe, expect, it, vi } from 'vitest'
import { umstellungSchreiben } from './data'

/**
 * **Die Umstellung ist fertig, bevor der Ladevorgang zurückkommt.**
 *
 * Beim Laden trägt `migrateItemIds` den Programmpunkten ihre stabilen
 * Kennungen nach und benennt die Bestätigungen mit um (T37). Zwei Schritte, in
 * bindender Reihenfolge: erst die Bestätigungen umbenennen, dann die Wochen mit
 * den neuen Kennungen speichern.
 *
 * Bis hierher lief das **neben** dem Ladevorgang her:
 *
 *     void renameConfirmationKeys(…).then(speichereUmgestellte)
 *
 * Der Ladevorgang kam sofort zurück, die App hydrierte, der Planer arbeitete —
 * und irgendwann danach schrieb `speichereUmgestellte` die Wochen mit dem Stand
 * vom **Ladezeitpunkt**. Was inzwischen geändert war, war weg. Die
 * Vergleiche-und-Tausche-Sperre (T39) half nicht: Sie vergleicht gegen den
 * zuletzt selbst geschriebenen Stand, und den hatte die eigene Änderung gerade
 * gehoben.
 *
 * **Und das ist keine Altlast.** Eine frisch importierte Woche trägt keine
 * Kennungen — `parse.ts` vergibt keine —, ihre Bestätigungen hängen also an der
 * Position. Wer eine Woche importiert, zuteilt, den Plan schickt und Zusagen
 * bekommt, geht beim nächsten Laden genau diesen Weg.
 */
describe('Kennungs-Umstellung beim Laden', () => {
  it('speichert die Wochen erst, wenn die Bestätigungen umbenannt sind', async () => {
    const reihenfolge: string[] = []
    let freigeben = (): void => {}
    const umbenennen = () =>
      new Promise<void>((auf) => {
        reihenfolge.push('umbenennen begonnen')
        freigeben = () => {
          reihenfolge.push('umbenennen fertig')
          auf()
        }
      })
    const speichern = () => reihenfolge.push('wochen gespeichert')

    const lauf = umstellungSchreiben(umbenennen, true, speichern)
    /*
      Der entscheidende Moment: Das Umbenennen läuft noch — und der Aufrufer
      **wartet**. Nur das unterscheidet die beiden Wege: Ob die Wochen vor oder
      nach dem Umbenennen geschrieben werden, sieht man auch beim alten
      `void rename().then(speichern)` richtig herum. Falsch war dort, dass der
      Ladevorgang längst zurückgekommen war und die App weiterlief.
    */
    expect(reihenfolge).toEqual(['umbenennen begonnen'])
    let zurueck = false
    void lauf.then(() => {
      zurueck = true
    })
    // Ein Makrotask später sind alle Mikrotasks durch: Wäre der Ladevorgang
    // schon zurückgekommen, stünde das Zeichen jetzt.
    await new Promise((weiter) => setTimeout(weiter, 0))
    expect(zurueck, 'der Ladevorgang kam zurück, während die Umstellung noch lief').toBe(false)

    freigeben()
    await lauf
    expect(reihenfolge).toEqual([
      'umbenennen begonnen',
      'umbenennen fertig',
      'wochen gespeichert',
    ])
  })

  it('ohne Umbenennungen wird trotzdem gespeichert — und nichts umbenannt', () => {
    // Der Normalfall: Die Wochen tragen ihre Kennungen längst, es gibt nichts
    // zu verschieben. Dann darf der Ladevorgang nicht auf eine Zusage warten,
    // die niemand gegeben hat.
    const umbenennen = vi.fn(() => Promise.resolve())
    const speichern = vi.fn()
    void umstellungSchreiben(umbenennen, false, speichern)
    expect(umbenennen).not.toHaveBeenCalled()
    expect(speichern).toHaveBeenCalledTimes(1)
  })

  it('bricht das Umbenennen ab, bleiben die Wochen ungespeichert', async () => {
    /*
      Die Reihenfolge ist bindend, und das ist ihr Grund: Ohne Kennung versucht
      es der nächste Ladevorgang erneut. Speicherte man die Wochen trotzdem,
      wäre die Bestätigung verwaist — der Platz trüge eine Kennung, die
      Bestätigung noch die Position, und der Leiter stünde wieder als
      unbestätigt da.
    */
    const speichern = vi.fn()
    await expect(
      umstellungSchreiben(() => Promise.reject(new Error('Netz weg')), true, speichern),
    ).rejects.toThrow('Netz weg')
    expect(speichern).not.toHaveBeenCalled()
  })
})
