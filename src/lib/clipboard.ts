/*
 * In die Zwischenablage kopieren — robust über verschiedene Kontexte.
 *
 * Reihenfolge bewusst: der klassische execCommand('copy')-Weg ZUERST. Er läuft
 * synchron innerhalb der Nutzergeste und funktioniert auch dort, wo die moderne
 * navigator.clipboard-API mit „NotAllowedError: Document is not focused"
 * abbricht (In-App-Browser aus WhatsApp/Mail, installierte PWA, fehlender
 * Fensterfokus). Die async API kommt nur als Fallback — würde man sie zuerst
 * `await`en und sie schlägt fehl, liefe der execCommand-Weg außerhalb der Geste
 * und würde ebenfalls scheitern (genau der frühere Bug). Liefert true bei Erfolg.
 */
export async function copyText(text: string): Promise<boolean> {
  if (legacyCopy(text)) return true
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // beide Wege gescheitert
  }
  return false
}

/**
 * Verstecktes Textfeld markieren und per execCommand kopieren (synchron).
 *
 * Das Aufräumen steht in `finally`: Wirft `execCommand` — in älteren Browsern
 * und unter strengen Berechtigungen tut es das, statt `false` zu liefern —,
 * bliebe das Feld sonst im Dokument stehen. Unsichtbar, aber bei jedem
 * Versuch eines mehr.
 */
function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea')
  try {
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    ta.remove()
  }
}
