/**
 * Typen zu `testdaten-grenze.mjs` — die Datei selbst bleibt einfaches
 * JavaScript, weil sie sowohl aus `vite.config.ts` als auch aus einem
 * Prüfstand geladen wird und dazwischen kein Bauschritt liegt.
 */
import type { Plugin } from 'vite'

export declare const TESTDATEN_ORDNER: RegExp
export declare const ENTWICKLERSEITE: string
export declare function alsEntwicklerseite(indexHtml: string): { html: string; ersetzt: boolean }
export declare function entwicklerseite(): Plugin

/** Was `ausgabeText` von einer Ausgabedatei braucht — Chunk oder Asset. */
export type Ausgabedatei =
  | { type: 'chunk'; fileName: string; code: string }
  | { type: 'asset'; fileName: string; source: string | Uint8Array }

export declare function ausgabeText(datei: Ausgabedatei): string | null
export declare function testdatenBefunde(eingabe: {
  module: Iterable<string>
  dateien: ReadonlyArray<{ name: string; text: string }>
  kennzeichen: readonly string[]
}): string[]
export declare function testdatenWache(kennzeichen: readonly string[]): Plugin
