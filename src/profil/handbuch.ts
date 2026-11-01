/**
 * **Wo die Handbücher liegen** (1.11.2026): im öffentlichen Repo, als
 * Markdown — GitHub zeigt sie mit Bildern und Inhaltsverzeichnis, ohne Konto.
 *
 * Entschieden hat der Betreiber gegen eine eigene Seite über Pages oder in der
 * App: Die Handbücher werden im Repo gepflegt, und dort stehen sie immer auf
 * dem Stand von `main`. Dass die Dateien unter diesen Pfaden liegen, prüft
 * `tests/handbuch-verweise.test.ts`.
 */
export const HANDBUCH_REPO = 'https://github.com/doubrawa/jw-congregation-planner/blob/main/'

export const HANDBUCH = {
  /** Für alle — auch für Gruppenaufseher und Gehilfen (Abschnitt 10). */
  verkuendiger: `${HANDBUCH_REPO}docs/user-guide/verkuendiger.md`,
  /** Für alle, die planen dürfen: Planer und Admin. */
  planer: `${HANDBUCH_REPO}docs/user-guide/planer.md`,
} as const
