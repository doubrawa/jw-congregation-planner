import { useId, useMemo, useState } from 'react'
import { Wahl } from '../bausteine/Wahl'
import { QUALIFICATION_ORDER } from '../data/constants'
import { istEinseitig, matrix, type EinseitigZeile } from '../data/auswertung'
import { serviceQualKey } from '../data/helpers'
import type { Person, Service } from '../data/types'
import { fill } from '../i18n/useT'
import { Legende, MiniBalken } from './Diagramme'
import { einseitigText } from './hinweis-texte'
import type { Kontext } from './kontext'

type Filter = 'auffaellig' | 'alle'

/** Eine Karte je Person: ihre Bereiche untereinander, der überwiegende hervorgehoben. */
function PersonKarte({ z, k }: { z: EinseitigZeile; k: Kontext }) {
  const max = Math.max(1, ...z.bereiche.map((b) => b.n))
  const nieMitSchnitt = z.bereiche.filter((b) => z.nie.includes(b.bereich))
  return (
    <section className="karte aw-person-karte" aria-label={k.name(z.pid)}>
      <button type="button" className="aw-karte-kopf" onClick={() => k.personOeffnen(z.pid)}>
        <span className="aw-karte-name">{k.name(z.pid)}</span>
        <span className="klein-text">{einseitigText(z, k)}</span>
      </button>
      <ul className="aw-bereiche">
        {z.bereiche.map((b) => (
          <li key={b.bereich} className="aw-bereich">
            <span className="aw-bereich-name">{k.bereich(b.bereich)}</span>
            <MiniBalken n={b.n} max={max} hervor={b.bereich === z.ueberwiegt} />
            <span className={b.n === 0 ? 'aw-bereich-zahl is-nie' : 'aw-bereich-zahl'}>{b.n === 0 ? k.t.awNie : k.zahl(b.n)}</span>
          </li>
        ))}
      </ul>
      {nieMitSchnitt.map((b) => (
        <p key={b.bereich} className="klein-text">
          {fill(k.t.awNieSchnitt, { bereich: k.bereich(b.bereich), n: k.zahl(Math.round(b.schnittAndere * 10) / 10) })}
        </p>
      ))}
    </section>
  )
}

/**
 * **Einseitig verteilt** am Handy (Entwurf `HandyEinseitig`): wer zwei Drittel in
 * einem Bereich hat oder in einem eigenen nie dran war — auf Wunsch alle.
 */
export function EinseitigKarten({ k }: { k: Kontext }) {
  const [filter, setFilter] = useState<Filter>('auffaellig')
  const zeilen = filter === 'auffaellig' ? k.a.einseitig.filter(istEinseitig) : k.a.einseitig
  const auffaellig = k.a.einseitig.filter(istEinseitig).length
  return (
    <div className="aw-ansicht">
      <p className="aw-erklaerung">{k.t.awEinseitigErklaerung}</p>
      <Wahl
        label={k.t.awEinseitigTitel}
        optionen={[
          { wert: 'auffaellig' as const, text: `${k.t.awAuffaellig} · ${k.zahl(auffaellig)}` },
          { wert: 'alle' as const, text: `${k.t.awAlle} · ${k.zahl(k.a.einseitig.length)}` },
        ]}
        wert={filter}
        onWahl={setFilter}
      />
      {zeilen.length === 0 ? (
        <p className="karte aw-leer">{k.t.awNichtsAuffaellig}</p>
      ) : (
        zeilen.map((z) => <PersonKarte key={z.pid} z={z} k={k} />)
      )}
    </div>
  )
}

/** Die Stufe einer Zahl in der Tabelle: 1–3, 4–9, 10 und mehr. */
function stufe(n: number): string {
  if (n >= 10) return 'aw-zelle is-stufe3'
  if (n >= 4) return 'aw-zelle is-stufe2'
  return 'aw-zelle is-stufe1'
}

/**
 * **Wer bekommt was** ab dem Tablet (Entwurf `TabletEinseitig`): Person × Bereich
 * als Felder — gestrichelt, wo jemand den Bereich hat und nie dran war, ein
 * Strich, wo er ihn nicht hat. Sie rollt nicht: Die Bereiche teilen sich die
 * Breite, ihre Köpfe stehen senkrecht (`auswertung.css`).
 */
export function EinseitigMatrix({ k, persons, services }: { k: Kontext; persons: readonly Person[]; services: readonly Service[] }) {
  const m = useMemo(
    () => matrix(k.a.grundlage, persons, k.a.einseitig, [...QUALIFICATION_ORDER, ...services.map((s) => serviceQualKey(s.key))]),
    [k.a, persons, services],
  )
  const { t } = k
  const titelId = useId()
  if (m.zeilen.length === 0) return null
  // Die Zusammenkunft kurz („Vorsitz · Unter der Woche"): Die längste Zeile
  // bestimmt, wie hoch der Kopf steht.
  const kurz: Record<string, string> = { [t.tabMid]: t.unterDerWoche, [t.tabWe]: t.amWochenende }
  const kopfZeilen = (name: string): string[] => name.split(' · ').map((teil) => kurz[teil] ?? teil)
  return (
    <section className="karte aw-matrix-karte" aria-labelledby={titelId}>
      <h2 id={titelId} className="karte-titel">
        {t.awMatrixTitel}
      </h2>
      <p className="klein-text">{t.awMatrixText}</p>
      <table className="aw-matrix">
        <colgroup>
          <col className="aw-matrix-namen" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{t.awPerson}</th>
            {m.bereiche.map((b) => {
              const name = k.bereich(b)
              // Je Baustein („Vorsitz · …", `privLabel`) eine senkrechte Zeile;
              // vorgelesen wird der ganze Name.
              return (
                <th key={b} scope="col" aria-label={name}>
                  <span className="aw-matrix-kopf" aria-hidden="true">
                    {kopfZeilen(name).map((teil, i) => (
                      <span key={i}>{teil}</span>
                    ))}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {m.zeilen.map((z) => (
            <tr key={z.pid}>
              <th scope="row">
                <button type="button" className="aw-zeile-name" onClick={() => k.personOeffnen(z.pid)}>
                  {k.name(z.pid)}
                </button>
                {z.einseitig && <span className="aw-marke-einseitig">{t.awEinseitigMarke}</span>}
              </th>
              {z.werte.map((wert, i) => {
                const bereich = m.bereiche[i] ?? ''
                const text = wert === null ? t.awOhneBereich : wert === 0 ? t.awNie : k.zahl(wert)
                const aria = fill(t.awZelle, { name: k.name(z.pid), bereich: k.bereich(bereich), wert: text })
                return (
                  <td key={bereich} aria-label={aria}>
                    {wert === null ? (
                      <span className="aw-zelle is-ohne" aria-hidden="true">
                        –
                      </span>
                    ) : wert === 0 ? (
                      <span className="aw-zelle is-nie" aria-hidden="true" />
                    ) : (
                      <span className={stufe(wert)} aria-hidden="true">
                        {k.zahl(wert)}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <Legende
        eintraege={[
          ['stufe1', '1–3'],
          ['stufe2', '4–9'],
          ['stufe3', t.awAbZehn],
          ['leer', t.awNieVorhanden],
        ]}
      />
      <p className="klein-text">– {t.awOhneBereich}</p>
    </section>
  )
}
