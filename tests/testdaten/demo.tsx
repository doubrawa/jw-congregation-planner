/**
 * Einstieg der Entwicklerseite (`/demo.html`, nur im Dev-Server).
 *
 * **Zuerst die Uhr, dann alles andere** — und das andere deshalb nachgeladen,
 * nicht oben importiert: Statische Importe liefen vor der ersten Zeile hier.
 * Die Testdaten legen aber schon beim Laden fest, wann ihre Mitteilungen kamen
 * („vor 2 Stunden"), und das gehört zur gestellten Uhr (`uhr.ts`), nicht zur
 * echten.
 */
import { ENTWICKLER_HEUTE, uhrStellen } from './uhr'

uhrStellen(ENTWICKLER_HEUTE)
await import('./demo-seite')
