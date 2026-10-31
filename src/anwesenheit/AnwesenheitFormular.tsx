import { type FormEvent, useId, useState } from 'react'
import { useApp } from '../app/context'
import { ANWESENDE_HOECHSTENS, anwesendeAusEingabe, anwesendGesamt, type Anwesenheit } from '../data/anwesenheit'
import type { MeetingKey } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import './anwesenheit.css'

/**
 * **Die Anwesenden eintragen** (T152): im Saal und per Video, darunter beide
 * zusammen. Leer heißt „nicht eingetragen" — der Saalordner trägt den Saal
 * ein, der Zoom-Ordner das Video, jeder für sich. Gespeichert wird erst mit
 * dem Knopf; was kein Ganzzahl-Wert bis 9999 ist, meldet das Feld und geht
 * nicht hinaus.
 *
 * Auf dem Start steht das Formular in der Karte, im Programm und in der
 * Auswertung in einem Blatt (`AnwesenheitBlatt`).
 *
 * **Was gespeichert ist, steht im Feld** (Review 31.10.2026): Die Felder
 * übernehmen die Zahlen nur beim Öffnen. Kam die des anderen erst danach herein
 * — ein Nachladen, während die Karte auf dem Start stand —, stand hier weiter
 * das leere Feld, und Speichern schickte es als „nicht eingetragen" (`null`)
 * und löschte die Zahl des anderen. Mit den gespeicherten Zahlen im Schlüssel
 * beginnt das Formular dann neu, wie die Felder im Planen (`key` mit dem Wert).
 */
export function AnwesenheitFormular(props: FormularProps) {
  const { eintrag } = props
  return <Formular key={`${eintrag?.saal ?? ''}|${eintrag?.video ?? ''}`} {...props} />
}

interface FormularProps {
  woche: string
  tab: MeetingKey
  eintrag: Anwesenheit | undefined
  onGespeichert?: () => void
}

function Formular({ woche, tab, eintrag, onGespeichert }: FormularProps) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const id = useId()
  const [saal, setSaal] = useState(eintrag?.saal != null ? String(eintrag.saal) : '')
  const [video, setVideo] = useState(eintrag?.video != null ? String(eintrag.video) : '')
  const [fehler, setFehler] = useState(false)

  const saalWert = anwesendeAusEingabe(saal)
  const videoWert = anwesendeAusEingabe(video)
  const gueltig = saalWert !== 'ungueltig' && videoWert !== 'ungueltig'
  const zusammen = gueltig ? anwesendGesamt({ saal: saalWert, video: videoWert }) : null

  const speichern = (e: FormEvent) => {
    e.preventDefault()
    if (!gueltig) {
      setFehler(true)
      return
    }
    dispatch({ type: 'anwesenheitSetzen', woche, tab, saal: saalWert, video: videoWert })
    onGespeichert?.()
  }

  const feld = (art: 'saal' | 'video', marke: string, wert: string, setzen: (w: string) => void) => (
    <div className="anwesend-feld">
      <label className="feld-marke" htmlFor={`${id}-${art}`}>
        {marke}
      </label>
      <input
        id={`${id}-${art}`}
        className="feld anwesend-zahl"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={wert}
        aria-invalid={fehler && anwesendeAusEingabe(wert) === 'ungueltig' ? true : undefined}
        onChange={(e) => {
          setzen(e.target.value)
          setFehler(false)
        }}
      />
    </div>
  )

  return (
    <form className="anwesend-formular" onSubmit={speichern} noValidate>
      <div className="anwesend-felder">
        {feld('saal', t.anwesendSaal, saal, setSaal)}
        {feld('video', t.anwesendVideo, video, setVideo)}
      </div>
      {fehler && (
        <p className="anwesend-fehler" role="alert">
          {fill(t.anwesendUngueltig, { max: new Intl.NumberFormat(LOCALES[state.lang] ?? state.lang).format(ANWESENDE_HOECHSTENS) })}
        </p>
      )}
      <div className="anwesend-fuss">
        <span className="anwesend-zusammen" aria-live="polite">
          {zusammen !== null ? fill(t.anwesendZusammenN, { n: zusammen }) : ''}
        </span>
        <button type="submit" className="knopf-haupt">
          {t.anwesendSpeichern}
        </button>
      </div>
    </form>
  )
}
