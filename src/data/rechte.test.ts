import { describe, expect, it } from 'vitest'
import { ansichtsGruppe, type Ansicht } from './ansicht'
import { emptyQualifications } from './helpers'
import { darfAbwesenheitBearbeiten, darfPlanen, erlaubteScreens, rechteStufe, rechteVon, themaVon, type Rechte } from './rechte'
import type { Group, Person, Screen } from './types'

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
  freie: true,
  mitteilungen: true,
  planen: true,
  planung: true,
  wochen: true,
  auswertung: true,
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

  it('der Planer plant, ohne Admin zu sein', () => {
    expect(von(false, true, null)).toEqual(PLANER)
  })

  it('Aufseher und Gehilfe behalten ihre Gruppe, auch als Planer', () => {
    expect(von(false, false, 'p-auf')).toEqual(AUFSEHER)
    expect(von(false, false, 'p-geh')).toEqual(AUFSEHER)
    expect(von(false, true, 'p-geh')).toEqual(PLANER_UND_AUFSEHER)
  })

  it('wer nichts davon ist, ist Verkündiger', () => {
    expect(von(false, false, 'p-irgendwer')).toEqual(VERKUENDIGER)
  })
})

describe('Wer welchen Bildschirm sehen darf', () => {
  it('der Admin sieht alles — bis auf die Anmeldung', () => {
    expect([...erlaubteScreens(ADMIN)]).toEqual(ALLE_SCREENS.filter((s) => !NICHT_ANSTEUERBAR.includes(s)))
  })

  it('der Verkündiger sieht Planen, die Wochen, die Auswertung, Personen und Einstellungen nicht', () => {
    const erlaubt = erlaubteScreens(VERKUENDIGER)
    expect(erlaubt).not.toContain('planen')
    expect(erlaubt).not.toContain('planung')
    expect(erlaubt).not.toContain('wochen')
    expect(erlaubt).not.toContain('auswertung')
    expect(erlaubt).not.toContain('personen')
    expect(erlaubt).not.toContain('einstellungen')
    // Und das Übrige sehr wohl — sonst prüfte der Test bloß eine leere Menge.
    expect([...erlaubt]).toEqual(['start', 'programm', 'aufgaben', 'freie', 'mitteilungen', 'profil'])
  })

  it('Planer und Gruppenaufseher bekommen Planen dazu — Personen und Einstellungen nicht', () => {
    // „Nur Admins dürfen die Pläne ändern und alles andere" (Betreiber,
    // 4.10.2026): Personen und Einstellungen gehören zu dem „alles andere".
    // Fiele die Ausnahme weg, sähen sie die Kontaktdaten der ganzen
    // Versammlung — die Datenbank hielte sie zwar noch auf, aber die
    // Oberfläche böte es an.
    for (const r of [PLANER, PLANER_UND_AUFSEHER]) {
      expect([...erlaubteScreens(r)]).toEqual(['start', 'programm', 'aufgaben', 'freie', 'mitteilungen', 'planen', 'planung', 'wochen', 'auswertung', 'profil'])
    }
  })

  it('die Wahl auf „Planung", die Wochen und die Auswertung sieht nur, wer zuteilt — der Gruppenaufseher plant allein Treffpunkte', () => {
    // Die Wochen gelten den Zusammenkünften (T121, Phase 10), die Wahl (T144)
    // dem, der mehr als einen Bereich plant; der Gruppenaufseher kommt über
    // „Planung" gleich zu den Treffpunkten. Die Auswertung (T126): „admin und
    // planer" (Betreiber, 16.10.2026).
    expect([...erlaubteScreens(AUFSEHER)]).toEqual(['start', 'programm', 'aufgaben', 'freie', 'mitteilungen', 'planen', 'profil'])
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

  it('dieselben Rechte ergeben dieselbe Liste — auch aus einem neuen Objekt', () => {
    // Der Deep-Link-Effekt in `AppShell` hängt an dieser Liste; war sie bei
    // jedem Aufruf neu, lief er bei jedem Render (Review, App #9). Die Gruppe
    // zählt nur als „hat eine": Welche, ändert die Bildschirme nicht.
    expect(erlaubteScreens({ ...PLANER })).toBe(erlaubteScreens(PLANER))
    expect(erlaubteScreens({ ...AUFSEHER, gruppe: 'andere' })).toBe(erlaubteScreens(AUFSEHER))
    expect(erlaubteScreens(VERKUENDIGER)).not.toBe(erlaubteScreens(AUFSEHER))
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

/**
 * **Wie sich jemand nennt** (5.10.2026): die Zeile unter dem Namen in der
 * Seitenleiste. Die höchste Stufe gewinnt; wer eine Gruppe betreut, ist ihr
 * Gruppenaufseher oder Gehilfe — bis dahin hieß er „Verkündiger".
 */
describe('rechteStufe', () => {
  const GRUPPE: Group = { id: 'g1', name: 'G1', overseerId: 'p-ov', assistantId: 'p-geh' }
  const stufe = (s: { planner?: boolean; zuteiler?: boolean; personId: string | null }) => {
    const zustand = { planner: false, zuteiler: false, groups: [GRUPPE], ...s }
    return rechteStufe(rechteVon(zustand), zustand)
  }

  it('Admin vor allem — auch wenn er eine Gruppe leitet', () => {
    expect(stufe({ planner: true, personId: 'p-ov' })).toBe('admin')
  })

  it('Planer vor der Gruppe', () => {
    expect(stufe({ zuteiler: true, personId: 'p-ov' })).toBe('planer')
  })

  it('Aufseher und Gehilfe ihrer Gruppe', () => {
    expect(stufe({ personId: 'p-ov' })).toBe('gruppenaufseher')
    expect(stufe({ personId: 'p-geh' })).toBe('gehilfe')
  })

  it('alle übrigen Verkündiger — auch ohne eigene Person', () => {
    expect(stufe({ personId: 'p-x' })).toBe('verkuendiger')
    expect(stufe({ personId: null })).toBe('verkuendiger')
  })
})

/**
 * **Befristet (T124): die App mit den Rechten einer anderen Stufe ansehen.**
 * Die Ansicht muss genau die Rechte ergeben, die ein echtes Konto dieser Stufe
 * hat — sonst zeigte sie dem Admin eine App, die es so nicht gibt.
 */
describe('Die Ansicht einer anderen Stufe (T124)', () => {
  const GRUPPEN: Group[] = [
    { id: 'g1', name: 'Gruppe 1', overseerId: 'p-auf', assistantId: null },
    { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
  ]
  const ADMIN_ZUSTAND = { planner: true, zuteiler: false, groups: GRUPPEN, personId: 'p-admin' }
  const echt = (s: { zuteiler?: boolean; personId: string | null }) => rechteVon({ planner: false, zuteiler: false, groups: GRUPPEN, ...s })
  const ansicht = (a: Ansicht) => rechteVon({ ...ADMIN_ZUSTAND, ansicht: a })

  it('je Stufe dieselben Rechte und Bildschirme wie ein echtes Konto dieser Stufe', () => {
    const paare: [Ansicht, Rechte][] = [
      [{ stufe: 'planer', gruppe: null }, echt({ zuteiler: true, personId: 'p-x' })],
      [{ stufe: 'gruppenaufseher', gruppe: 'g1' }, echt({ personId: 'p-auf' })],
      [{ stufe: 'verkuendiger', gruppe: null }, echt({ personId: 'p-x' })],
    ]
    for (const [a, r] of paare) {
      expect(ansicht(a), a.stufe).toEqual(r)
      expect(erlaubteScreens(ansicht(a)), a.stufe).toEqual(erlaubteScreens(r))
    }
  })

  it('die Stufe heißt, wie die Ansicht sie nennt — der Admin ist nicht Aufseher der gespielten Gruppe', () => {
    const z = { ...ADMIN_ZUSTAND, ansicht: { stufe: 'gruppenaufseher', gruppe: 'g2' } as const }
    expect(rechteStufe(rechteVon(z), z)).toBe('gruppenaufseher')
  })

  it('nur für ein echtes Admin-Konto: Ohne das Recht zählt keine Ansicht', () => {
    const planer = { planner: false, zuteiler: true, groups: GRUPPEN, personId: 'p-x' }
    expect(rechteVon({ ...planer, ansicht: { stufe: 'verkuendiger', gruppe: null } })).toEqual(PLANER)
    expect(rechteStufe(rechteVon({ ...planer, ansicht: { stufe: 'verkuendiger', gruppe: null } }), { ...planer, ansicht: { stufe: 'verkuendiger', gruppe: null } })).toBe('planer')
  })

  it('als Verkündiger bearbeitet der Admin nur noch die eigenen Abwesenheiten', () => {
    const z = { ...ADMIN_ZUSTAND, ansicht: { stufe: 'verkuendiger', gruppe: null } as const }
    expect(darfAbwesenheitBearbeiten(ADMIN_ZUSTAND, 'p-anderer')).toBe(true)
    expect(darfAbwesenheitBearbeiten(z, 'p-anderer')).toBe(false)
    expect(darfAbwesenheitBearbeiten(z, 'p-admin')).toBe(true)
  })

  it('die gespielte Gruppe: nur die eigene — ohne eigene keine, auch nicht die erste (17.10.2026)', () => {
    // Ein echter Aufseher gehört der Gruppe an, die er leitet; Programm und Start
    // fragen die eigene Gruppe. Eine fremde wirkte nur beim Planen.
    const person = (id: string, grp: string | null): Person => ({ id, fn: id, ln: 'Test', role: 'aeltester', mail: '', priv: emptyQualifications(), grp })
    expect(ansichtsGruppe(GRUPPEN, [person('p-admin', 'g2')], 'p-admin')).toBe('g2')
    expect(ansichtsGruppe(GRUPPEN, [person('p-admin', null)], 'p-admin')).toBeNull()
    expect(ansichtsGruppe(GRUPPEN, [person('p-admin', 'g-weg')], 'p-admin')).toBeNull()
    expect(ansichtsGruppe(GRUPPEN, [], null)).toBeNull()
    expect(ansichtsGruppe([], [person('p-admin', 'g2')], 'p-admin')).toBeNull()
  })
})
