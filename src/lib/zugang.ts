/**
 * **Der eigene Zugang** — die Profil-Seite der Function `anmelden`: ein
 * Einmal-Code fürs nächste Gerät und „Zugang erneuern". Beides mit der Sitzung
 * des Kontos; die Function nimmt die Person allein aus ihr.
 *
 * **Ohne Datenbank** (Entwicklerseite, Tests) nachgestellt wie das Anmelden
 * (`anmelden.ts`): ein Code aus dem Zufall des Geräts, erneuert ist sofort.
 */

import { codeAnzeige, codeUrl, EINMAL_MINUTEN, einmalGueltigBis, neuerCode } from '../../supabase/functions/_shared/anmeldung.ts'
import { anmeldenRufen } from './anmelden'
import { supabase } from './supabase'

/** Ein Einmal-Code, wie das Profil ihn zeigt. */
export interface EinmalCode {
  /** Zum Eintippen, in zwei Gruppen: „K7RD 2QWM". */
  code: string
  /** Die Adresse im QR-Code — dieselbe Form wie auf dem Zettel (`#code=`). */
  zettelUrl: string
  /** Bis wann er gilt, als ISO-Zeitpunkt. */
  gueltigBis: string
}

/**
 * **Wie lange das Profil einen eben geholten Code zeigt**, in Millisekunden:
 * bis zu seiner Frist, nie länger als `EINMAL_MINUTEN`. Die Frist stammt von
 * der Uhr des Servers; geht die des Geräts so weit falsch, dass die Rechnung
 * nichts Sinnvolles ergibt (abgelaufen oder länger als möglich), gilt die volle
 * Dauer ab jetzt — sonst verschwände der Code, bevor jemand ihn liest.
 */
export function sichtbarMs(gueltigBis: string, jetzt: number): number {
  const hoechstens = EINMAL_MINUTEN * 60e3
  const rest = new Date(gueltigBis).getTime() - jetzt
  return rest > 0 && rest <= hoechstens ? rest : hoechstens
}

function istEinmalCode(daten: unknown): daten is EinmalCode {
  const d = daten as Partial<EinmalCode> | null
  return typeof d?.code === 'string' && typeof d.zettelUrl === 'string' && typeof d.gueltigBis === 'string'
}

/** Ein Einmal-Code fürs nächste Gerät — `null`, wenn es nicht ging. */
export async function einmalCodeHolen(): Promise<EinmalCode | null> {
  if (!supabase) {
    const code = neuerCode()
    return { code: codeAnzeige(code), zettelUrl: codeUrl(location.href, code), gueltigBis: einmalGueltigBis(Date.now()) }
  }
  const r = await anmeldenRufen({ aktion: 'einmalcode' })
  return r.ok && istEinmalCode(r.daten) ? r.daten : null
}

/** Link und Zettel sperren, die übrigen Geräte abmelden. `true`, wenn es ging. */
export async function zugangErneuern(): Promise<boolean> {
  return (await anmeldenRufen({ aktion: 'erneuern' })).ok
}
