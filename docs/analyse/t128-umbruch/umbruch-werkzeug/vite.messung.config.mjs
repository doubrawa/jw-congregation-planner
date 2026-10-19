// Nur für die Umbruchmessung (Sitzung 00f3b826, 18.10.2026): eigener Port,
// Schriften aus dem node_modules des Hauptcheckouts erlaubt. Liegt nur im Worktree.
import { defineConfig, mergeConfig } from 'vite'
import basis from './vite.config.ts'

export default defineConfig(async (env) => {
  const b = typeof basis === 'function' ? await basis(env) : basis
  return mergeConfig(b, {
    server: { port: 5176, strictPort: true, fs: { allow: ['C:/DATA/Claude/jw-congregation-planner'] } },
  })
})
