import type { ReactNode } from 'react'
import type { SectionColor } from '../data/types'
import { Balken } from './DruckBlatt'

/** Eine Zeile einer Drucktabelle: ihre Zellen. */
export interface DruckZeile {
  key: string
  zellen: ReactNode[]
}

/** Wie eine Drucktabelle aussieht — alles außer ihren Zeilen. */
export interface TabellenForm {
  titel?: string
  farbe?: SectionColor
  spalten: string
  kopf: readonly string[]
  betont?: number
  leise?: number
}

/**
 * **Eine Tabelle auf einem Druckbogen** (Entwürfe `GDruckTreffpunkte`,
 * `GDruckPlaene`): Überschrift mit Farbbalken, Spaltenköpfe, je Zeile eine
 * Linie darüber. Eine Spalte ist die, auf die es ankommt — wer leitet, wer dran
 * ist — und steht fett (`betont`, sonst die letzte); was nur erläutert, steht
 * leise (`leise`).
 *
 * `spalten` ist das Raster (`grid-template-columns`), weil jede Tabelle andere
 * Breiten braucht: eine Uhrzeit ist schmal, ein Treffpunkt nicht.
 */
export function DruckTabelle({ zeilen, ...form }: TabellenForm & { zeilen: readonly DruckZeile[] }) {
  return (
    <section className="druck-tabelle" data-farbe={form.farbe ?? 'neutral'}>
      {form.titel && (
        <h2 className="druck-tabelle-titel">
          <Balken />
          {form.titel}
        </h2>
      )}
      <div className="druck-tabelle-zeile druck-tabelle-zeile--kopf" style={{ gridTemplateColumns: form.spalten }}>
        {form.kopf.map((k, i) => (
          <span key={i}>{k}</span>
        ))}
      </div>
      {zeilen.map((zeile) => (
        <TabellenZeile key={zeile.key} form={form} zeile={zeile} />
      ))}
    </section>
  )
}

/** Eine Zeile — für sich, wenn die Tabelle auf dem nächsten Blatt weiterläuft (`tabellenBloecke`). */
export function TabellenZeile({ form, zeile }: { form: TabellenForm; zeile: DruckZeile }) {
  const { spalten, kopf, betont = kopf.length - 1, leise } = form
  const klasse = (i: number) => (i === betont ? 'is-betont' : i === leise ? 'druck-leise' : undefined)
  return (
    <div className="druck-tabelle-zeile" style={{ gridTemplateColumns: spalten }}>
      {zeile.zellen.map((zelle, i) => (
        <span key={i} className={klasse(i)}>
          {zelle}
        </span>
      ))}
    </div>
  )
}
