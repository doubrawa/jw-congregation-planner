import { useId, useState } from 'react'
import { ZEITRAUM_WOCHEN } from '../data/auswertung'
import { fill } from '../i18n/useT'
import { Legende, Streifen, WarteBalken } from './Diagramme'
import { gerundet, type Kontext } from './kontext'

/** So viele stehen unter „Wartet am längsten", bevor „Alle zeigen" den Rest bringt. */
const WARTEN_SICHTBAR = 8

/**
 * **Wartezeiten** (Entwurf `HandyWartezeiten`): je Bereich, wer am längsten nicht
 * dran war — gegen den üblichen Abstand —, und wer schnell wieder dran ist.
 * Der Bereich steht in einer Auswahl: Eine Versammlung hat leicht ein Dutzend.
 */
export function WartezeitenAnsicht({ k }: { k: Kontext }) {
  const { t } = k
  const auswahlId = useId()
  const bereiche = [...k.a.wartezeiten].sort((a, b) => k.bereich(a.bereich).localeCompare(k.bereich(b.bereich), k.lang))
  // Vorgewählt ist der Bereich des ersten Hinweises „wartet lange", sonst der erste.
  const vorwahl = k.a.hinweise.find((h) => h.art === 'wartet')
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [alle, setAlle] = useState(false)
  const w = bereiche.find((b) => b.bereich === (gewaehlt ?? (vorwahl?.art === 'wartet' ? vorwahl.bereich : null))) ?? bereiche[0]
  if (!w) return <p className="karte aw-leer">{t.awKeineDaten}</p>
  const max = ZEITRAUM_WOCHEN[k.a.zeitraum]
  const warten = alle ? w.warten : w.warten.slice(0, WARTEN_SICHTBAR)

  return (
    <div className="aw-ansicht">
      <div className="blatt-feld">
        <label className="feld-marke" htmlFor={auswahlId}>
          {t.awBereich}
        </label>
        <select
          id={auswahlId}
          className="feld-wahl"
          value={w.bereich}
          onChange={(e) => {
            setGewaehlt(e.target.value)
            setAlle(false)
          }}
        >
          {bereiche.map((b) => (
            <option key={b.bereich} value={b.bereich}>
              {k.bereich(b.bereich)}
            </option>
          ))}
        </select>
      </div>
      <p className="aw-erklaerung">
        {w.ueblich === null ? t.awUeblichKeins : fill(t.awUeblichText, { ueblich: k.dauer(gerundet(w.ueblich)) })}
      </p>

      {w.ueblich !== null && (
        <section className="karte aw-gruppe" aria-label={t.awWartetLaengsten}>
          <h2 className="aw-gruppe-kopf">{t.awWartetLaengsten}</h2>
          <div className="aw-achse" aria-hidden="true">
            <span>0</span>
            <span>{k.zahl(max / 2)}</span>
            <span>{k.dauer(max)}</span>
          </div>
          <ul className="aw-zeilen">
            {warten.map((z) => {
              const wann = z.wochen === null ? t.awNieImZeitraum : fill(t.awSeit, { dauer: k.dauer(z.wochen) })
              return (
                <li key={z.pid} className="aw-zeile">
                  <div className="aw-zeile-kopf">
                    <button type="button" className="aw-zeile-name" onClick={() => k.personOeffnen(z.pid)}>
                      {k.name(z.pid)}
                    </button>
                    <span className="aw-zeile-zahl">
                      {wann}
                      {z.zuletzt && ` · ${k.datum(z.zuletzt)}`}
                    </span>
                  </div>
                  <WarteBalken wochen={z.wochen} ueblich={w.ueblich ?? 0} max={max} aria={`${k.name(z.pid)}: ${wann}`} />
                </li>
              )
            })}
          </ul>
          {w.warten.length > WARTEN_SICHTBAR && (
            <button type="button" className="knopf-pille aw-mehr" aria-expanded={alle} onClick={() => setAlle(!alle)}>
              {alle ? t.awWeniger : t.awAlleZeigen}
            </button>
          )}
          <Legende
            eintraege={[
              ['strich', `${t.awUeblich}: ${k.dauer(gerundet(w.ueblich))}`],
              ['band', t.awBisDoppelt],
              ['ueber', t.awLaenger],
              ['leer', t.awNieImZeitraum],
            ]}
          />
        </section>
      )}

      {w.schnell.length > 0 && (
        <section className="karte aw-gruppe" aria-label={t.awSchnellTitel}>
          <h2 className="aw-gruppe-kopf">{t.awSchnellTitel}</h2>
          <p className="klein-text">{t.awSchnellText}</p>
          <ul className="aw-zeilen">
            {w.schnell.map((s) => {
              const takt = fill(t.awAlleDauer, { dauer: k.dauer(gerundet(s.abstand)) })
              return (
                <li key={s.pid} className="aw-zeile">
                  <div className="aw-zeile-kopf">
                    <button type="button" className="aw-zeile-name" onClick={() => k.personOeffnen(s.pid)}>
                      {k.name(s.pid)}
                    </button>
                    <span className="aw-zeile-zahl">
                      {takt} · {fill(t.awMale, { n: k.zahl(s.mal) })}
                    </span>
                  </div>
                  <Streifen wochen={s.wochen} aria={`${k.name(s.pid)}: ${takt}`} />
                </li>
              )
            })}
          </ul>
          <p className="klein-text">{t.awStreifenText}</p>
        </section>
      )}
    </div>
  )
}
