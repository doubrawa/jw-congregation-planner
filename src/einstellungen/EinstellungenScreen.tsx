import { useState, type ReactNode } from 'react'
import { useApp } from '../app/context'
import { Switch } from '../components/Switch'
import { UnteransichtKopf } from '../components/UnteransichtKopf'
import { useBackDismiss } from '../components/useBackDismiss'
import { DESKTOP_BREITE, useMedia } from '../components/useMedia'
import type { MeetingKey } from '../data/types'
import { langLabel, useLangNames } from '../i18n/langnames'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { EinstellZeile } from './EinstellZeile'
import { ErinnerungenInhalt } from './ErinnerungenInhalt'
import { erinnerungKurz, werPlant, zusammenkunftText } from './einstellungen-anzeige'
import { GruppenInhalt } from './GruppenInhalt'
import { HilfsdiensteInhalt } from './HilfsdiensteInhalt'
import { ProgrammKarte } from './ProgrammKarte'
import { SprachenInhalt } from './SprachenInhalt'
import { TextBlatt } from './TextBlatt'
import { useWochenImport } from './useWochenImport'
import { WerPlantKarte } from './WerPlantKarte'
import { ZusammenkunftBlatt } from './ZusammenkunftBlatt'
import './einstellungen.css'

/** Die Abschnitte — am Desktop die Einträge links, in dieser Folge (Entwurf `GDesktopEinstellungen`). */
const ABSCHNITTE = ['versammlung', 'zusammenkuenfte', 'hilfsdienste', 'gruppen', 'erinnerungen', 'werPlant', 'programm'] as const
type Abschnitt = (typeof ABSCHNITTE)[number]

/** Was am Handy hinter einer Zeile als eigene Unteransicht liegt. */
type Unteransicht = 'sprachen' | 'hilfsdienste' | 'gruppen' | 'erinnerungen'

const ABSCHNITT_TITEL = {
  versammlung: 'versammlungCard',
  zusammenkuenfte: 'navZusammenkuenfte',
  hilfsdienste: 'hilfsdienste',
  gruppen: 'gruppenTitel',
  erinnerungen: 'mitteilungenUndErinnerungen',
  werPlant: 'werPlant',
  programm: 'importCard',
} as const satisfies Record<Abschnitt, keyof Dict>

const UNTERANSICHT_TITEL = {
  sprachen: 'programmsprachen',
  hilfsdienste: 'hilfsdienste',
  gruppen: 'gruppenTitel',
  erinnerungen: 'erinnerungenCard',
} as const satisfies Record<Unteransicht, keyof Dict>

/**
 * **Einstellungen** (T121, Entwürfe `GEinstellungen`, `GDesktopEinstellungen`;
 * nur Admins): am Handy Karten mit Zeilen — ein Tipp öffnet ein Blatt oder
 * eine Unteransicht (Programmsprachen, Hilfsdienste, Gruppen, Erinnerungen);
 * am Desktop links die Abschnitte, rechts der gewählte.
 *
 * Konten und Einladungen laufen bei der Person (Karte „Konto"), die Rechte
 * ebenso — hier steht nur, wer plant. Der Grundplan der Treffpunkte steht im
 * Predigtdienst (`FsRulesPanel`).
 */
export function EinstellungenScreen() {
  const desktop = useMedia(DESKTOP_BREITE)
  return desktop ? <EinstellungenDesktop /> : <EinstellungenHandy />
}

