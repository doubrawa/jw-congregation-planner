import { describe, expect, it } from 'vitest'

/**
 * Vollständigkeitsprobe: **die Formen der `task_key` sind bekannt.**
 *
 * Seit `migration-022` entscheidet die **Datenbank**, ob eine Bestätigung zur
 * eigenen Aufgabe gehört (T89). Dafür zerlegt eine SQL-Funktion den Schlüssel —
 * sie kennt genau die Formen, die es beim Schreiben der Migration gab, und
 * lässt unbekannte Formen bewusst durch (eine zu strenge Richtlinie bräche das
 * Bestätigen fast lautlos).
 *
 * Genau daraus entsteht die Rostgefahr: Käme eine siebte Form dazu, fiele sie
 * still in den Durchlass — die Lücke wäre für sie wieder offen, und niemandem
 * fiele es auf. Diese Probe liest die Schlüssel-Erzeuger im Quelltext und
 * verlangt, dass die Menge unverändert ist. Wer eine Form ergänzt oder ändert,
 * wird hierher geführt und zieht die Migration mit.
 *
 * Sie liest den Quelltext als Text — wie `alle-plaetze`, `aufgaben-label-quelle`
 * und `klassennamen`.
 */
const ROH = import.meta.glob('./{planning,fs}.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** `${woche}|${tab}|helper|${svc}|${pos}` → `<>|<>|helper|<>|<>`. */
function form(vorlage: string): string {
  return vorlage.replace(/\$\{[^}]*\}/g, '<>')
}

/**
 * Jede Funktion `…TaskKey` mit der Zeichenkette, die sie zurückgibt.
 * `slotTaskKey` wählt nur zwischen zwei anderen und baut selbst keine — sie
 * taucht deshalb ohne Vorlage auf und ist hier nicht erfasst.
 */
function erzeuger(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const quelle of Object.values(ROH)) {
    for (const treffer of quelle.matchAll(/export function (\w*TaskKey)\(([\s\S]*?)\n\}/g)) {
      const name = treffer[1]!
      const rumpf = treffer[2]!
      const vorlage = /return `([^`]+)`/.exec(rumpf)
      if (vorlage?.[1]) out[name] = form(vorlage[1])
    }
  }
  return out
}

describe('Formen der task_key — bekannt in migration-022', () => {
  it('es sind genau diese fünf Vorlagen', () => {
    /*
     * Die Tabelle steht wörtlich so im Kopf von
     * `supabase/migration-022-nur-eigene-aufgaben-bestaetigen.sql`. Ändert sich
     * hier etwas, muss es dort mit — sonst prüft die Datenbank einen Weg, den
     * es nicht mehr gibt, und lässt den neuen ungeprüft durch.
     *
     * `part` und `aux` teilen sich die Vorlage (die Art steht als Ausdruck
     * drin), deshalb fünf Erzeuger für sechs Formen.
     */
    expect(erzeuger()).toEqual({
      partTaskKey: '<>|<>|<>|<>|<>|<>', // alte Position: Abschnitt, Punkt, Platz
      itemTaskKey: '<>|<>|<>|<>|<>', // stabile Kennung des Punkts (T37)
      ratgeberTaskKey: '<>|<>|ratgeber',
      helperTaskKey: '<>|<>|helper|<>|<>',
      fsTaskKey: 'fs|<>|<>',
    })
  })

  it('die beiden Programmpunkt-Formen bleiben an der Feldzahl unterscheidbar', () => {
    // Darauf beruht sowohl die Lade-Migration (T37) als auch der SQL-Zweig:
    // fünf Felder = stabile Kennung, sechs = Position.
    const e = erzeuger()
    expect(e.itemTaskKey?.split('|')).toHaveLength(5)
    expect(e.partTaskKey?.split('|')).toHaveLength(6)
  })
})
