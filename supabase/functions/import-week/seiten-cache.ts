/**
 * **Kurzer Speicher für geholte Seiten** — ein Abruf je Seite, auch wenn
 * mehrere Planer kurz nacheinander dieselbe Woche holen.
 *
 * Begrenzt in Zeit **und** Menge: Eine Edge-Instanz lebt Stunden, und jede
 * Sprache, jede Woche, jedes Heft ist eine eigene Adresse. Ohne Grenze wüchse
 * der Speicher mit jeder geholten Seite, und Abgelaufenes bliebe liegen, bis
 * dieselbe Adresse wiederkommt — oft nie. Behalten werden die zuletzt
 * gebrauchten.
 */
export function seitenCache({ max, ttlMs, jetzt = Date.now }: { max: number; ttlMs: number; jetzt?: () => number }) {
  // Die Map hält die Reihenfolge: Vorne steht, was am längsten keiner brauchte.
  const seiten = new Map<string, { at: number; text: string }>()
  return {
    /** Die Seite, wenn sie noch frisch ist — sonst `null`. */
    holen(url: string): string | null {
      const treffer = seiten.get(url)
      if (!treffer) return null
      seiten.delete(url)
      if (jetzt() - treffer.at >= ttlMs) return null
      seiten.set(url, treffer)
      return treffer.text
    },
    merken(url: string, text: string): void {
      seiten.delete(url)
      seiten.set(url, { at: jetzt(), text })
      for (const alt of seiten.keys()) {
        if (seiten.size <= max) break
        seiten.delete(alt)
      }
    },
    /** Wie viele Seiten gerade im Speicher stehen. */
    get groesse(): number {
      return seiten.size
    },
  }
}