function EinstellungenHandy() {
  const { state } = useApp()
  const { t } = useT()
  const [offen, setOffen] = useState<Unteransicht | null>(null)
  // Zurück am Handy schließt zuerst die Unteransicht, dann den Bildschirm.
  useBackDismiss(offen !== null, () => setOffen(null), 'unteransicht')

  if (offen) {
    return (
      <section className="screen einstellungen">
        <UnteransichtKopf titel={t[UNTERANSICHT_TITEL[offen]]} onZurueck={() => setOffen(null)} />
        <UnteransichtInhalt welche={offen} />
      </section>
    )
  }
  return (
    <section className="screen einstellungen">
      <h1 className="seitentitel">{t.einstellungen}</h1>
      <VersammlungKarte onSprachen={() => setOffen('sprachen')} />
      <ZusammenkuenfteKarte onHilfsdienste={() => setOffen('hilfsdienste')} />
      <section className="karte einst-karte">
        <h2 className="abschnitt-titel karte-titel">{t.tabFs}</h2>
        <EinstellZeile name={t.gruppenTitel} wert={String(state.groups.length)} onTipp={() => setOffen('gruppen')} />
      </section>
      <section className="karte einst-karte">
        <h2 className="abschnitt-titel karte-titel">{t.mitteilungen}</h2>
        <EinstellZeile
          name={t.erinnerungenCard}
          unter={erinnerungKurz(state.reminders, t, state.lang)}
          onTipp={() => setOffen('erinnerungen')}
        />
      </section>
      <WerPlantKarte />
      <ProgrammKarte />
    </section>
  )
}

function UnteransichtInhalt({ welche }: { welche: Unteransicht }) {
  switch (welche) {
    case 'sprachen':
      return <SprachenInhalt />
    case 'hilfsdienste':
      return <HilfsdiensteInhalt />
    case 'gruppen':
      return <GruppenInhalt />
    case 'erinnerungen':
      return <ErinnerungenInhalt />
  }
}

function EinstellungenDesktop() {
  const { state } = useApp()
  const { t } = useT()
  const [gewaehlt, setGewaehlt] = useState<Abschnitt>('versammlung')
  const { geladenBis } = useWochenImport()
  useLangNames(state.lang)
  const kurz: Record<Abschnitt, string> = {
    versammlung: [state.congregation.name, sprachenText(state.congLang, state.progLangs, state.lang)].filter(Boolean).join(' · '),
    zusammenkuenfte: `${zusammenkunftText(state.congregation.times.mid, state.lang)} · ${zusammenkunftText(state.congregation.times.we, state.lang)}`,
    hilfsdienste: fill(t.diensteN, { n: state.services.length }),
    gruppen: fill(t.gruppenN, { n: state.groups.length }),
    erinnerungen: erinnerungKurz(state.reminders, t, state.lang),
    werPlant: fill(t.personenCount, { n: werPlant(state.persons, state.members, state.lang).length }),
    programm: geladenBis ? fill(t.geladenBis, { datum: geladenBis }) : t.geladenNichts,
  }
  const inhalt: Record<Abschnitt, () => ReactNode> = {
    // Ohne Kartentitel, wo er dem des Abschnitts gleicht — sonst stünde er zweimal da.
    versammlung: () => (
      <>
        <VersammlungKarte mitTitel={false} />
        <SprachenInhalt />
      </>
    ),
    zusammenkuenfte: () => <ZusammenkuenfteKarte mitTitel={false} />,
    hilfsdienste: () => <HilfsdiensteInhalt />,
    gruppen: () => <GruppenInhalt tabelle />,
    erinnerungen: () => <ErinnerungenInhalt />,
    werPlant: () => <WerPlantKarte mitTitel={false} />,
    programm: () => <ProgrammKarte mitTitel={false} />,
  }
  return (
    <div className="einst-raster">
      <nav className="einst-nav" aria-label={t.einstellungen}>
        <h1 className="seitentitel">{t.einstellungen}</h1>
        {ABSCHNITTE.map((abschnitt) => (
          <button
            key={abschnitt}
            type="button"
            className="einst-nav-eintrag"
            aria-current={abschnitt === gewaehlt ? 'true' : undefined}
            onClick={() => setGewaehlt(abschnitt)}
          >
            <span className="einst-nav-name">{t[ABSCHNITT_TITEL[abschnitt]]}</span>
            <span className="klein-text" dir={abschnitt === 'versammlung' ? 'auto' : undefined}>
              {kurz[abschnitt]}
            </span>
          </button>
        ))}
      </nav>
      <section className="screen einstellungen" aria-label={t[ABSCHNITT_TITEL[gewaehlt]]}>
        <h2 className="seitentitel">{t[ABSCHNITT_TITEL[gewaehlt]]}</h2>
        {inhalt[gewaehlt]()}
      </section>
    </div>
  )
}

