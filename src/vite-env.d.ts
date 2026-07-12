/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase-Projekt-URL — fehlt sie, läuft die App im Demo-Modus. */
  readonly VITE_SUPABASE_URL?: string
  /** Öffentlicher anon-Key des Supabase-Projekts. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
