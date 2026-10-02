/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase-Projekt-URL — fehlt sie, hat die App keine Datenbank und bleibt leer. */
  readonly VITE_SUPABASE_URL?: string
  /** Öffentlicher anon-Key des Supabase-Projekts. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Stand des Builds (Zeit · Git-Kurzkennung), von vite.config.ts eingesetzt.
 * Im Profil sichtbar, damit am Gerät feststellbar ist, welche Fassung dort
 * wirklich läuft.
 */
declare const __BUILD_ID__: string
