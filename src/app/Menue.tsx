/**
 * **Das Menü an der Seite** (T121) — am Handy als Schublade, am Tablet
 * hochkant als schmale Leiste mit Zeichen, am Desktop fest links. Am
 * 11.10.2026 entschieden: „das menü soll generell nicht unten sein sondern wie
 * vorher an der seite ausklappbar".
 *
 * Reine Präsentation: Einträge, Zustand und Handler kommen aus AppShell — dort
 * entsteht die Liste aus den Rechten, hier wird sie nur gezeichnet. Dieselbe
 * Liste füllt alle drei Formen; sie laufen so nicht auseinander.
 */

import { useRef } from 'react'
import { Logo } from '../bausteine/Logo'
import { Zeichen, type ZeichenName } from '../bausteine/Zeichen'
import { useBackDismiss } from '../components/useBackDismiss'
import { useDialogFocus } from '../components/useDialogFocus'
import { useEscape } from '../components/useEscape'
import { useT } from '../i18n/useT'
import './menue.css'

/** Ein Eintrag des Menüs: ein Bildschirm, ein Bereich oder die Mitteilungen. */
export interface MenueEintrag {
  key: string
  label: string
  /** Kürzerer Name für die schmale Leiste („Aufgaben"); sonst `label`. */
  kurz?: string
  zeichen: ZeichenName
  aktiv: boolean
  /** Zahl am Eintrag (warten auf Zusage, ungelesen) — 0 zeigt nichts. */
  zahl?: number
  onClick: () => void
}

/** Ein Abschnitt des Menüs; der erste (Start, Meine Aufgaben) trägt keinen Titel. */
export interface MenueAbschnitt {
  key: string
  titel: string | null
  eintraege: readonly MenueEintrag[]
}

/** Der Fuß: der Name führt zum Profil. */
export interface ProfilFuss {
  kuerzel: string
  name: string
  /** „Profil · Admin · Gruppe 1" */
  unterzeile: string
  aktiv: boolean
  onClick: () => void
}

/**
 * Das volle Menü (Baustein `GNav`): Marke, die Abschnitte, unten der Name.
 * `onSchliessen` gibt es nur in der Schublade — dort steht das Kreuz.
 */
export function Seitenmenue({
  abschnitte,
  versammlung,
  profil,
  onSchliessen,
}: {
  abschnitte: readonly MenueAbschnitt[]
  versammlung: string
  profil: ProfilFuss
  onSchliessen?: () => void
}) {
  const { t } = useT()
  return (
    <nav className="seitenmenue" aria-label={t.a11yMainNav}>
      <div className="seitenmenue-marke">
        <Logo breite={40} />
        <span className="seitenmenue-name">
          {/* `wbr`: Bei großer Schrift bricht die Wortmarke vor der Endung, nicht mitten im Wort. */}
          <span className="seitenmenue-app">
            Versammlung
            <wbr />
            .app
          </span>
          <span className="seitenmenue-versammlung" dir="auto">
            {versammlung}
          </span>
        </span>
        {onSchliessen && (
          <button type="button" className="rund-knopf rund-knopf--feld" aria-label={t.a11yClose} onClick={onSchliessen}>
            <Zeichen name="kreuz" />
          </button>
        )}
      </div>
      {abschnitte.map((abschnitt) => (
        <div
          key={abschnitt.key}
          className="seitenmenue-abschnitt"
          role={abschnitt.titel ? 'group' : undefined}
          aria-label={abschnitt.titel ?? undefined}
        >
          {/* Die Überschrift liest die Gruppe schon vor (`aria-label`). */}
          {abschnitt.titel && (
            <span className="seitenmenue-titel" aria-hidden="true">
              {abschnitt.titel}
            </span>
          )}
          {abschnitt.eintraege.map((e) => (
            <button
              key={e.key}
              type="button"
              className={e.aktiv ? 'menue-eintrag is-active' : 'menue-eintrag'}
              aria-current={e.aktiv ? 'page' : undefined}
              onClick={e.onClick}
            >
              <Zeichen name={e.zeichen} />
              <span className="menue-eintrag-text">{e.label}</span>
              {e.zahl ? <span className="menue-zahl">{e.zahl}</span> : null}
            </button>
          ))}
        </div>
      ))}
      <button
        type="button"
        className={profil.aktiv ? 'menue-profil is-active' : 'menue-profil'}
        aria-current={profil.aktiv ? 'page' : undefined}
        onClick={profil.onClick}
      >
        <span className="menue-kuerzel" aria-hidden="true">
          {profil.kuerzel}
        </span>
        <span className="menue-profil-text">
          <span className="menue-profil-name" dir="auto">
            {profil.name}
          </span>
          <span className="menue-profil-unterzeile">{profil.unterzeile}</span>
        </span>
      </button>
    </nav>
  )
}