/** „Deutsch, Englisch" — die Sprache der Versammlung zuerst, dann die weiteren. */
function sprachenText(congLang: string, progLangs: readonly string[], lang: Parameters<typeof langLabel>[1]): string {
  return [congLang, ...progLangs].map((code) => langLabel(code, lang)).join(', ')
}

/**
 * **Versammlung**: Name und Königreichssaal — je ein Blatt — und am Handy die
 * Programmsprachen als Unteransicht. Am Desktop stehen die Sprachen gleich
 * darunter (`SprachenInhalt`).
 *
 * `mitTitel`: Am Desktop steht der Titel schon über dem Abschnitt.
 */
function VersammlungKarte({ onSprachen, mitTitel = true }: { onSprachen?: () => void; mitTitel?: boolean }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [blatt, setBlatt] = useState<'name' | 'saal' | null>(null)
  useLangNames(state.lang)
  const feld = blatt === 'saal' ? 'hall' : 'name'
  return (
    <section className="karte einst-karte">
      {mitTitel && <h2 className="abschnitt-titel karte-titel">{t.versammlungCard}</h2>}
      <EinstellZeile name={t.nameLbl} wert={state.congregation.name} eigen onTipp={() => setBlatt('name')} />
      <EinstellZeile name={t.saal} wert={state.congregation.hall} eigen onTipp={() => setBlatt('saal')} />
      {onSprachen && (
        <EinstellZeile
          name={t.programmsprachen}
          wert={sprachenText(state.congLang, state.progLangs, state.lang)}
          onTipp={onSprachen}
        />
      )}
      {blatt && (
        <TextBlatt
          titel={blatt === 'saal' ? t.saal : t.nameLbl}
          wert={state.congregation[feld]}
          onWert={(wert) => dispatch({ type: 'updateCongregation', patch: { [feld]: wert } })}
          onClose={() => setBlatt(null)}
        />
      )}
    </section>
  )
}

/**
 * **Zusammenkünfte**: wann sie sind (je ein Blatt), die zusätzliche Klasse —
 * und am Handy die Hilfsdienste als Unteransicht; am Desktop sind sie ein
 * eigener Abschnitt.
 *
 * `mitTitel`: Am Desktop steht der Titel schon über dem Abschnitt.
 */
function ZusammenkuenfteKarte({ onHilfsdienste, mitTitel = true }: { onHilfsdienste?: () => void; mitTitel?: boolean }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [blatt, setBlatt] = useState<MeetingKey | null>(null)
  const zeilen: ReadonlyArray<[MeetingKey, string]> = [
    ['mid', t.unterDerWoche],
    ['we', t.amWochenende],
  ]
  return (
    <section className="karte einst-karte">
      {mitTitel && <h2 className="abschnitt-titel karte-titel">{t.navZusammenkuenfte}</h2>}
      {zeilen.map(([welche, name]) => (
        <EinstellZeile
          key={welche}
          name={name}
          wert={zusammenkunftText(state.congregation.times[welche], state.lang)}
          onTipp={() => setBlatt(welche)}
        />
      ))}
      {/* Zusätzliche Klasse (jw.org S-38, Absatz 27): gehört zur Versammlung, nicht
          zum Gerät — bei vielen Verkündigern laufen die Schulungsaufgaben
          parallel in einem zweiten Raum. Gilt für alle Wochen (13.10.2026). */}
      <div className="schalter-zeile einst-schalter">
        <span className="schalter-text">
          <span>{t.auxKlasse}</span>
          <span className="klein-text">{t.auxKurz}</span>
        </span>
        <Switch on={state.auxClass} label={t.auxKlasse} onToggle={() => dispatch({ type: 'setAuxClass', on: !state.auxClass })} />
      </div>
      {onHilfsdienste && <EinstellZeile name={t.hilfsdienste} wert={String(state.services.length)} onTipp={onHilfsdienste} />}
      {blatt && (
        <ZusammenkunftBlatt welche={blatt} titel={blatt === 'mid' ? t.unterDerWoche : t.amWochenende} onClose={() => setBlatt(null)} />
      )}
    </section>
  )
}
