/**
 * **Auf den Verlauf warten** — für Proben mit dem echten `history` von jsdom
 * (`useBackDismiss`): Das `popstate` kommt dort wie im Browser erst nach
 * `history.back()`, in einer eigenen Aufgabe.
 */

/**
 * `ausloesen()` anstoßen und auf das daraus folgende `popstate` warten. Ohne
 * feste Frist: Unter Last käme das Ereignis später als jede Frist, und eine
 * Probe, die an der Uhr hängt, fiele um oder bestünde, ohne etwas zu prüfen.
 */
export function beiRueckschritt(ausloesen: () => void): Promise<void> {
  return new Promise<void>((fertig) => {
    window.addEventListener('popstate', () => fertig(), { once: true })
    ausloesen()
  })
}

/** Ein paar Durchläufe weiter: Effekte, eigenes Aufräumen und dessen `popstate` sind dann durch. */
export async function ausklingen(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise<void>((fertig) => setTimeout(fertig, 0))
}
