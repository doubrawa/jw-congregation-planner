import { useMemo, type ReactNode } from 'react'
import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { useKalendertag } from '../app/useKalendertag'
import { Punkt, type PunktArt } from '../bausteine/Punkt'
import { Spur } from '../bausteine/Spur'
import { datumsFormat } from '../components/datum-anzeige'
import { UnteransichtKopf } from '../components/UnteransichtKopf'
import { WochenWahl } from '../components/WochenWahl'
import { fromIso, meetingDate, meetingDateMs } from '../data/meeting-dates'
import { platzAuswahl } from '../data/offene-plaetze'
import { weekConflicts } from '../data/planning'
import { zusagenDerWoche, type ZusagePlatz } from '../data/zusagen'
import type { Lang, MeetingKey, Week } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { aufgabenLabel, fill, useT } from '../i18n/useT'
import { relativeZeit } from '../i18n/zeit'
import { spurDerWoche, zahlenDerWoche } from './plan-spur'
import { zumPlanDerWoche } from './planen-raster'
import { problemGrund } from './platz-anzeige'
import { machKonfliktVon } from './useKonflikte'

/**
 * **Die Zusagen der Woche** (T121, Phase 5g, Entwürfe `GRueckmeldungen` und
 * `GDesktopZusagen`) — eine Unteransicht des Plans, wie „Woche einrichten":
 * Was ist zu klären, wer hat noch nicht zugesagt, wer schon. Beide
 * Zusammenkünfte stehen zusammen; was vorbei ist, fehlt (`zusagenDerWoche`).
 *
 * Hin führt der Schritt „Zusagen" der Spur im Plan, zurück der Schritt
 * „Zuteilen" oder Zurück. Am Desktop stehen die Karten als Spalten
 * nebeneinander. Ein Problem lässt sich von hier aus gleich neu zuteilen.
 */
export function ZusagenAnsicht({ week, rawWeek, tpw }: { week: Week; rawWeek: Week; tpw: (s: string) => string }) {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t } = i18n
  const tag = useKalendertag()
  const abwesend = useAbwesend()
  const { weeks, persons, services, confirmations, sentLog } = state
  const zeiten = state.congregation.times
  const fsWeek = state.fsWeeks[state.week]

  // Gemerkt: Der Wochenstreifen zeichnet drei Wochen, und jeder Dispatch
  // rendert sie neu — die Konflikte laufen über alle Personen.
  const plaetze = useMemo(() => {
    const konfliktVon: Record<MeetingKey, ReturnType<typeof machKonfliktVon>> = {
      mid: machKonfliktVon(persons, weekConflicts(weeks, state.week, persons, services, 'mid', abwesend)),
      we: machKonfliktVon(persons, weekConflicts(weeks, state.week, persons, services, 'we', abwesend)),
    }
    return zusagenDerWoche({
      week: rawWeek,
      services,
      confirmations,
      sentLog,
      zeiten,
      konfliktVon: (tab, slot) => konfliktVon[tab](slot),
      heute: fromIso(tag),
    })
  }, [rawWeek, weeks, state.week, persons, services, confirmations, sentLog, zeiten, abwesend, tag])
  const zahlen = useMemo(
    () => zahlenDerWoche(rawWeek, fsWeek, { services, confirmations, sentLog, zeiten }, fromIso(tag)),
    [rawWeek, fsWeek, services, confirmations, sentLog, zeiten, tag],
  )
  const zumPlan = (): void => dispatch(zumPlanDerWoche)
  // „Dienstag · Gespräche beginnen · Schüler": Die Woche steht oben, der Tag
  // genügt — der volle Termin machte jede Zeile am Handy vierzeilig. Eine
  // Woche ohne Datum (Vorlage) liegt in keinem Kalender: dann ohne Tag.
  const wochentag = datumsFormat(state.lang, 'wochentag')
  const tagDer = (tab: MeetingKey): string =>
    meetingDateMs(rawWeek, tab, zeiten) === null ? '' : wochentag.format(meetingDate(rawWeek, tab, zeiten))
  const tage: Record<MeetingKey, string> = { mid: tagDer('mid'), we: tagDer('we') }
  const aufgabeAmTag = (p: ZusagePlatz): string =>
    [tage[p.tab], aufgabenLabel(p.aufgabe(), i18n)].filter(Boolean).join(' · ')

  const klaeren = plaetze.filter((p) => p.lage === 'problem')
  const warten = plaetze.filter((p) => p.lage === 'wartet')
  const zugesagt = plaetze.filter((p) => p.lage === 'voll')

  return (
    <section className="screen prog zusagen">
      <UnteransichtKopf titel={t.spurZusagen} onZurueck={zumPlan} />
      <WochenWahl week={week} rawWeek={rawWeek} tpw={tpw} />
      <Spur schritte={spurDerWoche(zahlen, t, { zuteilen: zumPlan })} label={t.spurWoche} />
      {plaetze.length === 0 ? (
        <section className="karte zusagen-leer">
          <p className="prog-meta">{t.zusagenLeer}</p>
        </section>
      ) : (
        <div className="zusagen-raster">
          {klaeren.length > 0 && (
            <ZusagenKarte punkt="problem" titel={t.zuKlaeren} anzahl={klaeren.length}>
              {klaeren.map((p) => (
                <KlaerenZeile key={p.key} platz={p} aufgabe={aufgabeAmTag(p)} />
              ))}
            </ZusagenKarte>
          )}
          {warten.length > 0 && (
            <ZusagenKarte punkt="wartet" titel={t.zusagenWarten} anzahl={warten.length}>
              {warten.map((p) => (
                <WartenZeile key={p.key} platz={p} aufgabe={aufgabeAmTag(p)} />
              ))}
            </ZusagenKarte>
          )}
          {zugesagt.length > 0 && (
            <ZusagenKarte punkt="voll" titel={t.zusagenZugesagt} anzahl={zugesagt.length}>
              <p className="zusagen-namen">{namenListe(zugesagt, state.lang)}</p>
            </ZusagenKarte>
          )}
        </div>
      )}
    </section>
  )
}

