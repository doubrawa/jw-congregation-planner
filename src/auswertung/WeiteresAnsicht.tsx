import type { MeetingKey } from '../data/types'
import { fill } from '../i18n/useT'
import { MiniBalken } from './Diagramme'
import type { Kontext } from './kontext'

/**
 * **Absagen je Bereich** (Entwurf `HandyMehr`, T126): wie viele Zuteilungen
 * jedes Bereichs abgesagt wurden, gegen alle seine Zuteilungen. Ein Bereich
 * mit auffällig vielen steht in der Problemfarbe (wie sein Hinweis).
 */
function AbsagenKarte({ k }: { k: Kontext }) {
  const { t, a } = k
  const auffaellig = new Set(a.hinweise.flatMap((h) => (h.art === 'absagen' ? [h.bereich] : [])))
  const max = Math.max(1, ...a.absagen.map((z) => z.n))
  return (
    <section className="karte aw-gruppe" aria-label={t.awAbsagenTitel}>
      <h2 className="aw-gruppe-kopf">{t.awAbsagenTitel}</h2>
      {a.absagen.length === 0 ? (
        <p className="aw-leer">{t.awKeineAbsagen}</p>
      ) : (
        <ul className="aw-zeilen">
          {a.absagen.map((z) => (
            <li key={z.bereich} className="aw-zeile">
              <div className="aw-zeile-kopf">
                <span className="aw-zeile-name">{k.bereich(z.bereich)}</span>
                <span className="aw-zeile-zahl">
                  {fill(t.awAbsagenZahl, { n: k.zahl(z.n) })} · {fill(t.awAnteilVon, { anteil: k.prozent(z.anteil), m: k.zahl(z.von) })}
                </span>
              </div>
              <MiniBalken n={z.n} max={max} auffaellig={auffaellig.has(z.bereich)} />
            </li>
          ))}
        </ul>
      )}
      <p className="klein-text">{t.awAbsagenText}</p>
    </section>
  )
}

/**
 * **Treffpunkte, Absagen, Ballungen** (Entwurf `HandyMehr`): wer die
 * Zusammenkünfte für den Predigtdienst leitet, je Gruppe — wo abgesagt wurde —
 * und wo jemand zweimal in einer Zusammenkunft oder drei Wochen hintereinander
 * im selben Bereich dran war.
 */
export function WeiteresAnsicht({ k }: { k: Kontext }) {
  const { t, a } = k
  // Die kurze Form — „Zusammenkunft unter der Woche" passte nicht in das Kästchen.
  const tabName = (tab: MeetingKey): string => (tab === 'mid' ? t.unterDerWoche : t.amWochenende)
  const max = Math.max(1, ...a.treffpunkte.flatMap((g) => g.zeilen.map((z) => z.n)))

  return (
    <div className="aw-ansicht">
      <section className="karte aw-gruppe" aria-label={t.awTreffpunkteTitel}>
        <h2 className="aw-gruppe-kopf">{t.awTreffpunkteTitel}</h2>
        <p className="klein-text">{t.awTreffpunkteText}</p>
        {a.treffpunkte.length === 0 && <p className="aw-leer">{t.awKeineTreffpunkte}</p>}
        {a.treffpunkte.map((g) => (
          <div key={g.gruppe ?? ''} className="aw-treffpunkt-gruppe">
            <h3 className="abschnitt-titel">{k.gruppe(g.gruppe)}</h3>
            <ul className="aw-bereiche">
              {g.zeilen.map((z) => (
                <li key={z.pid} className="aw-bereich">
                  <button type="button" className="aw-zeile-name" onClick={() => k.personOeffnen(z.pid)}>
                    {k.name(z.pid)}
                  </button>
                  <MiniBalken n={z.n} max={max} />
                  <span className={z.n === 0 ? 'aw-bereich-zahl is-nie' : 'aw-bereich-zahl'}>{z.n === 0 ? t.awNie : k.zahl(z.n)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <AbsagenKarte k={k} />

      <section className="karte aw-gruppe" aria-label={t.awBallungenTitel}>
        <h2 className="aw-gruppe-kopf">{t.awBallungenTitel}</h2>
        {a.ballungen.zweimal.length + a.ballungen.folge.length === 0 && <p className="aw-leer">{t.awKeineBallungen}</p>}
        {a.ballungen.zweimal.length > 0 && (
          <>
            <h3 className="abschnitt-titel">{t.awZweimal}</h3>
            <ul className="aw-ballungen">
              {a.ballungen.zweimal.map((b) => (
                <li key={`${b.pid}|${b.start}|${b.tab}`} className="aw-ballung">
                  <span className="aw-ballung-wann">
                    <span className="klein-text">{tabName(b.tab)}</span>
                    <span>{k.datum(b.start)}</span>
                  </span>
                  <span className="aw-ballung-was">
                    <button type="button" className="aw-zeile-name" onClick={() => k.personOeffnen(b.pid)}>
                      {k.name(b.pid)}
                    </button>
                    <span className="klein-text">{b.bereiche.map((x) => (x ? k.bereich(x) : '')).filter(Boolean).join(', ')}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {a.ballungen.folge.length > 0 && (
          <>
            <h3 className="abschnitt-titel">{t.awHintereinander}</h3>
            <ul className="aw-ballungen">
              {a.ballungen.folge.map((b) => (
                <li key={`${b.pid}|${b.bereich}|${b.ab}`} className="aw-ballung">
                  <span className="aw-ballung-wann">
                    <span>{k.datum(b.ab)}</span>
                  </span>
                  <span className="aw-ballung-was">
                    <button type="button" className="aw-zeile-name" onClick={() => k.personOeffnen(b.pid)}>
                      {k.name(b.pid)}
                    </button>
                    <span className="klein-text">{fill(t.awFolgeText, { bereich: k.bereich(b.bereich), dauer: k.dauer(b.wochen) })}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
