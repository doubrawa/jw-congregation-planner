import { useMemo, type ReactNode } from 'react'
import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { useKalendertag } from '../app/useKalendertag'
import { GesperrterKnopf } from '../bausteine/GesperrterKnopf'
import { Punkt, type PunktArt } from '../bausteine/Punkt'
import { Spur } from '../bausteine/Spur'
import { datumsFormat } from '../components/datum-anzeige'
import { namenSatz } from '../components/namen-satz'
import { UnteransichtKopf } from '../components/UnteransichtKopf'
import { WochenWahl } from '../components/WochenWahl'
import { fromIso, meetingDate, meetingDateMs } from '../data/meeting-dates'
import { platzAuswahl } from '../data/offene-plaetze'
import { weekConflicts } from '../data/planning'
import { naechsteErinnerung, zusagenDerWoche, type ZusagePlatz } from '../data/zusagen'
import type { Lang, MeetingKey, Week } from '../data/types'
import { relativeDayLabel } from '../i18n/relative-time'
import type { Dict } from '../i18n/ui'
import { aufgabenLabel, fill, useT } from '../i18n/useT'
import { relativeZeit } from '../i18n/zeit'
import { spurDerWoche, zahlenDerWoche } from './plan-spur'
import { zumPlanDerWoche } from './planen-raster'
import { problemGrund } from './platz-anzeige'
import { machKonfliktVon } from './useKonflikte'
import { useErinnern } from './wochen-versand'

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
  const { weeks, persons, services, confirmations, sentLog, persoenlich } = state
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
      persoenlich,
      zeiten,
      konfliktVon: (tab, slot) => konfliktVon[tab](slot),
      heute: fromIso(tag),
    })
  }, [rawWeek, weeks, state.week, persons, services, confirmations, sentLog, persoenlich, zeiten, abwesend, tag])
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
  // Wer kein Konto hat, wartet nicht auf eine Nachricht: Ihn erreicht keine.
  const warten = plaetze.filter((p) => p.lage === 'wartet' && !p.ohneKonto)
  const ohneKonto = plaetze.filter((p) => p.lage === 'wartet' && p.ohneKonto)
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
              <ErinnernZeile warten={warten} rawWeek={rawWeek} />
            </ZusagenKarte>
          )}
          {ohneKonto.length > 0 && (
            <ZusagenKarte punkt="offen" titel={t.zusagenOhneKonto} anzahl={ohneKonto.length}>
              <p className="klein-text zusagen-hinweis">{t.zusagenOhneKontoHinweis}</p>
              {ohneKonto.map((p) => (
                <PersoenlichZeile key={p.key} platz={p} aufgabe={aufgabeAmTag(p)} />
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

/** Der Text einer Zeile: oben der Name, darunter, was die Karte über ihn sagt. */
function ZusageText({ name, children }: { name: string; children: ReactNode }) {
  return (
    <span className="zusage-text">
      <span className="zusage-name" dir="auto">
        {name}
      </span>
      {children}
    </span>
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
      <ZusageText name={platz.slot.name}>
        <span className="zusage-grund">{`${aufgabe} · ${grund}`}</span>
      </ZusageText>
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
      <ZusageText name={platz.slot.name}>
        <span className="klein-text">{aufgabe}</span>
        <span className="klein-text">
          {platz.gesendet ? fill(t.zusagenGesendet, { zeit: relativeZeit(platz.gesendet, state.lang) }) : t.zusagenNichtGesendet}
        </span>
      </ZusageText>
    </div>
  )
}

/**
 * Unter den Wartenden (Phase 5g-3): wann die nächste Erinnerung von selbst
 * hinausgeht — und „Jetzt erinnern", sobald einer von ihnen die Nachricht
 * schon hat. Wer sie noch nicht hat, bekommt zuerst „Plan senden", keine
 * Erinnerung; so sieht es auch die Function.
 */
function ErinnernZeile({ warten, rawWeek }: { warten: readonly ZusagePlatz[]; rawWeek: Week }) {
  const { state } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const { laeuft, erinnern } = useErinnern(rawWeek, tag)
  const zeiten = state.congregation.times
  const termine = [...new Set(warten.map((p) => meetingDateMs(rawWeek, p.tab, zeiten)))].filter(
    (ms): ms is number => ms !== null,
  )
  const satz = erinnerungsSatz(naechsteErinnerung(termine, state.reminders, new Date()), state.lang, t)
  const kannErinnern = warten.some((p) => p.gesendet !== null)
  if (!satz && !kannErinnern) return null
  return (
    <div className="zusagen-erinnern">
      <span className="klein-text">{satz}</span>
      {kannErinnern && (
        <GesperrterKnopf className="knopf-pille" gesperrt={laeuft} onTipp={() => void erinnern()}>
          {t.zusagenErinnern}
        </GesperrterKnopf>
      )}
    </div>
  )
}

/** Der Satz über die nächste Erinnerung — leer, wenn `Intl` die Sprache nicht kennt. */
function erinnerungsSatz(naechste: number | null, lang: Lang, t: Dict): string {
  if (naechste === null) return t.zusagenKeineErinnerung
  const wann = relativeDayLabel(naechste, lang)
  return wann ? fill(t.zusagenNaechsteErinnerung, { wann }) : ''
}

/**
 * Wer kein Konto hat: wer, welche Aufgabe — und der Haken, sobald der Planer es
 * ihm selbst gesagt hat. Die ganze Zeile schaltet ihn.
 */
function PersoenlichZeile({ platz, aufgabe }: { platz: ZusagePlatz; aufgabe: string }) {
  const { dispatch } = useApp()
  const { t } = useT()
  const name = platz.slot.name
  return (
    <label className="zusage-zeile zusage-haken">
      <ZusageText name={name}>
        <span className="klein-text">{aufgabe}</span>
      </ZusageText>
      <input
        type="checkbox"
        aria-label={fill(t.zusagenWeissBescheid, { name })}
        checked={platz.ohneKonto?.bescheid != null}
        onChange={(e) => dispatch({ type: 'persoenlichBescheid', key: platz.key, name, ja: e.target.checked })}
      />
    </label>
  )
}

/** Die Namen der Zugesagten als ein Satz (`namenSatz`); wer zwei Aufgaben hat, steht einmal da. */
function namenListe(plaetze: readonly ZusagePlatz[], lang: Lang): string {
  return namenSatz([...new Set(plaetze.map((p) => p.slot.name))], lang)
}
