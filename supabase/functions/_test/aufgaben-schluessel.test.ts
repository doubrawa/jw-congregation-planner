/*
 * **Aufbau und Zerlegung müssen zueinander passen.**
 *
 * Der `task_key` verbindet drei Laufzeiten: Die App legt die Bestätigung ab,
 * eine Edge Function erinnert daran, und die Datenbank entscheidet über
 * `task_gehoert_mir`, ob der Schlüssel zur eigenen Aufgabe gehört. Passten
 * Erzeuger und Zerleger nicht zusammen, fiele das nirgends auf: Der Schlüssel
 * würde geschrieben, nur fände ihn niemand wieder — die Bestätigung bliebe
 * unsichtbar, und die Erinnerung käme Tag für Tag erneut.
 *
 * Bis September 2026 gab es fünf Erzeuger und sechs Zerleger, verteilt über
 * App, Functions und ein Skript. Seit es je einen gibt, lässt sich der Kreis
 * schließen: Was gebaut wurde, muss sich zerlegen lassen — und zwar zu genau
 * dem, woraus es gebaut wurde.
 */
import { describe, expect, it } from 'vitest'
import {
  fsKey,
  helferKey,
  istWochenKennung,
  punktKey,
  punktStamm,
  ratgeberKey,
  schluesselTeile,
  wochenPraefixe,
} from '../_shared/aufgaben-schluessel.ts'

const WOCHE = '2026-09-07'

describe('gebaut und wieder zerlegt', () => {
  it('Programmpunkt im Hauptsaal', () => {
    expect(schluesselTeile(punktKey(WOCHE, 'mid', 'k3f9x', 0))).toEqual({
      art: 'part',
      woche: WOCHE,
      tab: 'mid',
      iid: 'k3f9x',
      ni: 0,
    })
  })

  it('Programmpunkt in der Zusätzlichen Klasse', () => {
    expect(schluesselTeile(punktKey(WOCHE, 'mid', 'k3f9x', 1, true))).toEqual({
      art: 'aux',
      woche: WOCHE,
      tab: 'mid',
      iid: 'k3f9x',
      ni: 1,
    })
  })

  it('Ratgeber', () => {
    expect(schluesselTeile(ratgeberKey(WOCHE, 'we'))).toEqual({
      art: 'ratgeber',
      woche: WOCHE,
      tab: 'we',
    })
  })

  it('Hilfsdienst', () => {
    expect(schluesselTeile(helferKey(WOCHE, 'we', 'mik', 2))).toEqual({
      art: 'helper',
      woche: WOCHE,
      tab: 'we',
      svc: 'mik',
      pos: 2,
    })
  })

  it('Treffpunkt', () => {
    expect(schluesselTeile(fsKey(WOCHE, 'i7'))).toEqual({
      art: 'fs',
      woche: WOCHE,
      instId: 'i7',
    })
  })

  /*
   * Die Kennung eines Dienstes darf alles sein, was der Planer eintippt — sie
   * ist ein Schlüssel aus `services.key`. Ein `|` darin bräche das Format; die
   * Probe hält fest, dass der Zerleger dann `null` sagt statt zu raten.
   */
  it('ein Trennzeichen im Dienst bleibt nicht unbemerkt', () => {
    expect(schluesselTeile(helferKey(WOCHE, 'we', 'a|b', 0))).toBeNull()
  })
})

describe('was kein Schlüssel ist, wird nicht geraten', () => {
  it.each([
    ['leer', ''],
    ['nur die Woche', WOCHE],
    ['Woche ohne Zusammenkunft', `${WOCHE}|xx|ratgeber`],
    ['Position statt Kennung (vor T66)', '60|mid|part|k3f9x|0'],
    ['unbekannter Abschnitt', `${WOCHE}|mid|weissnicht|k3f9x|0`],
    ['Ratgeber mit zu vielen Feldern', `${WOCHE}|mid|ratgeber|x`],
    ['Treffpunkt ohne Instanz', `fs|${WOCHE}`],
    ['Treffpunkt ohne Woche', 'fs||i7'],
    ['Tagebuch-Schlüssel (Platz + Name)', `${ratgeberKey(WOCHE, 'mid')} Max Muster`],
    // Platz 0 in Verkleidung: `Number()` las beides als 0, die Datenbank ließ es durch.
    ['Platznummer als Kommazahl', `${WOCHE}|mid|helper|mik|0.0`],
    ['Platznummer mit Vorzeichen', `${WOCHE}|mid|part|k3f9x|+0`],
  ])('%s', (_was, key) => {
    expect(schluesselTeile(key)).toBeNull()
  })
})

describe('Bausteine', () => {
  it('der Stamm ist das Präfix aller Plätze eines Punkts', () => {
    const stamm = punktStamm(WOCHE, 'mid', 'k3f9x')
    for (const ni of [0, 1, 2]) {
      expect(punktKey(WOCHE, 'mid', 'k3f9x', ni).startsWith(stamm)).toBe(true)
    }
    // …und trennt die beiden Räume: der Hauptsaal-Stamm passt nicht zur Klasse.
    expect(punktKey(WOCHE, 'mid', 'k3f9x', 0, true).startsWith(stamm)).toBe(false)
  })

  it('jeder Schlüssel einer Woche beginnt mit einem ihrer beiden Präfixe', () => {
    const praefixe = wochenPraefixe(WOCHE)
    const alle = [
      punktKey(WOCHE, 'mid', 'k3f9x', 0),
      punktKey(WOCHE, 'we', 'k3f9x', 0, true),
      ratgeberKey(WOCHE, 'mid'),
      helferKey(WOCHE, 'we', 'mik', 0),
      fsKey(WOCHE, 'i7'),
    ]
    for (const key of alle) {
      expect(praefixe.some((p) => key.startsWith(p)), key).toBe(true)
    }
    // Eine andere Woche fängt sich nicht mit ein.
    expect(praefixe.some((p) => punktKey('2026-09-14', 'mid', 'k3f9x', 0).startsWith(p))).toBe(false)
  })

  it('die Wochenkennung ist eine Form, keine Datumsprüfung', () => {
    expect(istWochenKennung('2026-09-07')).toBe(true)
    expect(istWochenKennung('60')).toBe(false)
    // Bewusst geduldet: ein zu strenger Test verwürfe im Zweifel echte Schlüssel.
    expect(istWochenKennung('2026-13-45')).toBe(true)
  })
})
