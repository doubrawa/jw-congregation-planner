import { useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { besuchsWocheText } from '../components/gruppenbesuch-anzeige'
import { SchichtKopf } from '../components/SchichtKopf'
import { ozNachWoche } from '../components/zeugnis-anzeige'
import { displayName, isQualified } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import {
  OZ_BEREICH,
  OZ_ERSTE_WOCHEN,
  ozAb,
  ozKannEintragen,
  ozSchichten,
  ozTaskKey,
  ozVorbei,
  ozZusage,
  type OzSchicht,
} from '../data/zeugnis'
import { fill, useT } from '../i18n/useT'
import { ZUSAGE_LABEL } from '../planen/useZusage'
import { ZusagePunkt } from '../planen/ZusageStatus'
import { AnsichtDrucken } from './AnsichtDrucken'
import '../components/zeugnis.css'

/**
 * **Öffentliches Zeugnisgeben** beim Ansehen (T120, Phase 3) — für alle.
 *
 * Die kommenden Schichten mit ihren Eingetragenen. Wer den Aufgabenbereich
 * hat, trägt sich in einen freien Platz ein und hat damit zugesagt; wer
 * zugeteilt wurde, bestätigt hier wie unter „Meine Aufgaben". Absagen gibt den
 * Platz frei, und die Admins erfahren es.
 */
export function ZeugnisAnsicht() {
  const { state } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const [alle, setAlle] = useState(false)
  const me = eigenePerson(state)
  const darf = me ? isQualified(me, OZ_BEREICH) : false

  // Nur Kommendes: Wer hier nachsieht, sucht einen Platz oder seinen nächsten Einsatz.
  const schichten = useMemo(() => {
    const heute = fromIso(tag)
    return ozSchichten(state.ozTermine, state.ozEintraege, ozAb(heute)).filter((s) => !ozVorbei(s, heute))
  }, [state.ozTermine, state.ozEintraege, tag])
  const wochen = ozNachWoche(schichten)
  const sichtbar = alle ? wochen : wochen.slice(0, OZ_ERSTE_WOCHEN)

  return (
    <>
      {/* Gedruckt wird der ganze Plan, nicht nur die ersten Wochen. */}
      <AnsichtDrucken titel={t.privZeugnis} vorbereiten={() => setAlle(true)} />
      <div className="panel panel--pb16 oz-kopf" data-farbe="neutral">
        <h2 className="panel-label">{t.privZeugnis}</h2>
        <p className="panel-hint">{darf ? t.ozAnsichtHint : t.ozNichtFreigegeben}</p>
      </div>

      {sichtbar.map(({ montag, schichten: inWoche }) => (
        <div key={montag} className="panel" data-farbe="gold">
          <h2 className="panel-label">{besuchsWocheText(montag, state.lang)}</h2>
          {inWoche.map((s) => (
            <AnsichtZeile key={`${s.termin.id}|${s.datum}`} schicht={s} darf={darf} />
          ))}
        </div>
      ))}
      {!alle && wochen.length > OZ_ERSTE_WOCHEN && (
        <button type="button" className="btn-outline oz-mehr" onClick={() => setAlle(true)}>
          {t.ozMehrWochen}
        </button>
      )}
    </>
  )
}

/**
 * Eine Schicht beim Ansehen: wer dabei ist, wie viel frei ist — und was man
 * selbst tun kann. Eine gestrichene sagt nur „Fällt aus".
 */
function AnsichtZeile({ schicht, darf }: { schicht: OzSchicht; darf: boolean }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const me = eigenePerson(state)
  const eigener = me ? schicht.eintraege.find((e) => e.pid === me.id) : undefined
  const stufe = eigener ? ozZusage(eigener, state.confirmations) : null
  const key = eigener ? ozTaskKey(eigener) : ''

  if (schicht.gestrichen) {
    return (
      <div className="oz-schicht is-gestrichen">
        <SchichtKopf schicht={schicht} />
      </div>
    )
  }

  return (
    <div className="oz-schicht">
      <SchichtKopf schicht={schicht} />
      <div className="oz-plaetze">
        {schicht.eintraege.map((eintrag) => {
          const person = state.persons.find((p) => p.id === eintrag.pid)
          return (
            <span key={eintrag.id} className="oz-person">
              {eintrag === eigener && <span className="chip-du">{t.chipDu}</span>}
              <span dir="auto">{person ? displayName(person) : t.offenWort}</span>
            </span>
          )
        })}
        {schicht.frei > 0 && <span className="oz-frei">{fill(t.ozFrei, { n: schicht.frei })}</span>}
      </div>
      {darf && ozKannEintragen(me, schicht) && (
        <button
          type="button"
          className="btn-outline oz-eintragen"
          onClick={() => dispatch({ type: 'ozEintragen', terminId: schicht.termin.id, datum: schicht.datum })}
        >
          {t.ozEintragen}
        </button>
      )}
      {eigener && stufe && (
        <div className="oz-eigen">
          <span className="oz-status">
            <ZusagePunkt stufe={stufe} />
            {eigener.selbst && stufe === 'bestätigt' ? t.ozDuEingetragen : t[ZUSAGE_LABEL[stufe]]}
          </span>
          <div className="oz-aktionen">
            {stufe === 'offen' && (
              <button type="button" className="btn-outline" onClick={() => dispatch({ type: 'confirmTask', id: key })}>
                {t.bestaetigen}
              </button>
            )}
            <button type="button" className="btn-outline" onClick={() => dispatch({ type: 'declineTask', id: key })}>
              {t.ozAbsagen}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
