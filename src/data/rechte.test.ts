import { describe, expect, it } from 'vitest'
import { erlaubteScreens } from './rechte'
import type { Screen } from './types'

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

describe('Wer welchen Bildschirm sehen darf', () => {
  it('der Planer sieht alles — bis auf die Anmeldung', () => {
    expect([...erlaubteScreens(true, false)]).toEqual(
      ALLE_SCREENS.filter((s) => !NICHT_ANSTEUERBAR.includes(s)),
    )
  })

  it('der Verkündiger sieht Planen, Personen und Einstellungen nicht', () => {
    const erlaubt = erlaubteScreens(false, false)
    expect(erlaubt).not.toContain('planen')
    expect(erlaubt).not.toContain('personen')
    expect(erlaubt).not.toContain('einstellungen')
    // Und das Übrige sehr wohl — sonst prüfte der Test bloß eine leere Menge.
    expect([...erlaubt]).toEqual(['start', 'programm', 'aufgaben', 'profil'])
  })

  it('der Gruppenaufseher bekommt Planen und Einstellungen dazu', () => {
    // Dort nur die Treffpunkte seiner eigenen Gruppe — das entscheidet der
    // jeweilige Bildschirm über `onlyGroup`, nicht diese Regel.
    const erlaubt = erlaubteScreens(false, true)
    expect(erlaubt).toContain('planen')
    expect(erlaubt).toContain('einstellungen')
  })

  it('die Personenliste bleibt dem Gruppenaufseher verschlossen', () => {
    // Die eine Ausnahme in der Ausnahme, und die leiseste: Sie unterscheidet
    // ihn vom Planer. Fiele sie weg, sähe er die Kontaktdaten der ganzen
    // Versammlung — die Richtlinien der Datenbank halten ihn dann zwar noch
    // auf, aber die Oberfläche böte es an.
    expect(erlaubteScreens(false, true)).not.toContain('personen')
  })

  it('das Planer-Recht sticht das Aufseher-Recht, nicht umgekehrt', () => {
    expect(erlaubteScreens(true, true)).toEqual(erlaubteScreens(true, false))
  })

  it('die Reihenfolge ist die der Navigation und für alle dieselbe', () => {
    // `AppShell` baut die Navigationsleiste direkt aus dieser Liste. Käme sie
    // je Rolle in anderer Reihenfolge, sprängen die Einträge beim Wechsel.
    const reihenfolge = (s: readonly Screen[]) => s.map((x) => ALLE_SCREENS.indexOf(x))
    for (const menge of [
      erlaubteScreens(true, false),
      erlaubteScreens(false, true),
      erlaubteScreens(false, false),
    ]) {
      expect(reihenfolge(menge)).toEqual([...reihenfolge(menge)].sort((a, b) => a - b))
    }
  })
})

describe('Die Liste dahinter bleibt vollständig', () => {
  /*
    `ALLE` in `rechte.ts` ist eine handgeschriebene Abschrift des Typs
    `Screen` — dieselbe Sorte Liste, in die sich jeder neue Eintrag selbst
    eintragen muss. Vergisst man ihn, ist der Bildschirm für **jeden**
    unerreichbar, auch für den Planer: `navigate` lässt nur durch, was in der
    erlaubten Menge steht, und leitet sonst wortlos auf „Programm" um. Nichts
    schlüge fehl, der Knopf täte bloß nichts.

    Hier steht die Gegenprobe. Sie kostet nichts und nennt beim Fehlschlag
    genau den Bildschirm, der fehlt.
  */
  it('jeder Screen ist entweder erlaubt oder ausdrücklich nicht ansteuerbar', () => {
    const erreichbar = new Set(erlaubteScreens(true, false))
    const vergessen = ALLE_SCREENS.filter(
      (s) => !erreichbar.has(s) && !NICHT_ANSTEUERBAR.includes(s),
    )
    expect(vergessen, 'fehlt in ALLE (rechte.ts) — für niemanden erreichbar').toEqual([])
  })

  // Dass die Aufzählung oben selbst vollständig ist, stand hier einmal als
  // eigene Prüfung — sie ist entfallen, seit `satisfies Record<Screen, true>`
  // es dem Compiler überträgt. Eine Zusicherung, die beim Übersetzen greift,
  // ist die bessere: Sie kann nicht übersehen werden, weil ohne sie gar nichts
  // mehr läuft.
})
