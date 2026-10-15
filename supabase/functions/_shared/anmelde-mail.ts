// =============================================================================
// Geteilt: die E-Mail mit dem Anmelde-Link zusammensetzen und verschicken
// =============================================================================
// Zwei Functions schicken sie — `send-invite` (der Admin stellt einen Link aus)
// und `anmelden` (Selbstbedienung, „Link senden" auf der Anmeldeseite). Beide
// sollen dieselbe E-Mail schicken, mit demselben Datum in derselben Form.
// =============================================================================

import { linkMailTexte } from './anmelde-texte.ts'
import { LOCALE_JE_CODE } from './i18n/locales.ts'
import { fuellen } from './texte.ts'

/** Was in die E-Mail eingesetzt wird. */
export interface LinkMailWerte {
  /** Vorname der Person. */
  name: string
  /** Name der Versammlung (`congregations.name`). */
  versammlung: string
  /** Der Anmelde-Link (`anmeldeUrl`). */
  url: string
  /**
   * Der Code zum Eintippen, wie auf dem Zettel (`codeAnzeige`). Auf dem iPhone
   * öffnet der Link Safari, nie die App vom Home-Bildschirm mit ihrem eigenen
   * Speicher — dort meldet nur der Code an (T121, Phase 10).
   */
  code: string
  /** Bis wann er gilt, als ISO-Zeitpunkt (`anmelde_links.gueltig_bis`). */
  gueltigBis: string
}

/**
 * Der letzte Tag, an dem der Link gilt, in der Sprache der E-Mail („14.
 * November"). Ohne Jahr: Er liegt höchstens dreißig Tage voraus. Kennt `Intl`
 * die Sprache nicht, steht er deutsch da — ein Datum in einer Sprache, die
 * niemand gewählt hat, wäre schlechter.
 */
export function linkDatum(gueltigBis: string, lang: string | null | undefined): string {
  const tag = new Date(gueltigBis)
  const optionen: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: 'UTC' }
  try {
    return new Intl.DateTimeFormat(LOCALE_JE_CODE[lang ?? ''] ?? 'de-DE', optionen).format(tag)
  } catch {
    return new Intl.DateTimeFormat('de-DE', optionen).format(tag)
  }
}

/** Betreff und Text der E-Mail in der Sprache der Versammlung. */
export function linkMail(lang: string | null | undefined, werte: LinkMailWerte): { betreff: string; text: string } {
  const texte = linkMailTexte(lang)
  const einsetzen = {
    name: werte.name,
    versammlung: werte.versammlung,
    url: werte.url,
    code: werte.code,
    datum: linkDatum(werte.gueltigBis, lang),
  }
  return { betreff: fuellen(texte.betreff, einsetzen), text: `${fuellen(texte.text, einsetzen)}\n` }
}

/** Zugang zum Versand: Resend mit verifizierter Absender-Domain. Fehlt eins davon, kann nichts hinaus. */
export interface MailZugang {
  apiKey: string
  /** Absender, z. B. „Versammlung.app <anmelden@versammlung.app>" (Secret `INVITE_FROM`). */
  von: string
}

/** Kann überhaupt versandt werden? Ohne `INVITE_FROM` nicht — dann bleibt der eigene Mail-Programm-Weg. */
export function mailBereit(zugang: Partial<MailZugang>): zugang is MailZugang {
  return Boolean(zugang.apiKey && zugang.von)
}

/** Eine E-Mail über Resend verschicken. `true`, wenn Resend sie angenommen hat. */
export async function mailSenden(zugang: MailZugang, an: string, mail: { betreff: string; text: string }): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${zugang.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: zugang.von, to: an, subject: mail.betreff, text: mail.text }),
  })
  if (!res.ok) console.error(`Resend ${res.status}: ${await res.text()}`)
  return res.ok
}
