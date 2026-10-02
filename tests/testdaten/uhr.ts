/**
 * **Die Uhr der Entwicklerseite** — sie geht ab Montag, 7. September 2026,
 * 9 Uhr.
 *
 * Die Testwochen liegen fest im September 2026 (7.9.–4.10.). Seit die App
 * keine Demo-Sonderfälle mehr kennt (2.10.2026), rechnet sie auch auf der
 * Entwicklerseite wie im Betrieb: Vergangene Aufgaben fallen aus „Meine
 * Aufgaben", Programm und Planen springen auf die nächste Zusammenkunft,
 * Fristen zählen gegen heute. Mit der echten Uhr wäre die Seite ab dem
 * 5. Oktober 2026 leer — und jedes Handbuchbild hinge vom Tag ab, an dem es
 * entstand.
 *
 * Gestellt wird nur der Anfang; von dort läuft die Zeit weiter, sonst stünden
 * Toasts und Zähler still.
 */
export const ENTWICKLER_HEUTE = new Date(2026, 8, 7, 9, 0)

/**
 * Stellt die Uhr der Seite: `Date.now()`, `new Date()` und `Date()` gehen ab
 * `heute`. Alles andere am Datum — rechnen, formatieren, `Date.UTC`,
 * `instanceof Date` — bleibt, wie es ist. Zurück kommt der Weg zur echten Uhr.
 */
export function uhrStellen(heute: Date): () => void {
  const Echt = globalThis.Date
  const versatz = heute.getTime() - Echt.now()
  const jetzt = (): number => Echt.now() + versatz
  globalThis.Date = new Proxy(Echt, {
    construct: (ziel, args, neu) => Reflect.construct(ziel, args.length === 0 ? [jetzt()] : args, neu),
    apply: () => new Echt(jetzt()).toString(),
    get: (ziel, schluessel, empfaenger) => (schluessel === 'now' ? jetzt : Reflect.get(ziel, schluessel, empfaenger)),
  })
  return () => {
    globalThis.Date = Echt
  }
}
