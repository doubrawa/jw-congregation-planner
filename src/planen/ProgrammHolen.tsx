import { useRef, useState } from 'react'
import { useApp } from '../app/context'
import { GesperrterKnopf } from '../bausteine/GesperrterKnopf'
import { Spur, type SpurSchritt } from '../bausteine/Spur'
import { Sheet } from '../components/Sheet'
import { isSong } from '../data/helpers'
import type { Meeting, SectionColor, Week } from '../data/types'
import { sprachenListe, useLangNames } from '../i18n/langnames'
import { fill, useProgWeeks, useT } from '../i18n/useT'
import { useWochenImport } from './useWochenImport'

/** Was beim Holen gerade ist: nichts, der Abruf läuft, oder die Woche liegt zum Prüfen da. */
type Holen = { art: 'zu' } | { art: 'holt' } | { art: 'geholt'; week: Week }

/**
 * **„Holen"** (T121, Entwürfe `GWochen`, `GDesktopPlanen`, `GImport`): holt die
 * nächste Woche von jw.org und legt sie im Blatt zum Prüfen vor — übernommen
 * wird erst dort. Derselbe Knopf steht bei den Wochen, in der Spalte am
 * Desktop und auf dem Start, wenn die Programme knapp werden.
 *
 * Wird das Blatt geschlossen, während der Abruf läuft, verfällt sein Ergebnis:
 * Die Nummer des Laufs sagt, ob noch jemand darauf wartet.
 */
export function HolenKnopf({ className }: { className: string }) {
  const { state } = useApp()
  const { t } = useT()
  const { holenMoeglich, holen, uebernehmen } = useWochenImport()
  const [stand, setStand] = useState<Holen>({ art: 'zu' })
  const lauf = useRef(0)

  const starten = (): void => {
    if (!holenMoeglich()) return
    const nr = ++lauf.current
    setStand({ art: 'holt' })
    void holen().then((week) => {
      if (lauf.current === nr) setStand(week ? { art: 'geholt', week } : { art: 'zu' })
    })
  }
  const schliessen = (): void => {
    lauf.current++
    setStand({ art: 'zu' })
  }
  const geholt = stand.art === 'geholt' ? stand.week : null
  const uebernehmenMit = (zuteilen: boolean) =>
    geholt
      ? () => {
          schliessen()
          uebernehmen(geholt, zuteilen)
        }
      : null

  return (
    <>
      {/* Gesperrt, ohne den Fokus abzugeben: Der Knopf sperrt sich mit dem
          eigenen Tipp, und wer das Blatt während des Abrufs schließt, kommt
          wieder bei ihm an — mit `disabled` landete der Fokus auf der Seite. */}
      <GesperrterKnopf className={className} gesperrt={state.importing} onTipp={starten}>
        {t.holen}
      </GesperrterKnopf>
      {stand.art !== 'zu' && (
        <ProgrammHolenBlatt
          week={geholt}
          onZuteilen={uebernehmenMit(true)}
          onUebernehmen={uebernehmenMit(false)}
          onClose={schliessen}
        />
      )}
    </>
  )
}

/** Ein Abschnitt der Woche, wie das Blatt ihn zeigt: Name, Farbe, wie viele Punkte. */
interface AbschnittZahl {
  label: string
  farbe: SectionColor
  punkte: number
}

/** Die Abschnitte mit nummerierten Programmpunkten — wie sie das Arbeitsheft zählt. */
function abschnitteMitPunkten(meeting: Meeting): AbschnittZahl[] {
  return meeting.sections.flatMap((s) => {
    const punkte = s.items.filter((item) => !isSong(item) && item.num != null).length
    return punkte > 0 ? [{ label: s.label, farbe: s.farbe, punkte }] : []
  })
}

/**
 * **Das Blatt „Programm holen"** (Entwurf `GImport`): die Spur Holen, Prüfen,
 * Zuteilen; darunter, was kam — die Woche, ihre Abschnitte mit der Zahl der
 * Punkte, die Sprachen —, und die Wahl: übernehmen und gleich zuteilen, nur
 * übernehmen oder abbrechen. Solange der Abruf läuft, sind beide Übernehmen
 * gesperrt.
 */
function ProgrammHolenBlatt({
  week,
  onZuteilen,
  onUebernehmen,
  onClose,
}: {
  week: Week | null
  onZuteilen: (() => void) | null
  onUebernehmen: (() => void) | null
  onClose: () => void
}) {
  const { state } = useApp()
  const { t } = useT()
  const progWeek = useProgWeeks()
  useLangNames(state.lang)
  const p = week ? progWeek(week) : null
  const abschnitte = p ? abschnitteMitPunkten(p.week.mid) : []
  const spur: SpurSchritt[] = [
    { name: t.spurHolen, lage: p ? 'voll' : 'jetzt' },
    { name: t.spurPruefen, lage: p ? 'jetzt' : 'leer' },
    { name: t.spurZuteilen, lage: 'leer' },
  ]

  return (
    <Sheet label={t.programmHolen} title={t.programmHolen} sub={t.programmHolenText} onClose={onClose}>
      <div className="sheet-inhalt holen">
        <Spur schritte={spur} label={t.programmHolen} />
        {p ? (
          <>
            <div className="holen-woche">
              <div className="holen-kopf">
                <span className="holen-spanne">{p.tpw(p.week.range)}</span>
                <span className="klein-text">
                  {fill(t.programmpunkteN, { n: abschnitte.reduce((n, a) => n + a.punkte, 0) })}
                </span>
              </div>
              {abschnitte.map((a) => (
                <div key={a.label} className="holen-abschnitt" data-farbe={a.farbe}>
                  <span className="holen-abschnitt-name">{p.tpw(a.label)}</span>
                  <span className="klein-text">{fill(t.punkteN, { n: a.punkte })}</span>
                </div>
              ))}
              <div className="holen-sprachen">
                <span>{t.programmsprachen}</span>
                <span className="klein-text">{sprachenListe(state.congLang, state.progLangs, state.lang)}</span>
              </div>
            </div>
            <p className="klein-text holen-hinweis">{t.holenHinweis}</p>
          </>
        ) : (
          <p className="holen-laedt" role="status">
            {t.holtProgramm}
          </p>
        )}
      </div>
      <div className="auto-fuss">
        <button type="button" className="knopf-haupt" disabled={!onZuteilen} onClick={() => onZuteilen?.()}>
          {t.uebernehmenZuteilen}
        </button>
        <div className="auto-fuss-zeile">
          <button type="button" className="knopf-leise" disabled={!onUebernehmen} onClick={() => onUebernehmen?.()}>
            {t.nurUebernehmen}
          </button>
          <button type="button" className="knopf-leise" onClick={onClose}>
            {t.abbrechen}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
