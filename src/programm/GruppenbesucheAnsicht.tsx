import { useMemo } from 'react'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import {
  besuchsGruppe,
  besuchsTreffpunktText,
  besuchsWocheText,
  besucherName,
} from '../components/gruppenbesuch-anzeige'
import { besuchStand } from '../data/gruppenbesuche'
import { useBesuchsLage } from '../components/useBesuchsLage'
import { overseerGroup } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import { fill, useT } from '../i18n/useT'
import '../components/gruppenbesuche.css'

/**
 * **Gruppenbesuche des Dienstaufsehers** beim Ansehen (T120, Phase 2) — für
 * alle.
 *
 * Oben die Besuche bei der **eigenen** Gruppe mit Treffpunkt und Besucher: Die
 * Gruppe soll sich darauf einstellen können (od Kap. 5 Abs. 41 — der
 * Gruppenaufseher kündigt den Besuch an). Darunter alle kommenden Besuche, nur
 * Woche und Gruppe: Wo und wann sich eine fremde Gruppe trifft, zeigt die App
 * auch sonst nicht (`fsVisible`).
 */
export function GruppenbesucheAnsicht() {
  const { state } = useApp()
  const { t, tu } = useT()
  const tag = useKalendertag()
  const me = eigenePerson(state)
  // Die eigene Gruppe: die, in der man geführt ist — sonst die, die man leitet.
  const meineGruppe = me?.grp ?? overseerGroup(state.groups, state.personId)

  const lage = useBesuchsLage()
  const kommend = useMemo(
    () =>
      state.gruppenbesuche
        .map((besuch) => ({ besuch, stand: besuchStand(besuch, lage, fromIso(tag)) }))
        .filter(({ stand }) => stand.art !== 'vorbei'),
    [lage, state.gruppenbesuche, tag],
  )

  const beiMir = kommend.filter(({ besuch }) => besuch.grp === meineGruppe)
  const gruppe = meineGruppe ? state.groups.find((g) => g.id === meineGruppe) : undefined

  return (
    <>
      {gruppe && (
        <div className="panel" data-farbe="gold">
          <h2 className="panel-label">{`${t.gbDeineGruppe} · ${tu(gruppe.name)}`}</h2>
          {beiMir.length === 0 && <p className="prog-meta">{t.gbLeer}</p>}
          {beiMir.map(({ besuch, stand }) => {
            // Wer leitet, sagt der Satz nur, wenn es stimmt: eingetragen oder
            // vorgemerkt. Steht dort noch ein anderer Leiter, hat der Planer
            // das letzte Wort — die Gruppe soll nichts Falsches lesen.
            const zugesagt = stand.art === 'eingetragen' || stand.art === 'vorgemerkt'
            const name = zugesagt ? besucherName(besuch, state.persons) : ''
            return (
              <div key={besuch.id} className="gb-zeile">
                <div className="gb-kopf">
                  <span className="gb-woche">{besuchsWocheText(besuch.woche, state.lang)}</span>
                </div>
                {stand.treffpunkte.map((inst) => (
                  <div key={inst.id} className="gb-treffpunkt" dir="auto">
                    {besuchsTreffpunktText(besuch.woche, inst, state.lang, tu)}
                  </div>
                ))}
                {name && <p className="gb-hinweis">{fill(t.gbLeitetDann, { name })}</p>}
              </div>
            )
          })}
        </div>
      )}

      <div className="panel panel--pb16" data-farbe="neutral">
        <h2 className="panel-label">{t.gbAlle}</h2>
        {kommend.length === 0 && <p className="prog-meta">{t.gbLeer}</p>}
        {kommend.map(({ besuch }) => (
          <div key={besuch.id} className="gb-liste-zeile">
            <span className="gb-woche">{besuchsWocheText(besuch.woche, state.lang)}</span>
            <span className="gb-gruppe">{besuchsGruppe(besuch, state.groups, tu)}</span>
          </div>
        ))}
      </div>
    </>
  )
}
