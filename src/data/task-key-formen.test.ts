import { describe, expect, it } from 'vitest'

/**
 * Vollständigkeitsprobe: **die Formen der `task_key` sind bekannt.**
 *
 * Die **Datenbank** entscheidet, ob eine Bestätigung zur eigenen Aufgabe gehört
 * (T89, `task_gehoert_mir` in `supabase/schema.sql`). Dafür zerlegt eine
 * SQL-Funktion den Schlüssel — sie kennt genau die Formen, die es beim
 * Schreiben gab, und lässt unbekannte Formen bewusst durch (eine zu strenge
 * Richtlinie bräche das Bestätigen fast lautlos).
 *
 * Genau daraus entsteht die Rostgefahr: Käme eine fünfte Form dazu, fiele sie
 * still in den Durchlass — die Lücke wäre für sie wieder offen, und niemandem
 * fiele es auf. Diese Probe liest die Schlüssel-Erzeuger im Quelltext und
 * verlangt, dass die Menge unverändert ist. Wer eine Form ergänzt oder ändert,
 * wird hierher geführt und zieht das Schema mit.
 *
 * Sie liest den Quelltext als Text — wie `alle-plaetze`, `aufgaben-label-quelle`
 * und `klassennamen`. Gelesen wird seit September 2026 das **geteilte** Modul:
 * Dort stehen die Erzeuger seither einmal, statt verteilt auf `planning.ts`,
 * `fs.ts` und die Edge Functions.
 */
const ROH = import.meta.glob('../../supabase/functions/_shared/aufgaben-schluessel.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** `${woche}|${tab}|helper|${svc}|${pos}` → `<>|<>|helper|<>|<>`. */
function form(vorlage: string): string {
  return vorlage.replace(/\$\{[^}]*\}/g, '<>')
}

/**
 * Bausteine: Helfer, die selbst ein Stück Schlüssel liefern (`punktStamm`).
 * Ein Erzeuger darf sie einsetzen, statt das Format ein zweites Mal
 * hinzuschreiben — die Probe muss sie dann aber auflösen, sonst liest sie
 * `<><>` und hält das für eine gültige Form.
 */
function bausteine(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const quelle of Object.values(ROH)) {
    for (const treffer of quelle.matchAll(/\n(?:export )?function (\w+)\(([\s\S]*?)\n\}/g)) {
      const vorlage = /return `([^`]+)`/.exec(treffer[2]!)
      if (vorlage?.[1]) out[treffer[1]!] = vorlage[1]
    }
  }
  return out
}

/** Jede Funktion `…Key` mit der Zeichenkette, die sie zurückgibt. */
function erzeuger(): Record<string, string> {
  const teile = bausteine()
  const out: Record<string, string> = {}
  for (const quelle of Object.values(ROH)) {
    for (const treffer of quelle.matchAll(/export function (\w+Key)\(([\s\S]*?)\n\}/g)) {
      const name = treffer[1]!
      const vorlage = /return `([^`]+)`/.exec(treffer[2]!)
      if (!vorlage?.[1]) continue
      // `${punktStamm(…)}` durch das Literal des Bausteins ersetzen.
      const aufgeloest = vorlage[1].replace(/\$\{(\w+)\([^}]*\)\}/g, (ganz, fn: string) =>
        teile[fn] ?? ganz,
      )
      out[name] = form(aufgeloest)
    }
  }
  return out
}

describe('Formen der task_key — bekannt im Schema', () => {
  it('es sind genau diese vier Vorlagen', () => {
    /*
     * Die Tabelle steht wörtlich so über `task_gehoert_mir` in
     * `supabase/schema.sql`. Ändert sich hier etwas, muss es dort mit — sonst
     * prüft die Datenbank einen Weg, den es nicht mehr gibt, und lässt den
     * neuen ungeprüft durch.
     *
     * `part` und `aux` teilen sich die Vorlage (die Art steht als Ausdruck
     * drin), deshalb vier Erzeuger für fünf Formen.
     *
     * **Eine fünfte stand hier bis zum 17. September 2026**: `partTaskKey`,
     * der positionsbasierte Schlüssel. Er fiel mit der Altlasten-Räumung weg —
     * jeder Programmpunkt trägt seine Kennung seit dem Import.
     */
    expect(erzeuger()).toEqual({
      punktKey: '<>|<>|<>|<>|<>', // stabile Kennung des Punkts (T37)
      ratgeberKey: '<>|<>|ratgeber',
      helferKey: '<>|<>|helper|<>|<>',
      fsKey: 'fs|<>|<>',
    })
  })

  it('der Programmpunkt-Schlüssel hat fünf Felder', () => {
    // Darauf beruht der SQL-Zweig: Woche, Zusammenkunft, Raum, Kennung, Platz.
    expect(erzeuger().punktKey?.split('|')).toHaveLength(5)
  })
})
