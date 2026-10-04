/**
 * Das Logo aus `public/` — über `BASE_URL`, damit es auch unter dem
 * GitHub-Pages-Unterpfad lädt.
 *
 * Einmal hier statt je Bildschirm eine Kopie: Drei Stellen trugen dieselbe
 * Zeile, und die vierte (die Passwort-Ansicht) hatte statt des Logos noch eine
 * „JW"-Zeile ohne Gestaltung stehen — übrig aus dem Prototyp.
 */
export const LOGO = `${import.meta.env.BASE_URL}logo.svg`

/**
 * Das Logo für kleine Größen — Kopfzeile am Handy und Seitenleiste (dazu das
 * Favicon in `index.html`). Weniger, kräftigere Plätze (3-5-7 statt 4-6-8),
 * die klein nicht zu Streifen verschwimmen (Betreiber, 4.10.2026).
 */
export const LOGO_KLEIN = `${import.meta.env.BASE_URL}logo-klein.svg`
