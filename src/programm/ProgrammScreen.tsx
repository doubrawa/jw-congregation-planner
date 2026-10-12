import { useCallback, useState } from 'react'
import { flushSync } from 'react-dom'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { Saal } from '../bausteine/Saal'
import { Zeichen } from '../bausteine/Zeichen'
import { anlassArt } from '../data/anlass'
import { istAusgefallen, MEETING_TABS } from '../data/helpers'
import { meetingDate } from '../data/meeting-dates'
import { SAAL_PLAETZE, type SaalLage } from '../data/saal'
import type { MeetingKey, Week } from '../data/types'
import { Bereichstitel } from '../components/Bereichstitel'
import { datumsFormat } from '../components/datum-anzeige'
import { MeetingTabs } from '../components/MeetingTabs'
import { TABLET_BREITE, useMedia } from '../components/useMedia'
import { TerminListe } from '../components/WeekBadges'
import { WeekStrip } from '../components/WeekStrip'
import { WochenWahl } from '../components/WochenWahl'
import { fill, useProgWeek, useT } from '../i18n/useT'
import { FsBereichTabs } from '../planen/FsBereichTabs'
import { aktiverFsBereich } from '../planen/fs-bereiche'
import { druckKennzeichen, druckThema } from './druck'
import { DruckWahl } from './DruckWahl'
import { FsProgram } from './FsProgram'
import { GruppenbesucheAnsicht } from './GruppenbesucheAnsicht'
import { MonatDruckenContext, MonatsDruck } from './MonatsDruck'
import { useBeideTage } from './useBeideTage'
import { WeiterePlaeneAnsicht } from './WeiterePlaeneAnsicht'
import { ZeugnisAnsicht } from './ZeugnisAnsicht'
import { BeideTage, ZusammenkunftAnsicht } from './ZusammenkunftAnsicht'
import './programm.css'
import './print.css'

/**
 * **Die Versammlung ansehen** (T121): Zusammenkünfte, Predigtdienst und
 * Weitere Pläne. Bei den Zusammenkünften die Woche, die Karten der beiden
 * Tage und das Programm des gewählten (`ZusammenkunftAnsicht`) — am Desktop
 * beide Tage nebeneinander (`BeideTage`). Angezeigt wird die
 * Sprachvariante der App-Sprache, falls beim Import mitgeholt (useProgWeek) —
 * sonst die Versammlungssprache.
 */
export function ProgrammScreen() {
  const { state } = useApp()
  // Der Monat, der gerade gedruckt wird (T105) — sonst null.
  const [druckMonat, setDruckMonat] = useState<string | null>(null)

  /*
   * Erst zeichnen, dann drucken — im selben Klick. `flushSync` legt den Monat
   * sofort ins DOM, bevor der Druckdialog das Blatt aufnimmt. Kein Effekt nach
   * dem Rendern: Den ließe StrictMode in der Entwicklung zweimal laufen, und
   * es gingen zwei Druckdialoge auf. Abgeräumt wird, wenn der Dialog durch ist.
   */
  const monatDrucken = useCallback((monat: string) => {
    flushSync(() => setDruckMonat(monat))
    druckKennzeichen('monat')
    const fertig = () => {
      window.removeEventListener('afterprint', fertig)
      druckKennzeichen(null)
      setDruckMonat(null)
    }
    window.addEventListener('afterprint', fertig)
    window.print()
  }, [])

  // Die Weiteren Pläne (T120, Phase 5): ein eigenes Thema ohne Woche.
  if (state.tab === 'wp') {
    return (
      <section className="screen prog">
        <Bereichstitel />
        <WeiterePlaeneAnsicht />
      </section>
    )
  }

  // Gruppenbesuche und öffentliches Zeugnisgeben (T120) haben keine Woche —
  // ohne Streifen, wie beim Planen.
  const bereich = state.tab === 'fs' ? aktiverFsBereich(state) : null
  if (bereich === 'gruppenbesuche' || bereich === 'zeugnis') {
    return (
      <section className="screen prog">
        <Bereichstitel />
        <FsBereichTabs />
        {bereich === 'zeugnis' ? <ZeugnisAnsicht /> : <GruppenbesucheAnsicht />}
      </section>
    )
  }

  // Der Streifen zeichnet dieselben Inhalte dreimal — vorige, aktuelle und
  // naechste Woche — und uebernimmt das Wischen.
  return (
    <MonatDruckenContext.Provider value={monatDrucken}>
      <WeekStrip>
        <ProgrammBody />
      </WeekStrip>
      {druckMonat && (
        <MonatsDruck monat={druckMonat}>
          <ProgrammBody />
        </MonatsDruck>
      )}
    </MonatDruckenContext.Provider>
  )
}

