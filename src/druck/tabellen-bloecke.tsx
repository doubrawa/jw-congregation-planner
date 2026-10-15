import type { ReactNode } from 'react'
import type { DruckBlock } from './Bogen'
import { DruckTabelle, TabellenZeile, type DruckZeile, type TabellenForm } from './DruckTabelle'

/**
 * **Eine Tabelle, die über mehrere Blätter gehen darf**, als Blöcke eines
 * Bogens: Zeile für Zeile, damit sie auf dem nächsten Blatt weiterläuft, statt
 * über den Rand zu gehen — ein Plan über ein Jahr hat 53 Wochen, auf ein Blatt
 * passt die Hälfte. Der erste Block trägt, was davor steht (`vorweg`), dazu
 * Überschrift und Spaltenköpfe mit der ersten Zeile: Ein Kopf steht nie allein
 * unten auf einem Blatt. Die übrigen schließen ohne Abstand an (`anschluss`).
 * Ohne Zeilen keine Tabelle.
 */
export function tabellenBloecke(
  key: string,
  form: TabellenForm,
  zeilen: readonly DruckZeile[],
  vorweg?: ReactNode,
): DruckBlock[] {
  const [erste, ...weitere] = zeilen
  if (!erste) return []
  return [
    {
      key,
      inhalt: (
        <>
          {vorweg}
          <DruckTabelle {...form} zeilen={[erste]} />
        </>
      ),
    },
    ...weitere.map((zeile) => ({
      key: `${key}|${zeile.key}`,
      anschluss: true,
      inhalt: <TabellenZeile form={form} zeile={zeile} />,
    })),
  ]
}
