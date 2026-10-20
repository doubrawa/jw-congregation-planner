// Nur für die Umbruchmessung (Sitzung 00f3b826, 18.10.2026): eigener Port,
// Schriften aus dem node_modules des Hauptcheckouts erlaubt. Liegt nur im Worktree.
//
// `fs.allow` ersetzt die Vorgabe ganz: Neben dem Hauptcheckout muss deshalb der
// Worktree selbst darin stehen (der Ordner dieser Datei) — sonst antwortet Vite
// auf index.html und jedes Modul mit 403 (20.10.2026, Worktree im Scratchpad).
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vite'
import basis from './vite.config.ts'

const worktree = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(async (env) => {
  const b = typeof basis === 'function' ? await basis(env) : basis
  return mergeConfig(b, {
    server: { port: 5176, strictPort: true, fs: { allow: ['C:/DATA/Claude/jw-congregation-planner', worktree] } },
  })
})
