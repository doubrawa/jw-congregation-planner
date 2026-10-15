import type { ReactNode } from 'react'
import type { SectionColor } from '../data/types'
import { Balken } from './DruckBlatt'

/** Eine Zeile einer Drucktabelle: ihre Zellen, die letzte steht fett (der Name). */
export interface DruckZeile {
  key: string
  zellen: ReactNode[]
}

/**
 * **Eine Tabelle auf einem Druckbogen** (Entwürfe `GDruckTreffpunkte`,
 * `GDruckPlaene`): Überschrift mit Farbbalken, Spaltenköpfe, je Zeile eine
 * Linie darüber. Die letzte Spalte ist die, auf die es ankommt — wer leitet,
 * wer dran ist — und steht fett.
 *
 * `spalten` ist das Raster (`grid-template-columns`), weil jede Tabelle andere
 * Breiten braucht: eine Uhrzeit ist schmal, ein Treffpunkt nicht.
 */
export function DruckTabelle({
  titel,
  farbe,
  spalten,
  kopf,
  zeilen,
}: {
  titel?: string
  farbe?: SectionColor
  spalten: string
  kopf: readonly string[]
  zeilen: readonly DruckZeile[]
}) {
  return (
    <section className="druck-tabelle" data-farbe={farbe ?? 'neutral'}>
      {titel && (
        <h2 className="druck-tabelle-titel">
          <Balken />
          {titel}
        </h2>
      )}
      <div className="druck-tabelle-zeile druck-tabelle-zeile--kopf" style={{ gridTemplateColumns: spalten }}>
        {kopf.map((k, i) => (
          <span key={i}>{k}</span>
        ))}
      </div>
      {zeilen.map((zeile) => (
        <div key={zeile.key} className="druck-tabelle-zeile" style={{ gridTemplateColumns: spalten }}>
          {zeile.zellen.map((zelle, i) => (
            <span key={i}>{zelle}</span>
          ))}
        </div>
      ))}
    </section>
  )
}
