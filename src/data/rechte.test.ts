import { describe, expect, it } from 'vitest'
import { darfPlanen, erlaubteScreens, nurZuteilen, rechteVon, themaVon, type Rechte } from './rechte'
import type { Group, Screen } from './types'

/**
 * **Wer welchen Bildschirm sehen darf — die einzige Stelle, also auch die
 * einzige, an der es geprüft gehört.**
 *
 * `erlaubteScreens` gibt es, weil die Regel einmal zweimal dastand: eine Liste
 * in `AppShell`, eine Ausschlussbedingung im Reducer. Sie liefen auseinander —
 * die Navigation zeigte einen Eintrag, den der Reducer beim Antippen sofort
 * wieder auf „Programm" umlenkte. Zusammengelegt war sie danach, geprüft
 * nicht: Ein Griff in die Bedingung (ein `!` zu viel, ein Eintrag mehr in
 * `NUR_PLANER`) hätte still verändert, wer die Personenliste öffnen kann, und
 * jeder Test wäre grün geblieben.
 *
 * Geprüft wird die **Regel**, nicht ihre Schreibweise: je Rolle die Menge der
 * erlaubten Bildschirme, und dazu die Frage, ob die Liste dahinter überhaupt
 * noch vollständig ist.
 */

/**
 * Jeder Bildschirm, den es gibt — **vom Compiler erzwungen**, nicht aus dem
 * Gedächtnis.
 *
 * Ein Union-Typ hat keine Laufzeitform, also braucht es eine Aufzählung. Als
 * schlichtes Array wäre sie dieselbe handgepflegte Liste wie `ALLE` in
 * `rechte.ts` — und eine Probe, die eine Liste gegen ihre Abschrift hält,
 * prüft nichts. Über `satisfies Record<Screen, true>` verlangt TypeScript
 * jeden Schlüssel: Ein neuer Bildschirm lässt diese Datei **nicht mehr
 * übersetzen**, und das fällt vor jedem Testlauf auf.
 */
const ALLE_SCREENS = Object.keys({
  login: true,
  start: true,
  programm: true,
  aufgaben: true,
  planen: true,
  personen: true,
  einstellungen: true,
  profil: true,
} satisfies Record<Screen, true>) as Screen[]

/**
 * Der eine Bildschirm, der nicht angesteuert wird: Auf die Anmeldung kommt man
 * durchs Abmelden (`case 'logout'` setzt `screen` selbst), nicht durch
 * `navigate`. Er steht deshalb bewusst in keiner erlaubten Menge.
 */
const NICHT_ANSTEUERBAR: Screen[] = ['login']

/** Die vier Lagen, um die es geht (4.10.2026: drei Stufen und eine Gruppe). */
const ADMIN: Rechte = { admin: true, zuteilen: true, gruppe: null }
const PLANER: Rechte = { admin: false, zuteilen: true, gruppe: null }
const AUFSEHER: Rechte = { admin: false, zuteilen: false, gruppe: 'g1' }
const PLANER_UND_AUFSEHER: Rechte = { admin: false, zuteilen: true, gruppe: 'g1' }
const VERKUENDIGER: Rechte = { admin: false, zuteilen: false, gruppe: null }

describe('Die Rechte aus dem Zustand', () => {
  const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', overseerId: 'p-auf', assistantId: 'p-geh' }]
  const von = (planner: boolean, zuteiler: boolean, personId: string | null) =>
    rechteVon({ planner, zuteiler, groups: GRUPPEN, personId })

  it('der Admin darf zuteilen und ist nie auf eine Gruppe beschränkt — auch nicht als Gruppenaufseher', () => {
    expect(von(true, false, 'p-auf')).toEqual(ADMIN)
  })

  it('der Planer teilt zu, ohne Admin zu sein', () => {
    expect(von(false, true, null)).toEqual(PLANER)
    expect(nurZuteilen(PLANER)).toBe(true)
    expect(nurZuteilen(ADMIN)).toBe(false)
  })

  it('Aufseher und Gehilfe behalten ihre Gruppe, auch als Planer', () => {
    expect(von(false, false, 'p-auf')).toEqual(AUFSEHER)
    expect(von(false, false, 'p-geh')).toEqual(AUFSEHER)
    expect(von(false, true, 'p-geh')).toEqual(PLANER_UND_AUFSEHER)
  })

  it('wer nichts davon ist, ist Verkündiger', () => {
    expect(von(false, false, 'p-irgendwer')).toEqual(VERKUENDIGER)
    expect(nurZuteilen(VERKUENDIGER)).toBe(false)
  })
})

