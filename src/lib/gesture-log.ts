/*
 * Kleines Protokoll der Wisch-Geste — ausschließlich für die Fehlersuche auf
 * einem echten Gerät.
 *
 * Hintergrund: Gesten lassen sich am Rechner nur nachbilden, nie nachstellen.
 * Chrome mit Handy-Emulation, iPad und Android-Handy verhalten sich beim
 * Zusammenspiel von Scrollen und Zeigerereignissen unterschiedlich — was hier
 * funktioniert, kann dort abbrechen. Ohne Protokoll bleibt nur Raten.
 *
 * Bewusst sehr klein gehalten: ein Ringpuffer aus wenigen Einträgen, gefüllt
 * an den Weggabelungen der Geste (nicht bei jeder Bewegung). Das kostet
 * praktisch nichts und darf deshalb immer mitlaufen; sichtbar wird es nur,
 * wenn man es im Profil ausdrücklich aufruft.
 */

export interface Eintrag {
  /** Millisekunden seit Beginn der laufenden Geste. */
  t: number
  was: string
  daten?: Record<string, unknown>
}

const MAX = 40
const puffer: Eintrag[] = []
let beginn = 0

/** Einen Punkt im Ablauf festhalten. `start` setzt die Zeitrechnung neu. */
export function gestenLog(was: string, daten?: Record<string, unknown>): void {
  const jetzt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (was === 'start') beginn = jetzt
  puffer.push({ t: Math.round(jetzt - beginn), was, daten })
  while (puffer.length > MAX) puffer.shift()
}

export function gestenEintraege(): readonly Eintrag[] {
  return puffer
}

export function gestenLoeschen(): void {
  puffer.length = 0
}

/**
 * Umgebung des Geräts — die Hälfte der Fragen beantwortet sich damit selbst.
 *
 * Defensiv: Ein Werkzeug für die Fehlersuche darf nicht selbst abstürzen, nur
 * weil eine Browser-Fähigkeit fehlt. Dann steht eben weniger drin.
 */
function umgebung(): string[] {
  if (typeof window === 'undefined') return []
  let standalone = false
  try {
    standalone =
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as { standalone?: boolean }).standalone === true
  } catch {
    /* egal — dann eben unbekannt */
  }
  return [
    `Fenster   ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
    `Spalte    ${Math.round(document.querySelector('.app-main')?.getBoundingClientRect().width ?? 0)}`,
    `Modus     ${standalone ? 'installiert' : 'Browser-Tab'}`,
    `Touch     ${navigator.maxTouchPoints} Punkte`,
    `Gerät     ${navigator.userAgent}`,
  ]
}

/** Alles als Text — zum Kopieren und Weitergeben. */
export function gestenProtokollText(): string {
  // „Bewegungen", nicht „Geste": der Ringpuffer hält bewusst mehrere
  // Versuche vor — beim Suchen will man den Vergleich sehen.
  const zeilen = [`Build ${__BUILD_ID__}`, ...umgebung(), '', 'Letzte Bewegungen:']
  if (puffer.length === 0) {
    zeilen.push('  (noch nichts aufgezeichnet — einmal wischen)')
  }
  for (const e of puffer) {
    const d = e.daten ? ' ' + JSON.stringify(e.daten) : ''
    zeilen.push(`  ${String(e.t).padStart(5)}ms  ${e.was}${d}`)
  }
  return zeilen.join('\n')
}
