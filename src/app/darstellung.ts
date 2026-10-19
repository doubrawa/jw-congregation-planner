/**
 * **Die Darstellung auf `<html>`** — welche Palette gilt (`data-theme`), dazu
 * die Farbe der Statusleiste der installierten App.
 *
 * „Automatisch" folgt dem Gerät, auch während die App offen ist: Schaltet das
 * Handy abends auf dunkel, schaltet die App mit. index.html setzt dieselbe
 * Palette schon vor dem ersten Paint; von da an übernimmt die App (store.tsx).
 */
import { farbModus } from '../data/constants'
import type { Theme } from '../data/types'

const GERAET_DUNKEL = '(prefers-color-scheme: dark)'

/**
 * Setzt die Palette und hält sie bei „auto" am Gerät. Zurück kommt das
 * Abmelden vom Gerät — für den Aufräumteil eines Effekts.
 */
export function darstellungSpiegeln(theme: Theme, doc: Document = document): () => void {
  const geraet = doc.defaultView?.matchMedia?.(GERAET_DUNKEL)
  const anwenden = () => {
    doc.documentElement.dataset.theme = farbModus(theme, geraet?.matches ?? false)
    statusleisteAnpassen(doc)
  }
  anwenden()
  // Ohne Ereignisse am Gerät (sehr alte Browser) bleibt es beim Stand von jetzt.
  if (theme !== 'auto' || !geraet?.addEventListener) return () => {}
  geraet.addEventListener('change', anwenden)
  return () => geraet.removeEventListener('change', anwenden)
}

/**
 * Die Statusleiste nimmt den Grund der Palette — aus dem CSS, keine zweite
 * Farbliste: `--statusleiste`, das ist der Grund, solange in der installierten
 * App das Startbild steht dessen Graphit (`tokens.css`). Ohne geladenes CSS
 * bleibt der Grund.
 */
function statusleisteAnpassen(doc: Document): void {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  const stil = doc.defaultView?.getComputedStyle(doc.documentElement)
  const farbe = stil?.getPropertyValue('--statusleiste').trim() || stil?.getPropertyValue('--grund').trim()
  if (meta && farbe) meta.content = farbe
}

/**
 * **Das Startbild steht — oder nicht mehr** (`Startbild.tsx`). Solange es
 * steht, trägt die Statusleiste in der installierten App sein Graphit, wie
 * schon das Bild von Android davor; danach den Grund der Darstellung.
 */
export function startbildMelden(steht: boolean, doc: Document = document): void {
  if (steht) doc.documentElement.dataset.startbild = ''
  else delete doc.documentElement.dataset.startbild
  statusleisteAnpassen(doc)
}
