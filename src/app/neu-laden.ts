import { schreibenAbwarten } from '../lib/schreiben-unterwegs'
import { ausstehendesSchreiben } from './persist'

/**
 * **Neu laden, ohne etwas zu verlieren** — für eine neue Fassung der App
 * (`watchForUpdates`) und einen Anmelde-Link in der schon offenen App. Was
 * gebündelt wartet (`persist.ts`), geht vorher hinaus, und was unterwegs ist,
 * kommt an: Das Neuladen bräche beides ab, und die Änderung wäre fort.
 */
export async function neuLaden(): Promise<void> {
  ausstehendesSchreiben()
  await schreibenAbwarten()
  location.reload()
}
