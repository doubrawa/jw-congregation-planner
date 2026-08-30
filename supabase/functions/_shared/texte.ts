// =============================================================================
// Geteilt: eine Sprachtabelle nachschlagen
// =============================================================================
// Vier Functions verschicken fertigen Text (`send-plan`, `send-reminders`,
// `substitute`, `send-invite`), und jede trug dieselbe Nachschlage-Regel für
// sich: Tabelle je Sprachcode, Deutsch als Rückfall. Die vier Abschriften waren
// bereits auseinander — zwei schrieben `TEXTE[lang ?? ''] ?? DE`, zwei
// `(lang && TEXTE[lang]) || DE`. Beide tun dasselbe, aber wer sie
// nebeneinanderlegt, muss erst nachdenken, ob sie es wirklich tun.
//
// **Die Texte selbst bleiben, wo sie sind.** Geteilt wird nur die Regel, nicht
// der Inhalt: Was `send-invite` schreibt, geht niemanden sonst etwas an, und
// eine gemeinsame Tabelle wäre der Anfang eines Wörterbuchs, das die ganze
// i18n-Schicht in jede Function zöge — genau das, was die vier kleinen Listen
// vermeiden sollen.
//
// Warum überhaupt serverseitig übersetzt wird: Ein Push ist fertiger Text,
// sobald er das Gerät erreicht — der Service Worker zeigt ihn unverändert an.
// Was hier fehlt, geht auf Deutsch hinaus und ist beim Empfänger nicht mehr zu
// heilen. Die Glocke in der App darf dagegen kanonisch deutsch in der Datenbank
// stehen; sie wird beim Anzeigen übersetzt (`NOTIF_TITLE_KEY` in
// `src/i18n/ui.ts`).
// =============================================================================

/**
 * Nachschlage-Funktion für eine Sprachtabelle.
 *
 * `lang` kommt aus `push_subscriptions.lang` (je Gerät) oder vom Client und
 * darf fehlen: Abos von vor migration-014 tragen keine Sprache. Unbekanntes
 * und Fehlendes fällt auf `de` zurück — eine Nachricht in einer Sprache, die
 * niemand gewählt hat, wäre schlechter als die deutsche.
 *
 * Dass ein Aufrufer einen beliebigen Code hereinreichen könnte, ist ohne
 * Folgen: Er wählt einen Eintrag aus einer festen Tabelle, mehr nicht.
 */
export function texteFuer<T>(
  tabelle: Record<string, T>,
  de: T,
): (lang: string | null | undefined) => T {
  return (lang) => tabelle[lang ?? ''] ?? de
}
