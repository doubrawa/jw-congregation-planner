#!/usr/bin/env node
/**
 * **Die Texte der Anmelde-Mail für die Functions erzeugen** (T121, Phase 8 und 10).
 *
 * Schreibt `supabase/functions/_shared/anmelde-texte.ts` aus dem App-Wörterbuch
 * (`linkMailBetreff`, `linkMailText` in `src/i18n/de.ts` und den Overlays) —
 * dieselben Sätze, die der Admin aus seinem eigenen Mail-Programm schickt,
 * solange die App selbst keine senden kann. Die Functions laufen unter Deno und
 * lesen das Wörterbuch der App nicht; `_test/anmeldung.test.ts` hält beide
 * Fassungen Zeichen für Zeichen gleich.
 *
 *   node scripts/anmelde-texte-erzeugen.mjs
 *
 * Werte als JSON-Literale (doppelte Anführungszeichen; Zeilenumbruch,
 * geschütztes Leerzeichen, Binde- und Richtungszeichen als Escape), damit keine
 * unsichtbaren Zeichen roh in der Datei stehen. Danach die Functions
 * `send-invite` und `anmelden` ausrollen.
 */
import { writeFileSync } from 'node:fs'
import { alsSkript, appCodeBereit } from './gemeinsam.mjs'

const REPO = new URL('../', import.meta.url)

export async function main() {
  appCodeBereit()
  // ui.ts selbst braucht Vite (`import.meta.glob`) — die Overlays und DE gehen auch einzeln.
  const { DE } = await import(new URL('src/i18n/de.ts', REPO).href)
  const { APP_LANGS } = await import(new URL('src/i18n/langs.ts', REPO).href)
  const dict = async (code) => (code === 'de' ? DE : (await import(new URL(`src/i18n/overlays/${code}.ts`, REPO).href)).default)

  // Unsichtbare Zeichen gehen als Escape in die Datei, nicht roh: das
  // geschützte Leerzeichen (fr), das Bindezeichen (fa) und die Richtungszeichen.
  const BS = String.fromCharCode(92)
  const UNSICHTBAR = [0xa0, 0x200c, 0x200e, 0x200f]
  const lit = (s) =>
    UNSICHTBAR.reduce(
      (text, c) => text.split(String.fromCharCode(c)).join(`${BS}u${c.toString(16).padStart(4, '0')}`),
      JSON.stringify(s),
    )
  const zeilen = []
  for (const { code } of APP_LANGS) {
    if (code === 'de') continue
    const t = await dict(code)
    zeilen.push(`  ${code}: {\n    betreff: ${lit(t.linkMailBetreff)},\n    text: ${lit(t.linkMailText)},\n  },`)
  }
  const de = await dict('de')
  const inhalt = `// =============================================================================
// Geteilt: die E-Mail mit dem Anmelde-Link (T121, Phase 8)
// =============================================================================
// **Erzeugt, nicht erfunden** — von \`scripts/anmelde-texte-erzeugen.mjs\`, nicht
// von Hand ändern. Jeder Satz hier steht wörtlich so im App-Wörterbuch
// (\`linkMailBetreff\` / \`linkMailText\` in \`src/i18n/de.ts\` und den Overlays) —
// dieselbe E-Mail, die der Admin aus seinem eigenen Mail-Programm schickt,
// solange die App selbst keine senden kann. Ein Test hält beide Fassungen
// zusammen (\`_test/anmeldung.test.ts\`).
//
// Zwei Functions schicken sie: \`send-invite\` (der Admin stellt Links aus) und
// \`anmelden\` (Selbstbedienung auf der Anmeldeseite, „Link senden"). Die
// Sprache ist die der **Versammlung**: Der Empfänger hat noch keine gewählt.
// =============================================================================

import { texteFuer } from './texte.ts'

export interface LinkMailTexte {
  /** Betreff mit {versammlung}. */
  betreff: string
  /** Text mit {name}, {versammlung}, {url}, {code} und {datum}. */
  text: string
}

const TEXTE: Record<string, LinkMailTexte> = {
${zeilen.join('\n')}
}

/** Deutsch — der Rückfall, wenn die Sprache fehlt oder unbekannt ist. */
const DE: LinkMailTexte = {
  betreff: ${lit(de.linkMailBetreff)},
  text: ${lit(de.linkMailText)},
}

/** Texte für einen Sprachcode der App. Unbekannt oder fehlend → Deutsch. */
export const linkMailTexte = texteFuer(TEXTE, DE)
`
  writeFileSync(new URL('supabase/functions/_shared/anmelde-texte.ts', REPO), inhalt, 'utf8')
  console.log(`anmelde-texte.ts: ${zeilen.length} Sprachen + de`)
}

alsSkript(import.meta.url, main)
