import { useMemo } from 'react'
import { OBERE_GRENZE, personBild, lageVon } from '../data/auswertung'
import type { AbsenceSet } from '../data/absence'
import type { Person, Week } from '../data/types'
import { fill } from '../i18n/useT'
import { Legende, VergleichsBalken, WochenFelder } from './Diagramme'
import { gerundet, type Kontext } from './kontext'

/** In Reihen zu je dreizehn Wochen — ein Vierteljahr je Reihe. */
const REIHE = 13

/**
 * **Eine Person** (Entwurf `HandyPerson`): ihre Zuteilungen gegen die Erwartung,
 * die Wochen des Zeitraums als Felder und je Bereich, wie oft und wann zuletzt.
 */
export function PersonAnsicht({
  k,
  pid,
  weeks,
  persons,
  abwesend,
}: {
  k: Kontext
  pid: string
  weeks: readonly Week[]
  persons: readonly Person[]
  abwesend: AbsenceSet
}) {
  const { t } = k
  const bild = useMemo(() => personBild(k.a.grundlage, weeks, persons, abwesend, pid), [k.a.grundlage, weeks, persons, abwesend, pid])
  if (!bild) return null
  const starts = k.a.grundlage.fenster.montage
  const reihen = []
  for (let von = 0; von < bild.wochen.length; von += REIHE) {
    const erste = starts[von] ?? ''
    const letzte = starts[Math.min(von + REIHE, bild.wochen.length) - 1] ?? erste
    reihen.push({ von, label: erste === letzte ? k.datum(erste) : `${k.datum(erste)} – ${k.datum(letzte)}` })
  }
  const wochenAria = fill(t.awWochenBild, {
    name: k.name(pid),
    a: k.zahl(bild.aufgaben),
    h: k.zahl(bild.hilfsdienste),
    w: k.zahl(bild.abwesend),
  })

  return (
    <div className="aw-ansicht">
      <section aria-label={k.name(pid)} className="karte aw-kennzahlen is-vier">
        <div className="aw-kennzahl">
          <span className="aw-kennzahl-wert">{k.zahl(bild.aufgaben)}</span>
          <span className="aw-kennzahl-text">{fill(t.awAufgabenErwartet, { e: k.zahl(gerundet(bild.erwartetAufgaben)) })}</span>
        </div>
        <div className="aw-kennzahl">
          <span className="aw-kennzahl-wert">{k.zahl(bild.hilfsdienste)}</span>
          <span className="aw-kennzahl-text">{t.awHilfsdienste}</span>
        </div>
        <div className="aw-kennzahl">
          <span className="aw-kennzahl-wert">{k.zahl(bild.abwesend)}</span>
          <span className="aw-kennzahl-text">{t.awAbwesend}</span>
        </div>
        <div className="aw-kennzahl">
          <span className="aw-kennzahl-wert">{k.zahl(bild.absagen)}</span>
          <span className="aw-kennzahl-text">{t.awAbsagen}</span>
        </div>
      </section>

      <section className="karte aw-gruppe" aria-label={wochenAria}>
        {/* So viele Wochen, wie Felder dastehen — die App kennt nicht immer den ganzen Zeitraum. */}
        <h2 className="aw-gruppe-kopf">{fill(t.awLetzte, { dauer: k.dauer(bild.wochen.length) })}</h2>
        <WochenFelder wochen={bild.wochen} reihen={reihen} />
        <Legende
          eintraege={[
            ['aufgabe', t.awAufgabe],
            ['hilfsdienst', t.awHilfsdienst],
            ['abwesend', t.awAbwesendKurz],
          ]}
        />
      </section>

      <section className="karte aw-gruppe" aria-label={t.awJeBereich}>
        <h2 className="aw-gruppe-kopf">{t.awJeBereich}</h2>
        <ul className="aw-zeilen">
          {bild.bereiche.map((b) => {
            const lage = lageVon(b.n, b.erwartet)
            const wann = b.vorWochen === null ? t.awNieImZeitraum : fill(t.awZuletztVor, { dauer: k.dauer(b.vorWochen) })
            return (
              <li key={b.bereich} className="aw-zeile">
                <div className="aw-zeile-kopf">
                  <span className="aw-zeile-name">{k.bereich(b.bereich)}</span>
                  <span className="aw-zeile-zahl">{fill(t.awNErwartet, { n: k.zahl(b.n), e: k.zahl(gerundet(b.erwartet)) })}</span>
                </div>
                <span className="klein-text">{wann}</span>
                <VergleichsBalken
                  n={b.n}
                  erwartet={b.erwartet}
                  lage={lage}
                  max={Math.max(1, b.n, OBERE_GRENZE * b.erwartet) * 1.1}
                  aria={`${k.bereich(b.bereich)}: ${fill(t.awNErwartet, { n: k.zahl(b.n), e: k.zahl(gerundet(b.erwartet)) })}`}
                />
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