/**
 * **Das Menü als Schublade** — am Handy und aus der schmalen Leiste heraus:
 * über einem Schleier, und es geht wie ein Blatt (`Sheet`) wieder weg — mit
 * dem Kreuz, dem Schleier, der Zurück-Taste und Escape. Gezeichnet wird sie
 * nur, solange sie offen ist; damit gelten die Haken genau so lange.
 *
 * Escape über `useEscape` wie jedes Blatt: Bis zum 13.10.2026 horchte die
 * Schublade selbst am Fenster — die Abschrift, die `useEscape` abgelöst hatte.
 */
export function Schublade({
  onSchliessen,
  ...menue
}: {
  abschnitte: readonly MenueAbschnitt[]
  versammlung: string
  profil: ProfilFuss
  onSchliessen: () => void
}) {
  const { t } = useT()
  const ref = useRef<HTMLElement>(null)
  useDialogFocus(ref)
  useBackDismiss(true, onSchliessen)
  useEscape(onSchliessen)
  return (
    <>
      <div className="schublade-schleier" onClick={onSchliessen} />
      <aside className="schublade" role="dialog" aria-modal="true" aria-label={t.menueLbl} ref={ref}>
        <Seitenmenue {...menue} onSchliessen={onSchliessen} />
      </aside>
    </>
  )
}

/**
 * Die schmale Leiste am Tablet hochkant (88 px, am 12.10.2026 bestätigt):
 * oben der Menüknopf, der das volle Menü ausklappt, dann je Eintrag Zeichen
 * und Name, unten das Kürzel zum Profil.
 */
export function SchmaleLeiste({
  abschnitte,
  profil,
  menueOffen,
  onMenue,
}: {
  abschnitte: readonly MenueAbschnitt[]
  profil: ProfilFuss
  menueOffen: boolean
  onMenue: () => void
}) {
  const { t } = useT()
  return (
    <nav className="schmale-leiste" aria-label={t.a11yMainNav}>
      <button
        type="button"
        className="rund-knopf schmale-leiste-menue"
        aria-label={t.menueLbl}
        aria-expanded={menueOffen}
        onClick={onMenue}
      >
        <Zeichen name="menue" />
      </button>
      {abschnitte.map((abschnitt, i) => (
        <div key={abschnitt.key} className="schmale-leiste-abschnitt">
          {i > 0 && <span className="schmale-leiste-trenner" aria-hidden="true" />}
          {abschnitt.eintraege.map((e) => (
            <button
              key={e.key}
              type="button"
              className={e.aktiv ? 'leisten-eintrag is-active' : 'leisten-eintrag'}
              aria-current={e.aktiv ? 'page' : undefined}
              onClick={e.onClick}
            >
              <span className="leisten-zeichen">
                <Zeichen name={e.zeichen} />
              </span>
              <span className="leisten-text">{e.kurz ?? e.label}</span>
              {e.zahl ? <span className="leisten-zahl">{e.zahl}</span> : null}
            </button>
          ))}
        </div>
      ))}
      <button
        type="button"
        className="rund-knopf schmale-leiste-profil"
        aria-label={`${profil.name}, ${t.navProfil}`}
        aria-current={profil.aktiv ? 'page' : undefined}
        onClick={profil.onClick}
      >
        {profil.kuerzel}
      </button>
    </nav>
  )
}