/** Eine Karte der Zusagen: der Punkt ihrer Lage, Titel und Zahl („Bezeichnung · n"), darunter die Zeilen. */
function ZusagenKarte({
  punkt,
  titel,
  anzahl,
  children,
}: {
  punkt: PunktArt
  titel: string
  anzahl: number
  children: ReactNode
}) {
  return (
    <section className="karte zusagen-karte">
      <h2 className="abschnitt-titel karte-titel">
        <Punkt art={punkt} />
        {`${titel} · ${anzahl}`}
      </h2>
      {children}
    </section>
  )
}

/**
 * Ein Problem: wer, welche Aufgabe, warum — und „Zuteilen", das den Platz
 * gleich im Zuteilen-Blatt öffnet.
 */
function KlaerenZeile({ platz, aufgabe }: { platz: ZusagePlatz; aufgabe: string }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const grund = problemGrund(platz.konflikt, t, platz.hilfsdienst ? t.spurErsatzGesucht : undefined)
  const sel = platzAuswahl(state.weeks, state.services, platz.key)
  return (
    <div className="zusage-zeile">
      <span className="zusage-text">
        <span className="zusage-name" dir="auto">
          {platz.slot.name}
        </span>
        <span className="zusage-grund">{`${aufgabe} · ${grund}`}</span>
      </span>
      {sel && (
        <button type="button" className="knopf-pille" onClick={() => dispatch({ type: 'openSlot', sel })}>
          {t.spurZuteilen}
        </button>
      )}
    </div>
  )
}

/** Wer noch nicht zugesagt hat: wer, welche Aufgabe — und seit wann die Nachricht draußen ist. */
function WartenZeile({ platz, aufgabe }: { platz: ZusagePlatz; aufgabe: string }) {
  const { state } = useApp()
  const { t } = useT()
  return (
    <div className="zusage-zeile">
      <span className="zusage-text">
        <span className="zusage-name" dir="auto">
          {platz.slot.name}
        </span>
        <span className="klein-text">{aufgabe}</span>
        <span className="klein-text">
          {platz.gesendet ? fill(t.zusagenGesendet, { zeit: relativeZeit(platz.gesendet, state.lang) }) : t.zusagenNichtGesendet}
        </span>
      </span>
    </div>
  )
}

/**
 * Die Namen der Zugesagten als ein Satz — „Anna Test, Carl Test und Dora
 * Test", die Verbindung aus `Intl` in der Sprache des Lesers; wer zwei
 * Aufgaben hat, steht einmal da. Kennt `Intl` die Sprache nicht, stehen sie
 * mit Komma da.
 */
function namenListe(plaetze: readonly ZusagePlatz[], lang: Lang): string {
  const namen = [...new Set(plaetze.map((p) => p.slot.name))]
  try {
    return new Intl.ListFormat(LOCALES[lang] ?? lang, { type: 'conjunction', style: 'long' }).format(namen)
  } catch {
    return namen.join(', ')
  }
}
