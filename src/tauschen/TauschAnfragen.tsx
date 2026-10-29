import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { Punkt } from '../bausteine/Punkt'
import { displayName } from '../data/helpers'
import { anfragenAn, type TauschAnfrage } from '../data/tausch'
import { fill, useT } from '../i18n/useT'
import { usePlatzZeile } from './usePlatzZeile'
import { useTauschen, useTauschFehler } from './useTauschen'
import './tauschen.css'

/**
 * **Die Anfragen an mich** (T153) — zuoberst auf dem Start und unter „Meine
 * Aufgaben", so lange, bis ich antworte oder ihr früherer Tag vorbei ist. Wohin
 * die Glocke und der Push „Tausch angefragt" führen.
 */
export function TauschAnfragen() {
  const { state } = useApp()
  const heute = useKalendertag()
  // Offline ginge die Antwort nicht hinaus — dann fragt die Karte gar nicht erst.
  if (state.staleAt !== null) return null
  return (
    <>
      {anfragenAn(state.tauschAnfragen, state.personId, heute, state.weeks).map((a) => (
        <TauschAnfrageKarte key={a.id} anfrage={a} />
      ))}
    </>
  )
}

/**
 * Eine Anfrage: wer fragt, was ich abgebe und was ich dafür übernehme — wie im
 * Entwurf vom 29.10.2026. „Tauschen" ändert beide Plätze auf einmal, „Nein,
 * danke" sagt es dem, der gefragt hat.
 */
function TauschAnfrageKarte({ anfrage }: { anfrage: TauschAnfrage }) {
  const { state } = useApp()
  const { t } = useT()
  const tausch = useTauschen()
  const platzZeile = usePlatzZeile()
  const { fehler, ausfuehren } = useTauschFehler()
  const meiner = platzZeile(anfrage.nimmt)
  const seiner = platzZeile(anfrage.gibtAb)
  if (!meiner || !seiner) return null
  const von = state.persons.find((p) => p.id === anfrage.von)

  return (
    <section className="karte karte--held tausch-karte" aria-label={t.notifTauschAngefragt}>
      <div className="aufgabe-wann">
        <Punkt art="du" />
        <span>{fill(t.tauschFragtDich, { name: von ? displayName(von) : '' })}</span>
      </div>
      <h2 className="tausch-karte-titel">{t.notifTauschAngefragt}</h2>
      <dl className="tausch-paar">
        <div className="tausch-paar-zeile">
          <dt className="klein-text">{t.tauschGibstAb}</dt>
          <dd>{meiner}</dd>
        </div>
        <div className="tausch-paar-zeile">
          <dt className="klein-text">{t.tauschUebernimmst}</dt>
          <dd>{seiner}</dd>
        </div>
      </dl>
      <div className="aufgabe-handlungen">
        <button type="button" className="knopf-haupt" disabled={tausch.laeuft} onClick={() => ausfuehren(() => tausch.annehmen(anfrage))}>
          {t.tauschAktion}
        </button>
        <button type="button" className="knopf-umriss" disabled={tausch.laeuft} onClick={() => ausfuehren(() => tausch.ablehnen(anfrage))}>
          {t.tauschNeinDanke}
        </button>
      </div>
      {fehler && (
        <p className="feld-fehler" role="alert">
          {fehler}
        </p>
      )}
    </section>
  )
}