/** Programm EINER Woche; welche, sagt der Zustand (im Streifen überschrieben). */
function ProgrammBody() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const rawWeek = state.weeks[state.week]
  const { week, tpw } = useProgWeek(rawWeek)
  const breit = useMedia(TABLET_BREITE)
  const beideTage = useBeideTage()

  // Noch keine Wochen (z. B. frisch eingerichtete Versammlung) → Hinweis
  if (!week || !rawWeek) {
    return (
      <section className="screen">
        <Bereichstitel />
        {state.tab === 'fs' && <FsBereichTabs />}
        <div className="panel panel--lead" data-farbe="neutral">
          <h2 className="panel-label">{t.keineWochenTitel}</h2>
          <p className="prog-meta">{t.keineWochenHinweis}</p>
        </div>
      </section>
    )
  }

  const isFs = state.tab === 'fs'
  const meeting = state.tab === 'we' ? week.we : week.mid // fs nutzt Meeting-Inhalt nicht
  // Kanonische Fassung (deutsche Sektions-Labels) zum Erkennen von Eröffnung
  // und Abschluss — dort steht das Lied im Sammeltitel.
  const rawMeeting = state.tab === 'we' ? rawWeek.we : rawWeek.mid
  // Kongress (T64): Beide Zusammenkünfte fallen aus — statt der Karten der
  // Tage steht das, und der Weg zu den Treffpunkten und zur nächsten.
  const kongress = !isFs && anlassArt(rawWeek) === 'kongress'
  // Der Druckknopf: ab dem Tablet mit Wort neben der Wochenwahl, am Handy als
  // Zeichen neben dem Termin. In der Kongresswoche gibt es nichts zu drucken.
  const druck = kongress ? null : (
    <DruckWahl zeitraum={tpw(week.range)} erklaerung={isFs ? undefined : t.druckZusammenkuenfte} mitText={breit} />
  )
  const druckNebenTermin = breit ? null : druck
  // Die volle Breite neben dem Menü nur für die zwei Spalten — die Karte des
  // Kongresses bleibt in der gewohnten.
  const zweiSpalten = beideTage && !kongress

  return (
    <section className={zweiSpalten ? 'screen prog prog--beide-tage' : 'screen prog'}>
      {/* Titel des Themas (T120) und, für wen es zu planen ist, „Planen". Im
          Ausdruck fehlt beides; dort ordnet die Zeile darunter das Blatt zu. */}
      <Bereichstitel />
      {/* Die Reiter des Predigtdienstes (Treffpunkte · Gruppenbesuche) stehen
          über der Woche, wie beim Planen. Ohne Besuche gibt es keine Leiste. */}
      {isFs && <FsBereichTabs />}
      {/* Nur im Ausdruck: ordnet das Blatt zu (Tabs/Navigation fehlen dort). */}
      <div className="prog-print-head">
        <span>{state.congregation.name}</span>
        <span>{druckThema(t, state.tab, beideTage)}</span>
      </div>

      <WochenWahl week={week} rawWeek={rawWeek} tpw={tpw} rechts={breit && druck} />

      {/* Weitere Termine der Woche (T63): über den Karten der Tage, weil sie zu
          keiner Zusammenkunft gehören, sondern zur Woche — und damit bei beiden
          Tagen und beiden Themen sichtbar bleiben. */}
      <TerminListe week={rawWeek} />

      {kongress ? (
        <KongressKarte wi={state.week} />
      ) : isFs ? (
        <FsProgram druck={druckNebenTermin} />
      ) : zweiSpalten ? (
        <BeideTage week={week} rawWeek={rawWeek} me={eigenePerson(state)} tpw={tpw} />
      ) : (
        <>
          {/* Die Karten gehören den Zusammenkünften; der Predigtdienst ist seit
              T120 ein eigenes Thema im Menü. */}
          <MeetingTabs
            tab={state.tab}
            week={rawWeek}
            onChange={(tab) => dispatch({ type: 'setTab', tab })}
          />
          <ZusammenkunftAnsicht
            meeting={meeting}
            rawMeeting={rawMeeting}
            week={week}
            rawWeek={rawWeek}
            tab={state.tab}
            me={eigenePerson(state)}
            tpw={tpw}
            druck={druckNebenTermin}
          />
        </>
      )}
    </section>
  )
}

/** Alle Plätze leer — der Saal einer Woche, in der nichts stattfindet. */
const LEERER_SAAL: readonly SaalLage[] = Array.from({ length: SAAL_PLAETZE }, () => 'offen')

/**
 * **Kongress** (T121, Entwurf `GSonderwoche`): In dieser Woche fallen alle
 * Zusammenkünfte aus. Statt eines leeren Programms der leere Saal, und zwei
 * Wege weiter: zu den Treffpunkten dieser Woche und zur nächsten
 * Zusammenkunft, die stattfindet.
 */
function KongressKarte({ wi }: { wi: number }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const naechste = naechsteNach(state.weeks, wi)
  return (
    <>
      <section className="karte karte--held kongress-karte">
        <Saal lagen={LEERER_SAAL} label={t.kongress} />
        <h2 className="kongress-titel">{t.kongress}</h2>
        <p className="kongress-text">{t.kongressAusfall}</p>
      </section>
      <nav className="karte" aria-label={t.kongress}>
        <button
          type="button"
          className="kongress-weg"
          onClick={() => dispatch({ type: 'navigate', screen: 'programm', woche: { wi, tab: 'fs' } })}
        >
          <span>{t.treffpunkteDieserWoche}</span>
          <Zeichen name="weiter" />
        </button>
        {naechste && (
          <button
            type="button"
            className="kongress-weg"
            onClick={() => dispatch({ type: 'navigate', screen: 'programm', woche: { wi: naechste.wi, tab: naechste.tab } })}
          >
            <span>
              {fill(t.naechsteZusammenkunft, {
                wann: datumsFormat(state.lang, 'kurzerWochentag').format(
                  meetingDate(naechste.week, naechste.tab, state.congregation.times),
                ),
              })}
            </span>
            <Zeichen name="weiter" />
          </button>
        )}
      </nav>
    </>
  )
}

/**
 * Die erste Zusammenkunft nach der Woche `wi`, die stattfindet — in der
 * Reihenfolge der Wochen, je Woche unter der Woche vor dem Wochenende.
 */
function naechsteNach(weeks: readonly Week[], wi: number): { wi: number; tab: MeetingKey; week: Week } | null {
  for (let i = wi + 1; i < weeks.length; i++) {
    const week = weeks[i]
    const tab = MEETING_TABS.find((key) => !istAusgefallen(week, key))
    if (week && tab) return { wi: i, tab, week }
  }
  return null
}
