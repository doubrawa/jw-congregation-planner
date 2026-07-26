/*
 * In die Zwischenablage kopieren — robust. navigator.clipboard scheitert je
 * nach Browser still (fehlender Fokus, Berechtigung, kein sicherer Kontext);
 * dann greift der klassische execCommand('copy')-Weg über ein unsichtbares
 * Textfeld. Liefert true bei Erfolg.
 */
export async function copyText(text: string): Promise<boolean> {
  // 1. Moderne API (nur im sicheren Kontext verfügbar).
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // weiter zum Fallback
    }
  }
  // 2. Fallback: verstecktes Textfeld markieren und kopieren.
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
