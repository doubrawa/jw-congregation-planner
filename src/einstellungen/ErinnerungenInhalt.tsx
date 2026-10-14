import type { ReactNode } from 'react'
import { ERINNERUNG_GRENZEN, useApp } from '../app/context'
import { PlusMinus } from '../bausteine/PlusMinus'
import { Wahl, type WahlOption } from '../bausteine/Wahl'
import { Switch } from '../components/Switch'
import type { Lang } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { erinnerungsTag } from './einstellungen-anzeige'
import './erinnerungen.css'

/**
 * **Erinnerungen** (T121, Phase 6c-4, Entwurf `GErinnerungen`): wie die App
 * eine Aufgabe begleitet — als Zeitleiste vom gesendeten Plan bis zum Tag
 * selbst. Die drei Einstellungen stehen dort, wo sie in dieser Folge wirken,
 * nicht als Liste daneben: Wer die letzte Erinnerung stellt, sieht, was davor
 * kommt und dass danach nichts mehr kommt.
 *
 * Darunter, was ohne Einstellung sofort hinausgeht und an wen. **Das ist am
 * Code gemessen, nicht am Entwurf** (14.10.2026): der Rhythmus in `dueKind`
 * (`supabase/functions/_shared/erinnerung.ts`), die Absage über
 * `notify_planners` (`supabase/schema.sql`), das Ersatzgesuch in `substitute`,
 * der Entzug in `send-plan`. Ändert sich dort, wer was bekommt, stimmt diese
 * Seite nicht mehr. Die Zeile zum Trolley aus dem Entwurf fehlt mit Absicht —
 * die Trolleys kommen erst mit Phase 7.
 *
 * Nur die Karten, ohne Titel: Den setzt der Aufrufer — am Handy
 * `UnteransichtKopf`, am Desktop die Überschrift des Abschnitts.
 */
export function ErinnerungenInhalt() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const { first, last, repeat } = state.reminders
  return (
    <>
      <p className="erin-einleitung">{t.erinEinleitung}</p>
      <ol className="erin-zeitleiste karte">
        {/* Der zitierte Titel ist der echte der Mitteilung, in der Sprache des
            Lesers — so steht er auch in seiner Glocke. */}
        <Schritt titel={t.erinPlanGesendet} unter={fill(t.erinPlanSofort, { titel: t.notifZuteilung })} />
        <Schritt
          titel={t.remErste}
          unter={t.erinTageVorAufgabe}
          steuer={
            <PlusMinus
              wert={first}
              min={ERINNERUNG_GRENZEN.first.min}
              max={ERINNERUNG_GRENZEN.first.max}
              label={`${t.remErste}, ${t.erinTageVorAufgabe}`}
              // Schrittweise statt den neuen Wert zu setzen: Zwei schnelle Tipps
              // zählen dann zwei, auch wenn dazwischen nicht neu gezeichnet wurde.
              onWert={(neu) => dispatch({ type: 'changeReminder', key: 'first', delta: neu > first ? 1 : -1 })}
            />
          }
        />
        <Schritt
          titel={t.erinTaeglich}
          unter={t.erinBisZusage}
          steuer={<Switch on={repeat} label={t.remRepeat} onToggle={() => dispatch({ type: 'toggleReminderRepeat' })} />}
        />
        <Schritt titel={t.remLetzte}>
          <div className="erin-wahl">
            <Wahl
              label={t.remLetzte}
              optionen={letzteMoeglichkeiten(last, t, state.lang)}
              wert={String(last)}
              onWahl={(wert) => {
                // Die schon gedrückte Möglichkeit noch einmal: nichts zu speichern.
                const tage = Number(wert)
                if (tage !== last) dispatch({ type: 'setReminder', key: 'last', value: tage })
              }}
            />
          </div>
        </Schritt>
        <Schritt titel={t.erinDieAufgabe} unter={t.erinDanachStill} ziel />
      </ol>
      <section className="karte erin-meldungen">
        <h2 className="abschnitt-titel karte-titel">{t.erinSofortGemeldet}</h2>
        <Meldung titel={t.erinAbsage} an={t.erinAnPlaner} />
        <Meldung titel={t.notifErsatzGesucht} an={t.erinErsatzAn} />
        <Meldung titel={t.notifEntzug} an={t.erinEntzugAn} />
      </section>
      <p className="klein-text erin-fuss">{t.erinMailNur}</p>
    </>
  )
}

/**
 * Die Möglichkeiten der letzten Erinnerung: am Tag oder am Tag davor, wie im
 * Entwurf. Gespeichert sein darf aber jeder Wert von 0 bis 7
 * (`ERINNERUNG_GRENZEN`) — die alte Oberfläche zählte bis 7. Steht so einer im
 * Bestand, kommt er als dritte Möglichkeit dazu; sonst wäre keine gedrückt, und
 * niemand sähe, was gilt.
 *
 * Die Worte macht dieselbe Regel wie die Zeile der Übersicht
 * (`erinnerungsTag`), nur mit den Fassungen, die groß anfangen: Eine
 * Möglichkeit steht für sich, nicht mitten im Satz.
 */
function letzteMoeglichkeiten(
  last: number,
  t: Pick<Dict, 'remAmTagOption' | 'remVorherOption'>,
  lang: Lang,
): WahlOption<string>[] {
  const texte = { remAmTagKurz: t.remAmTagOption, remVorher: t.remVorherOption }
  const tage = last > 1 ? [0, 1, last] : [0, 1]
  return tage.map((n) => ({ wert: String(n), text: erinnerungsTag(n, texte, lang) }))
}

/**
 * Ein Schritt der Zeitleiste: links der Punkt und die Linie zum nächsten, dann
 * der Titel und darunter, was er bedeutet, rechts, was sich daran einstellen
 * lässt. Der letzte Schritt ist die Aufgabe selbst (`ziel`): Punkt in Minze mit
 * Ring und keine Linie mehr — danach kommt nichts.
 */
function Schritt({
  titel,
  unter,
  steuer,
  ziel = false,
  children,
}: {
  titel: string
  unter?: string
  steuer?: ReactNode
  ziel?: boolean
  /** Was statt einer Textzeile unter dem Titel steht (die Wahl der letzten Erinnerung). */
  children?: ReactNode
}) {
  return (
    <li className={ziel ? 'erin-schritt erin-schritt--ziel' : 'erin-schritt'}>
      <span className="erin-spur" aria-hidden="true">
        <span className="erin-punkt" />
        {!ziel && <span className="erin-linie" />}
      </span>
      <div className="erin-text">
        <span className="erin-titel">{titel}</span>
        {unter && <span className="klein-text">{unter}</span>}
        {children}
      </div>
      {steuer}
    </li>
  )
}

/** Eine Zeile „Sofort gemeldet": was geschieht, darunter an wen es geht. */
function Meldung({ titel, an }: { titel: string; an: string }) {
  return (
    <div className="erin-meldung">
      <span className="erin-meldung-titel">{titel}</span>
      <span className="klein-text">{an}</span>
    </div>
  )
}
