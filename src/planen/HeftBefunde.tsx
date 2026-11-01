import { useId } from 'react'
import type { Befund } from '../../supabase/functions/import-week/befunde.ts'
import { useAppSelector } from '../app/context'
import type { Week } from '../data/types'
import { useLangNames } from '../i18n/langnames'
import { useT } from '../i18n/useT'
import { befundZeile, geratenePunkte, stellenIn } from './heft-befunde'

/**
 * **Unerwartetes im Arbeitsheft** (T163): was der Parser in einer Woche nicht
 * kannte und darum geraten hat (`befunde.ts`). Bis zum 31.10.2026 übernahm
 * „Holen" eine neue Form still — mit geratenen Plätzen, die „Übernehmen und
 * zuteilen" gleich besetzte.
 *
 * Steht zweimal, mit demselben Inhalt: im Blatt „Programm holen" vor dem
 * Übernehmen und danach über dem Plan der Woche (`Week.befunde`), bis ein
 * Planer „Geprüft" wählt. Bis zum 1.11.2026 gab es nur das Blatt, und mit ihm
 * ging der Hinweis (Review Nr. 4).
 */
export function HeftBefunde({
  befunde,
  week,
  tpw,
  text,
  markenText,
  ebene,
  alarm = false,
  onGeprueft,
}: {
  befunde: readonly Befund[]
  /** Die gezeigte Fassung der Woche: Aus ihr kommen Überschriften, Nummern und Titel (`stellenIn`). */
  week: Week
  tpw: (s: string) => string
  /** Was der Leser damit tun soll — im Blatt nach dem Übernehmen prüfen, im Plan hier. */
  text: string
  /**
   * Der Hinweis auf die Marken im Plan — nur, wenn dort wirklich ein Punkt
   * markiert ist. Kommt eine Programmsprache später nach und ist anders
   * gegliedert, betrifft der Kasten keinen Punkt; der Satz schickte den Planer
   * auf die Suche nach Marken, die es nicht gibt (Review 1.11.2026).
   */
  markenText?: string
  /** Die Ebene des Titels: im Blatt unter dessen `h2` eine `h3`, im Plan unter dem Seitentitel eine `h2`. */
  ebene: 'h2' | 'h3'
  /**
   * Ein Alarm im Blatt: Der Kasten erscheint erst, wenn der Abruf fertig ist,
   * und soll vor „Übernehmen" gehört werden. Im Plan nicht — dort steht er bei
   * jedem Öffnen der Woche.
   */
  alarm?: boolean
  /** „Geprüft": Kasten und Marken gehen. Fehlt, wer den Plan nicht ändern darf. */
  onGeprueft?: () => void
}) {
  const lang = useAppSelector((s) => s.lang)
  const { t } = useT()
  const titelId = useId()
  // Die Sprachnamen der Gliederungs-Zeilen kommen nachgeladen. Bis zum Review
  // am 1.11.2026 lud sie nur das Blatt „Programm holen" — im Plan stand
  // „Englisch" in der arabischen Oberfläche.
  useLangNames(lang)
  const stellen = stellenIn(week, tpw)
  const zeilen = befunde.flatMap((b) => befundZeile(b, t, stellen, lang) ?? [])
  // Dieselbe Bedingung wie die Marke selbst: geraten und in der gezeigten Woche zu finden.
  const markiert = [...geratenePunkte(befunde)].some((iid) => stellen.punkt(iid))
  const Ueberschrift = ebene
  return (
    <section className="holen-befunde" role={alarm ? 'alert' : undefined} aria-labelledby={titelId}>
      <Ueberschrift id={titelId} className="holen-befunde-titel">
        {t.heftBefundeTitel}
      </Ueberschrift>
      <p className="klein-text">{markenText && markiert ? `${text} ${markenText}` : text}</p>
      <ul className="holen-befunde-liste">
        {zeilen.map((zeile, i) => (
          <li key={i}>
            {zeile.stelle && (
              <span className="holen-befund-stelle">
                {zeile.stelle}
                {zeile.titel && (
                  <>
                    {' · '}
                    <bdi>{zeile.titel}</bdi>
                  </>
                )}
              </span>
            )}
            <span>{zeile.text}</span>
          </li>
        ))}
      </ul>
      {onGeprueft && (
        <button type="button" className="knopf-leise holen-befunde-geprueft" onClick={onGeprueft}>
          {t.heftGeprueft}
        </button>
      )}
    </section>
  )
}
