/**
 * **Die Symbole im Manifest tragen eine Kennung ihres Inhalts**
 * (`icon-192.png?v=1a2b3c4d`).
 *
 * Chrome lädt ein App-Symbol nur neu, wenn sich seine Adresse im Manifest
 * ändert: Steht im Feld `icons` dasselbe wie beim letzten Mal, gilt das Symbol
 * als unverändert, was auch immer unter der Adresse liegt. Ein neu gezeichnetes
 * Symbol unter altem Namen käme deshalb auf keinem Gerät an, auf dem die App
 * schon installiert ist. Die Kennung hängt am Inhalt der Datei — ändert er
 * sich, ändert sich die Adresse, sonst nicht.
 *
 * Die Dateien selbst behalten ihre Namen: `index.html`, der Service Worker und
 * die Push-Meldung nennen sie ohne Kennung. `npm run icons` führt das Manifest
 * nach (`make-icons.mjs`), `symbol-kennung.test.ts` hält beides zusammen.
 */
import { createHash } from 'node:crypto'

/**
 * Die Kennung einer Datei: der Anfang ihres SHA-256.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function symbolKennung(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8)
}

/** Eine Symbol-Adresse im Manifest, mit oder ohne Kennung. Nur Symbole tragen dort `src`. */
const ADRESSE = /("src":\s*")([^"?]+)(?:\?v=[0-9a-f]*)?(")/g

/**
 * Das Manifest mit der Kennung jeder Symbol-Datei. Ersetzt wird nur die
 * Adresse; die Datei bleibt sonst Zeichen für Zeichen, wie sie ist.
 *
 * @param {string} manifestText
 * @param {(datei: string) => Uint8Array} lesen der Inhalt einer Datei aus `public/`
 * @returns {string}
 */
export function manifestMitKennungen(manifestText, lesen) {
  return manifestText.replace(
    ADRESSE,
    (_, /** @type {string} */ vor, /** @type {string} */ datei, /** @type {string} */ nach) =>
      `${vor}${datei}?v=${symbolKennung(lesen(datei))}${nach}`,
  )
}