describe('Wer welchen Bildschirm sehen darf', () => {
  it('der Admin sieht alles — bis auf die Anmeldung', () => {
    expect([...erlaubteScreens(ADMIN)]).toEqual(ALLE_SCREENS.filter((s) => !NICHT_ANSTEUERBAR.includes(s)))
  })

  it('der Verkündiger sieht Planen, Personen und Einstellungen nicht', () => {
    const erlaubt = erlaubteScreens(VERKUENDIGER)
    expect(erlaubt).not.toContain('planen')
    expect(erlaubt).not.toContain('personen')
    expect(erlaubt).not.toContain('einstellungen')
    // Und das Übrige sehr wohl — sonst prüfte der Test bloß eine leere Menge.
    expect([...erlaubt]).toEqual(['start', 'programm', 'aufgaben', 'profil'])
  })

  it('Planer und Gruppenaufseher bekommen Planen dazu — Personen und Einstellungen nicht', () => {
    // „Nur Admins dürfen die Pläne ändern und alles andere" (Betreiber,
    // 4.10.2026): Personen und Einstellungen gehören zu dem „alles andere".
    // Fiele die Ausnahme weg, sähen sie die Kontaktdaten der ganzen
    // Versammlung — die Datenbank hielte sie zwar noch auf, aber die
    // Oberfläche böte es an.
    for (const r of [PLANER, AUFSEHER, PLANER_UND_AUFSEHER]) {
      expect([...erlaubteScreens(r)]).toEqual(['start', 'programm', 'aufgaben', 'planen', 'profil'])
    }
  })

  it('die Reihenfolge ist die der Navigation und für alle dieselbe', () => {
    // `AppShell` baut die Navigationsleiste direkt aus dieser Liste. Käme sie
    // je Rolle in anderer Reihenfolge, sprängen die Einträge beim Wechsel.
    const reihenfolge = (s: readonly Screen[]) => s.map((x) => ALLE_SCREENS.indexOf(x))
    for (const r of [ADMIN, PLANER, AUFSEHER, VERKUENDIGER]) {
      const menge = erlaubteScreens(r)
      expect(reihenfolge(menge)).toEqual([...reihenfolge(menge)].sort((a, b) => a - b))
    }
  })
})

describe('Wer welches Thema planen darf (T120, 4.10.2026)', () => {
  /*
    Das Menü führt nach Themen — Zusammenkünfte, Predigtdienst, Weitere Pläne —,
    und jedes Thema hat zwei Seiten: Ansehen und Planen. Den Schalter
    dazwischen sieht nur, wer das Thema planen darf; der Reducer lenkt alle
    anderen beim Planen ab.
  */
  it('die Treffpunkte gehören zum Predigtdienst, die Weiteren Pläne zu sich, alle anderen Reiter zu den Zusammenkünften', () => {
    expect(themaVon('fs')).toBe('predigtdienst')
    expect(themaVon('wp')).toBe('weitere')
    for (const tab of ['mid', 'we', 'edit'] as const) expect(themaVon(tab)).toBe('zusammenkuenfte')
  })

  it('Admin und Planer planen alle drei Themen — der Planer zuteilend', () => {
    for (const r of [ADMIN, PLANER, PLANER_UND_AUFSEHER]) {
      for (const thema of ['zusammenkuenfte', 'predigtdienst', 'weitere'] as const) expect(darfPlanen(r, thema)).toBe(true)
    }
  })

  it('der Gruppenaufseher plant nur den Predigtdienst', () => {
    // Eine Zusammenkunft teilt er nicht ein — er sähe sonst den Schalter und
    // landete beim Antippen auf einem Plan, den er nicht ändern darf.
    expect(darfPlanen(AUFSEHER, 'predigtdienst')).toBe(true)
    expect(darfPlanen(AUFSEHER, 'zusammenkuenfte')).toBe(false)
    expect(darfPlanen(AUFSEHER, 'weitere')).toBe(false)
  })

  it('der Verkündiger plant nichts', () => {
    for (const thema of ['zusammenkuenfte', 'predigtdienst', 'weitere'] as const) {
      expect(darfPlanen(VERKUENDIGER, thema)).toBe(false)
    }
  })
})

describe('Die Liste dahinter bleibt vollständig', () => {
  /*
    `ALLE` in `rechte.ts` ist eine handgeschriebene Abschrift des Typs
    `Screen` — dieselbe Sorte Liste, in die sich jeder neue Eintrag selbst
    eintragen muss. Vergisst man ihn, ist der Bildschirm für **jeden**
    unerreichbar, auch für den Admin: `navigate` lässt nur durch, was in der
    erlaubten Menge steht, und leitet sonst wortlos auf „Programm" um. Nichts
    schlüge fehl, der Knopf täte bloß nichts.

    Hier steht die Gegenprobe. Sie kostet nichts und nennt beim Fehlschlag
    genau den Bildschirm, der fehlt.
  */
  it('jeder Screen ist entweder erlaubt oder ausdrücklich nicht ansteuerbar', () => {
    const erreichbar = new Set(erlaubteScreens(ADMIN))
    const vergessen = ALLE_SCREENS.filter((s) => !erreichbar.has(s) && !NICHT_ANSTEUERBAR.includes(s))
    expect(vergessen, 'fehlt in ALLE (rechte.ts) — für niemanden erreichbar').toEqual([])
  })

  // Dass die Aufzählung oben selbst vollständig ist, stand hier einmal als
  // eigene Prüfung — sie ist entfallen, seit `satisfies Record<Screen, true>`
  // es dem Compiler überträgt. Eine Zusicherung, die beim Übersetzen greift,
  // ist die bessere: Sie kann nicht übersehen werden, weil ohne sie gar nichts
  // mehr läuft.
})
