/**
 * Typen zu `sw-kennung.mjs` — die Datei selbst bleibt einfaches JavaScript,
 * weil sie sowohl aus `vite.config.ts` als auch aus einem Prüfstand geladen
 * wird und dazwischen kein Bauschritt liegt.
 */
export declare const SW_PLATZHALTER: string
export declare function swMitKennung(
  quelle: string,
  kennung: string,
): { quelle: string; ersetzt: boolean }
export declare function alsCacheName(kennung: string): string
