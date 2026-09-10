/**
 * Was alle Wartungsskripte brauchen.
 *
 * Diese drei Helfer lagen in bis zu vier Abschriften nebeneinander:
 * `argumente` viermal, der Anzeigename dreimal, `ladeTabellen` dreimal. Keine
 * davon war anders gemeint — sie sind nur mitgewachsen, weil jedes Skript für
 * sich lauffähig sein sollte.
 *
 * Der Weg dahin war längst gebahnt: `treffpunkte-importieren.mjs` holt sich
 * seine Helfer seit jeher aus einem anderen Skript. Hier stehen sie nun ohne
 * Umweg über einen Importeur, der sie zufällig zuerst hatte.
 *
 * Die bisherigen Fundstellen bleiben gültig: Die Skripte reichen die Namen
 * weiter (`export { ... } from`), damit Aufrufer und Tests unverändert bleiben.
 */

import fs from 'node:fs'
import path from 'node:path'

/**
 * Argumente der Form `--name Wert` einlesen; `--flagge` wird `true`.
 *
 * Alles, was nicht mit `--` beginnt und nicht Wert einer Option ist, wird
 * übergangen — Skripte werden von Hand aufgerufen, und ein vertippter
 * Stellungsparameter soll nicht stillschweigend zur Option werden.
 */
export function argumente(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const naechstes = argv[i + 1]
    if (naechstes === undefined || naechstes.startsWith('--')) out[a.slice(2)] = true
    else {
      out[a.slice(2)] = naechstes
      i++
    }
  }
  return out
}

/**
 * Anzeigename wie in der App (`_shared/planung.ts`, `src/data/helpers.ts`).
 *
 * Ein gesetzter Anzeigename gilt; sonst Vor- und Nachname, getrimmt — damit
 * ein fehlender Teil kein führendes oder doppeltes Leerzeichen hinterlässt.
 */
export function personDisplayName(fn, ln, dn) {
  return (dn && dn.trim()) || `${fn ?? ''} ${ln ?? ''}`.trim()
}

/**
 * Die NWS-Ausgabetabellen eines Verzeichnisses einlesen.
 *
 * `tabellen` bildet den Schlüssel auf den Dateinamen ab; welche gebraucht
 * werden, weiß jedes Skript für sich, das Einlesen ist überall dasselbe.
 */
export function ladeTabellen(dir, tabellen) {
  const t = {}
  for (const [key, datei] of Object.entries(tabellen)) {
    t[key] = JSON.parse(fs.readFileSync(path.join(dir, datei), 'utf8'))
  }
  return t
}

/**
 * Der Schlüssel, mit dem die Wartungsskripte schreiben.
 *
 * **Er heißt nicht mehr Service-Role.** Die Legacy-JWT-Schlüssel dieses
 * Projekts (`anon`, `service_role`) sind seit 14.8.2026 deaktiviert; gültig ist
 * der `sb_secret_…` aus dem Dashboard (Project Settings → API Keys → Secret
 * keys). Weil die Umgebungsvariable in allen Skripten und Notizen
 * `SUPABASE_SERVICE_ROLE_KEY` hieß, gilt der alte Name weiter — der neue
 * `SUPABASE_SECRET_KEY` hat Vorrang. So muss niemand seine Gewohnheit ändern,
 * und wer den treffenden Namen benutzt, wird nicht bestraft.
 */
export function secretKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

/**
 * Kopfzeilen zur Anmeldung — **die beiden Schlüsselarten wollen verschiedene.**
 *
 * Die Legacy-Schlüssel sind JWTs, und Supabase-Clients senden sie in `apikey`
 * **und** `Authorization: Bearer`. Die neuen (`sb_secret_…`,
 * `sb_publishable_…`) sind keine JWTs: Steht so einer in `Authorization`,
 * versucht die Plattform ihn als JWT zu lesen und weist die Anfrage mit
 * „Invalid JWT" ab. Die Doku sagt es ausdrücklich — „Send publishable and
 * secret keys on the `apikey` header only".
 *
 * Bis dahin schickte jedes Skript blind beide Kopfzeilen. Das ging gut, solange
 * PostgREST den Zusatz duldete — eine Duldung, auf die sich nichts stützen
 * sollte. Beide Arten müssen weiter gehen: Legacy-Schlüssel gelten allgemein
 * bis Ende 2026, und ein anderes Projekt kann noch welche haben.
 */
export function authKopf(key) {
  const k = String(key ?? '').trim()
  return k.startsWith('eyJ') ? { apikey: k, Authorization: `Bearer ${k}` } : { apikey: k }
}
