import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * **Eine Sicherung von vor einer Migration geht zurück** (8. November 2026).
 *
 * Die Rückspielprobe schrieb jede Tabelle mit `select *`: Eine Spalte, die eine
 * Migration seither angelegt hat, kam als NULL an statt mit ihrem Standardwert.
 * So scheiterte die Probe nach E4 an jeder vorhandenen Sicherung
 * (`persons.admin_vorgemerkt`, `not null`) — das echte Zurückspielen über
 * PostgREST, das nur die mitgelieferten Spalten schreibt, wäre durchgegangen.
 *
 * Hier eine kleine Sicherung, wie sie vor E4 aussah: Personen und Konten ohne
 * die neuen Spalten, mit dem Recht unter `planner`. Gefahren wird das Skript
 * selbst, als eigener Prozess — wie der Betreiber es aufruft.
 */

const REPO = path.resolve(import.meta.dirname, '..')
const CONG = '00000000-0000-4000-8000-000000000001'
const KONTO = '00000000-0000-4000-8000-0000000000a1'
const PERSON = '00000000-0000-4000-8000-0000000000c3'

const VOR_E4 = {
  erstellt: '2026-11-08T12:00:00.000Z',
  konten: [{ id: KONTO, email: `${PERSON}@konten.invalid`, created_at: '2026-11-01T00:00:00.000Z' }],
  tabellen: {
    congregations: [{ id: CONG, name: 'Probe' }],
    persons: [{ id: PERSON, congregation_id: CONG, fn: 'Probe', ln: 'Eins', planner_vorgemerkt: true }],
    members: [{ user_id: KONTO, congregation_id: CONG, person_id: PERSON, planner: true, zuteiler: false, email: '' }],
  },
}

describe('rueckspielprobe — eine Sicherung von vor E4', () => {
  it('geht zurück: Fehlt eine Spalte in der Sicherung, gilt ihr Standardwert', () => {
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'rueckspielprobe-'))
    const datei = path.join(ordner, 'sicherung.json')
    fs.writeFileSync(datei, JSON.stringify(VOR_E4))
    try {
      const lauf = spawnSync(process.execPath, ['scripts/rueckspielprobe.mjs', datei], { cwd: REPO, encoding: 'utf8' })
      expect(lauf.stderr).toBe('')
      expect(lauf.stdout).toContain('Alle Tabellen gleich.')
      expect(lauf.status).toBe(0)
    } finally {
      fs.rmSync(ordner, { recursive: true, force: true })
    }
  }, 120_000)
})
