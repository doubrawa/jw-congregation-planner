import { Fragment } from 'react'
import { useApp } from '../app/context'
import { datumsFormat } from '../components/datum-anzeige'
import { fromIso, tagNach } from '../data/meeting-dates'
import { termineSortiert, trolleysSortiert } from '../data/trolleys'
import { fill, useT } from '../i18n/useT'
import { nameVon, zeitSpanne } from '../trolleys/trolley-anzeige'
import { Bogen } from './Bogen'

/** Zwei Wochen ab dem Montag — so weit plant man am Aushang (Entwurf `GDruckTrolleys`). */
const TAGE = 14

/**
 * **Die Trolleys über zwei Wochen** (T121, Phase 9; Entwurf `GDruckTrolleys`):
 * je Tag eine Zeile, je Trolley eine Spalte — so sieht man am Aushang auch,
 * wann noch frei ist. Gestrichelt steht, wo jemand einen Partner sucht. Unter
 * dem Raster die Hinweise der Trolleys („Schlüssel im Fach …") und dass die
 * App am Vortag erinnert.
 *
 * Ab dem Montag der Woche, die gerade angezeigt wird.
 */
export function TrolleyBogen({ montag }: { montag: string }) {
  const { state } = useApp()
  const { t } = useT()
  const trolleys = trolleysSortiert(state.trolleys)
  const termine = termineSortiert(state.trolleyTermine)
  const tage = Array.from({ length: TAGE }, (_unused, i) => tagNach(montag, i))
  const tagText = datumsFormat(state.lang, 'wochentagZahl')
  const zeitraum = datumsFormat(state.lang, 'tagMonatJahr').formatRange(fromIso(montag), fromIso(tagNach(montag, TAGE - 1)))
  const spalten = { gridTemplateColumns: `74px repeat(${Math.max(trolleys.length, 1)}, minmax(0, 1fr))` }
  const mitHinweis = trolleys.filter((trolley) => trolley.hinweis.trim())

  const inhalt = (
    <section className="druck-trolleys">
      <p className="druck-trolley-intro">{fill(t.druckTrolleyIntro, { weg: `${t.tabFs} · ${t.fsTrolleysTab}` })}</p>
      <div className="druck-trolley-zeile druck-trolley-zeile--kopf" style={spalten}>
        <span />
        {trolleys.map((trolley) => (
          <span key={trolley.id} className="druck-trolley-kopf">
            <span className="druck-trolley-name" dir="auto">
              {trolley.name}
            </span>
            {/* Ohne Ort kein „abholen:" ins Leere — wie in der Karte der Trolleys. */}
            {trolley.ort && <span className="druck-leise">{fill(t.trolleyAbholen, { ort: trolley.ort })}</span>}
          </span>
        ))}
      </div>
      {tage.map((tag, i) => (
        <div key={tag} className={i === 7 ? 'druck-trolley-zeile is-neue-woche' : 'druck-trolley-zeile'} style={spalten}>
          <span className="druck-trolley-tag">{tagText.format(fromIso(tag))}</span>
          {trolleys.map((trolley) => (
            <span key={trolley.id} className="druck-trolley-zelle">
              {termine
                .filter((termin) => termin.trolleyId === trolley.id && termin.datum === tag)
                .map((termin) => (
                  <span key={termin.id} className={termin.partner ? 'druck-termin' : 'druck-termin is-gesucht'}>
                    <span className="druck-leise">{zeitSpanne(termin)}</span>
                    <span>
                      <span className="druck-name">{nameVon(state.persons, termin.pid)}</span>
                      {' · '}
                      {termin.partner ? (
                        <span className="druck-name">{nameVon(state.persons, termin.partner)}</span>
                      ) : (
                        <span className="druck-gesucht">{t.trolleyPartnerGesucht}</span>
                      )}
                    </span>
                  </span>
                ))}
            </span>
          ))}
        </div>
      ))}
      <p className="druck-hinweis">
        {mitHinweis.map((trolley) => (
          <Fragment key={trolley.id}>
            <span dir="auto">{trolley.name}</span> · <span dir="auto">{trolley.hinweis}</span>
            <br />
          </Fragment>
        ))}
        {t.erinTrolleyVortag}
      </p>
    </section>
  )
  return <Bogen titel={t.fsTrolleysTab} zeitraum={zeitraum} bloecke={[{ key: montag, inhalt }]} />
}
