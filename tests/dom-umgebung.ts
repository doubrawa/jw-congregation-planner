/**
 * **Die DOM-Umgebung der Proben: happy-dom — und wo die App nachfragt, wie
 * jsdom** (31.10.2026).
 *
 * Bis zum 31.10.2026 liefen die Bildschirm-Proben unter jsdom. Dessen Aufbau
 * kostete je Datei gut doppelt so lange wie der von happy-dom (0,7 gegen
 * 1,35 s), über die Suite die Hälfte der Umgebungszeit. Geschrieben sind die
 * Proben aber an jsdoms Umfang: Was jsdom fehlt, fehlt der App in der Probe,
 * und sie nimmt ihren Ersatzweg. Wo happy-dom anders antwortet und die App
 * danach fragt, gleicht diese Datei an —
 *
 * - **`matchMedia`** gibt es dort, beantwortet für ein Fenster von 1024 px:
 *   `useMedia(TABLET_BREITE)` wäre erfüllt, und jede Probe ohne eigene
 *   Attrappe sähe statt der Handy- die Tablet-Fassung. Fehlt hier wie in jsdom.
 * - **`navigator.clipboard`** ebenso: `copyText` käme über den zweiten Weg zum
 *   Erfolg, wo die Probe den ersten meint.
 * - **Ungesetzte Längen** rechnet happy-dom zu `''` statt `0px`; der Druckbogen
 *   (`Bogen`) las daraus NaN und setzte jeden Block auf ein eigenes Blatt.
 *
 * Grün bliebe dabei fast alles, nur prüfte es still etwas anderes. Wer eine
 * dieser Schnittstellen braucht, setzt seine Attrappe ein — wie bisher.
 *
 * **Zwei Unterschiede bleiben, mit Absicht:**
 *
 * - `offsetParent` kennt happy-dom nicht (jsdom: immer `null`). `useDialogFocus`
 *   hält deshalb jedes Element für sichtbar und setzt den Fokus wie ein Browser
 *   auf das erste Bedienelement — unter jsdom stand er stets auf dem Blatt.
 * - **Der Verlauf:** happy-dom feuert `popstate` noch im Aufruf von
 *   `history.back()`, der Browser und jsdom erst in einer späteren Aufgabe.
 *   Die Buchführung in `useBackDismiss` für einen Rückschritt, der noch
 *   unterwegs ist, ließe sich so nicht prüfen (gemessen: zwei Sabotagen blieben
 *   grün). Die Proben, die den echten Verlauf zurückgehen, laufen deshalb
 *   weiter unter jsdom (`zurueck-am-handy`, `-ohne-geste`, `-stapel`,
 *   `-zaehler`), ebenso der Datumswähler: happy-dom gibt den Klick einer
 *   `<label>` an ihr Feld weiter, bevor Reacts `preventDefault` ankommt.
 *
 * Gemessen am 31.10.2026: Die ganze Suite einmal unter jsdom, einmal unter
 * happy-dom, bei jedem `cleanup()` ein Abbild von `document.body` — von 2919
 * Abbildern unterschieden sich außer Fokus und Verlauf 27, alle erklärt (der
 * Datumswähler, Bildlagen des Films aus der Uhr, Kennung des Geräts, das
 * Polster oben).
 *
 * Kommentare in den Proben, die „jsdom" nennen, meinen die Proben-Umgebung.
 * Wo die App fragt, ob es eine Schnittstelle gibt, antwortet happy-dom nach
 * dieser Datei wie jsdom; was es darüber hinaus kennt (`scrollIntoView`,
 * `TouchEvent`), ersetzen die Proben ohnehin durch ihre Attrappen.
 * In Node (kein `window`) und unter jsdom geschieht hier nichts.
 */
if (typeof window !== 'undefined' && 'happyDOM' in window) {
  Reflect.deleteProperty(globalThis, 'matchMedia')
  // Am Prototyp, nicht an `navigator` selbst: Proben setzen ihre Attrappe als
  // eigene Eigenschaft und löschen sie danach wieder (`clipboard.test.ts`).
  Object.defineProperty(Object.getPrototypeOf(navigator) as object, 'clipboard', { configurable: true, get: () => undefined })
  const stil = document.createElement('style')
  stil.textContent = '* { padding: 0 }'
  document.head.append(stil)
}
