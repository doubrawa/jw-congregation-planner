#!/usr/bin/env node
/**
 * **Was ist auszurollen?** — der erste Schritt von `ausrollen.yml` (T170).
 *
 * Verglichen wird mit dem Commit des **letzten grünen Deploys**, nicht mit dem
 * vorigen Push. Scheitert ein Lauf — eine rote Probe, ein Fehler beim
 * Ausrollen —, bleibt seine Änderung offen, bis ein Lauf grün durchgeht. Mit
 * dem vorigen Push als Maßstab sähe der nächste Lauf sie nicht mehr, und eine
 * Migration läge für immer brach.
 *
 * Ausgerollt wird, was sich seitdem geändert hat:
 *  - `supabase/migrations/` → `db push`, das einspielt, was im Verlauf fehlt;
 *  - der Code unter `supabase/functions/` (ohne Proben) oder `config.toml`
 *    (`verify_jwt`) → **alle** Functions aus `config.toml`. Nur die
 *    betroffenen zu wählen hieße, den Importgraph nachzurechnen, und
 *    `_shared/` hängt an fast allen.
 * Von Hand gestartet (`workflow_dispatch`), ohne grünen Vorgänger oder mit
 * einem Vorgänger, den Git nicht mehr kennt, rollt er alles aus.
 *
 * Läuft vor `npm ci` und braucht deshalb nur Node selbst.
 *
 *   node scripts/ausrollen-plan.mjs >> "$GITHUB_OUTPUT"
 *
 * Auf stdout stehen die Zeilen für `$GITHUB_OUTPUT`, die Begründung geht nach
 * stderr — so steht sie im Protokoll, ohne die Ausgabe zu verderben.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { alsSkript } from './gemeinsam.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Der Workflow, dessen letzter grüner Lauf den ausgerollten Stand markiert. */
export const WORKFLOW = 'deploy.yml'

/** Was die geänderten Dateien auszurollen verlangen. */
export function wasAusrollen(dateien) {
  const migrationen = dateien.some((d) => d.startsWith('supabase/migrations/') && d.endsWith('.sql'))
  const functions = dateien.some(
    (d) =>
      d === 'supabase/config.toml' ||
      (d.startsWith('supabase/functions/') && !d.startsWith('supabase/functions/_test/') && !d.endsWith('.test.ts')),
  )
  return { migrationen, functions }
}

/**
 * Die Functions, wie `config.toml` sie nennt, mit ihrem `verify_jwt`. Dieselbe
 * Liste, die die JWT-Prüfung festhält: Eine Function ohne Eintrag dort bekäme
 * beim Ausrollen die Vorgabe der CLI statt einer Entscheidung.
 *
 * @returns {{ name: string, verifyJwt: boolean }[]}
 */
export function functionsAusConfig(text) {
  const out = []
  for (const m of String(text).matchAll(/^\[functions\.([a-z0-9_-]+)\]\s*\n([\s\S]*?)(?=^\[|(?![\s\S]))/gm)) {
    const jwt = /^verify_jwt\s*=\s*(true|false)\s*$/m.exec(m[2])
    out.push({ name: m[1], verifyJwt: jwt ? jwt[1] === 'true' : true })
  }
  return out
}

/** Die Functions aus `supabase/config.toml` dieses Repos. */
export function functionsDesRepos() {
  return functionsAusConfig(fs.readFileSync(path.join(REPO, 'supabase', 'config.toml'), 'utf8'))
}

/** Der Commit des letzten grünen Laufs von `deploy.yml` auf `main` — oder `null`. */
export async function letzterGruenerStand({ repo, token, holen = fetch }) {
  const res = await holen(
    `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/runs?branch=main&status=success&per_page=1`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
  )
  if (!res.ok) throw new Error(`GitHub-API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const antwort = await res.json()
  return antwort.workflow_runs?.[0]?.head_sha ?? null
}

/** Die Dateien, die sich seit `basis` geändert haben. Der Checkout ist flach — `basis` wird nachgeholt. */
function geaendertSeit(basis) {
  execFileSync('git', ['fetch', '--quiet', '--depth=1', 'origin', basis], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] })
  return execFileSync('git', ['diff', '--name-only', basis, 'HEAD'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

/** Plan und Begründung, aus der Umgebung von GitHub Actions. */
async function planen(env) {
  const alles = { migrationen: true, functions: true }
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') return { plan: alles, grund: 'von Hand gestartet: alles' }
  const basis = await letzterGruenerStand({ repo: env.GITHUB_REPOSITORY, token: env.GH_TOKEN })
  if (!basis) return { plan: alles, grund: 'noch kein grüner Deploy: alles' }
  try {
    const dateien = geaendertSeit(basis)
    return { plan: wasAusrollen(dateien), grund: `seit ${basis.slice(0, 8)} (letzter grüner Deploy) ${dateien.length} Dateien geändert` }
  } catch (err) {
    return { plan: alles, grund: `${basis.slice(0, 8)} ist nicht mehr erreichbar (${err instanceof Error ? err.message : err}): alles` }
  }
}

export async function main(env = process.env) {
  const functions = functionsDesRepos()
  const { plan, grund } = await planen(env)
  console.error(`Ausrollen — ${grund}.`)
  console.error(`  Migrationen: ${plan.migrationen ? 'ja' : 'nein'} · Functions: ${plan.functions ? `ja, alle ${functions.length}` : 'nein'}`)
  const ausgabe = {
    migrationen: plan.migrationen,
    functions: plan.functions,
    etwas: plan.migrationen || plan.functions,
    namen: functions.map((f) => f.name).join(' '),
    // Millisekunden wie `updated_at` in `functions list`: Was danach dort
    // steht, ist in diesem Lauf ausgerollt.
    start: Date.now(),
  }
  for (const [k, v] of Object.entries(ausgabe)) console.log(`${k}=${v}`)
}

alsSkript(import.meta.url, main)
