import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { Sheet } from '../components/Sheet'
import { gebundenesDatum } from '../components/datum-anzeige'
import { ROLE_GUEST_SPEAKER, ROLE_OWN_SPEAKER } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import {
  hatAenderungen,
  personFehlt,
  vortragsplanVorschau,
  type Uebersprungen,
  type Vorschauart,
  type Vortrag,
  type VorschauZeile,
} from '../data/vortragsplan'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { vortragsplanLesen, type DateiFehler, type LeseErgebnis, type LeseFehlerGrund } from '../lib/vortragsplan-xml'
import { SONG_WORD } from '../../supabase/functions/_shared/i18n/translate-data.ts'
import './planen.css'

/**
 * **Vortragsplan aus dem Planungsprogramm übernehmen** (T122) — für Planer und
 * Admin, als Karte bei den Wochen unter „Holen" (`WochenListe`): auf der Seite
 * „Planung" und am breiten Bildschirm in der Spalte neben dem Plan. Beide
 * Importe stehen so dort, wo die kommenden Wochen vorbereitet werden. Bis zum
 * 18.10.2026 stand das Feld ganz unten im Reiter Wochenende, unter den
 * Hilfsdiensten — der Betreiber fand es nicht.
 *
 * Die Datei wird hier auf dem Gerät gelesen; was die App nicht kennt (Telefon,
 * E-Mail …), geht nicht weiter und wird in der Vorschau genannt. Erst
 * „Übernehmen" schreibt — und der Reducer rechnet die Vorschau dabei mit dem
 * dann gültigen Stand neu (`vortragsplanUebernehmen`).
 */

type Gelesen = Extract<LeseErgebnis, { ok: true }>

const DATEI_FEHLER: Record<DateiFehler, keyof Dict> = {
  keinXml: 'vpKeinXml',
  // Falsche Wurzel und fremde Version sagen dasselbe: nicht dieses Format.
  wurzel: 'vpFormat',
  version: 'vpFormat',
  zeitraum: 'vpZeitraum',
}

const LESE_FEHLER: Record<LeseFehlerGrund, keyof Dict> = {
  datum: 'vpFehlerDatum',
  redner: 'vpFehlerRedner',
  versammlung: 'vpFehlerVersammlung',
  lied: 'vpFehlerLied',
  doppelt: 'vpFehlerDoppelt',
}

/**
 * Was eine Woche der Vorschau ankündigt — „unverändert" steht nur gezählt da.
 * Ganze Klassennamen, nicht `vp-art--${art}`: Ein zusammengesetzter Name steht
 * nirgends im Quelltext, und `klassennamen.test.ts` fände die Regel tot.
 */
const ART: Record<Exclude<Vorschauart, 'unveraendert'>, { text: keyof Dict; klasse: string }> = {
  neu: { text: 'vpNeu', klasse: 'vp-art vp-art--neu' },
  geaendert: { text: 'vpGeaendert', klasse: 'vp-art vp-art--geaendert' },
  entfaellt: { text: 'vpEntfaellt', klasse: 'vp-art vp-art--entfaellt' },
  uebersprungen: { text: 'vpNichtUebernommen', klasse: 'vp-art vp-art--uebersprungen' },
}

/**
 * Warum eine Woche nicht übernommen wird — die Chips der Woche, schon in jeder
 * Sprache. Der Ausfall zeigt die Zusammenkunft durchgestrichen wie sein Banner;
 * eine Woche ohne Vortragsplatz (selten: ein umgebautes Programm) trägt nur das
 * Etikett „Nicht übernommen".
 */
const GRUND: Partial<Record<Uebersprungen, keyof Dict>> = {
  kreisaufseher: 'coWoche',
  kongress: 'kongress',
  gedaechtnismahl: 'memWoche',
}

export function VortragsplanKarte() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const eingabe = useRef<HTMLInputElement>(null)
  const [gelesen, setGelesen] = useState<Gelesen | null>(null)

  // Wer die Wochen vor sich hat, plant — Seite und Spalte zeigt die App nur
  // Admin und Planer — und darf übernehmen (RLS `vortraege_zuteilen`), wie er
  // „Holen" darf. Offline weist der Reducer es ab; dann steht die Karte gar
  // nicht erst da.
  if (state.staleAt) return null

  const dateiGewaehlt = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const datei = e.target.files?.[0]
    // Dieselbe Datei noch einmal wählen können (nach einer Korrektur im Programm).
    e.target.value = ''
    if (!datei) return
    let ergebnis: LeseErgebnis
    try {
      ergebnis = vortragsplanLesen(await datei.arrayBuffer())
    } catch {
      // Die Datei ließ sich gar nicht lesen (Netzlaufwerk weg, inzwischen geändert).
      dispatch({ type: 'showToast', text: t.vpKeinXml })
      return
    }
    if (!ergebnis.ok) {
      dispatch({ type: 'showToast', text: t[DATEI_FEHLER[ergebnis.grund]] })
      return
    }
    setGelesen(ergebnis)
  }

  return (
    <div className="vp-karte">
      {/* Eine Überschrift, damit der Vortragsplan beim Springen von Titel zu
          Titel auftaucht — er steht zwischen den Wochen, nicht in ihnen. */}
      <div className="vp-karte-text">
        <h3 className="vp-karte-titel">{t.vpTitel}</h3>
        <span className="klein-text">{t.vpKarteUnter}</span>
      </div>
      {/* Bedient wird über den Knopf daneben; das Feld selbst ist für
          Vorleseprogramme und Tabulator unsichtbar — nicht nur per CSS, das
          sieht `bedienbar.test.tsx` nicht. */}
      <input
        ref={eingabe}
        className="vp-eingabe"
        type="file"
        accept=".xml,application/xml,text/xml"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void dateiGewaehlt(e)}
      />
      <button type="button" className="knopf-pille" onClick={() => eingabe.current?.click()}>
        {t.vpDateiWaehlen}
      </button>
      {/* Das Blatt hängt am Dokument, nicht hier: Am breiten Bildschirm steht
          die Karte in der klebenden Wochenspalte, deren Ebene unter dem
          Wochenstreifen liegt — darin gerendert, läge das Blatt unter dem Plan
          (wie beim Blatt von „Holen"). */}
      {gelesen &&
        createPortal(<VortragsplanVorschau gelesen={gelesen} onClose={() => setGelesen(null)} />, document.body)}
    </div>
  )
}

function VortragsplanVorschau({ gelesen, onClose }: { gelesen: Gelesen; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const vorschau = useMemo(
    () =>
      vortragsplanVorschau(gelesen.plan, {
        weeks: state.weeks,
        vormerkungen: state.vortraege,
        persons: state.persons,
        zeiten: state.congregation.times,
      }),
    [gelesen.plan, state.weeks, state.vortraege, state.persons, state.congregation.times],
  )
  const zeilen = vorschau.zeilen.filter((z) => z.art !== 'unveraendert')
  const unveraendert = vorschau.zeilen.length - zeilen.length
  const aenderungen = hatAenderungen(vorschau)
  const datum = (tag: string): string => gebundenesDatum(fromIso(tag), state.lang, 'kurzerWochentag')

  return (
    <Sheet label={t.vpVorschau} title={t.vpVorschau} variante="lang" onClose={onClose}>
      <div className="vp-liste">
        {gelesen.fehler.length > 0 && (
          <div className="vp-fehler" role="alert">
            {gelesen.fehler.map((f, i) => (
              // Mit Stelle: Zwei gleiche Einträge ergeben denselben Fehler am selben Tag.
              <div key={`${i}|${f.datum}|${f.grund}`} className="vp-zeile">
                <span className="vp-art vp-art--fehler">{t[LESE_FEHLER[f.grund]]}</span>
                <span className="vp-tag" dir="auto">
                  {f.datum}
                </span>
              </div>
            ))}
          </div>
        )}
        {zeilen.map((z) => (
          <VorschauEintrag key={z.woche} zeile={z} tag={datum(z.tag)} />
        ))}
        {zeilen.length === 0 && gelesen.fehler.length === 0 && <p className="vp-notiz">{t.vpNichtsZuTun}</p>}
        {unveraendert > 0 && <p className="vp-notiz">{fill(t.vpUnveraendert, { n: unveraendert })}</p>}
        {vorschau.vergangen > 0 && <p className="vp-notiz">{fill(t.vpVergangen, { n: vorschau.vergangen })}</p>}
        {gelesen.ignoriert.length > 0 && (
          <p className="vp-notiz">{fill(t.vpIgnoriert, { felder: gelesen.ignoriert.join(', ') })}</p>
        )}
      </div>
      <div className="vp-aktionen">
        <button
          type="button"
          className="btn-primary"
          disabled={!aenderungen}
          onClick={() => {
            dispatch({ type: 'vortragsplanUebernehmen', plan: gelesen.plan })
            onClose()
          }}
        >
          {t.vpUebernehmen}
        </button>
        <button type="button" className="btn-outline" onClick={onClose}>
          {t.abbrechen}
        </button>
      </div>
    </Sheet>
  )
}

function VorschauEintrag({ zeile, tag }: { zeile: VorschauZeile; tag: string }) {
  const { t } = useT()
  // Gezeigt wird, was danach dasteht — beim entfallenen Vortrag, was wegfällt.
  const vortrag = zeile.nachher ?? zeile.vorher
  const art = zeile.art === 'unveraendert' ? null : ART[zeile.art]
  const grundText = zeile.grund ? GRUND[zeile.grund] : undefined
  const grund = zeile.grund === 'ausfall' ? <s>{t.tabWe}</s> : grundText ? t[grundText] : null
  // Was nicht in die Woche kommt, steht blasser da.
  const blass = zeile.art === 'entfaellt' || zeile.art === 'uebersprungen'
  return (
    <div className={blass ? 'vp-zeile vp-zeile--blass' : 'vp-zeile'}>
      <div className="vp-kopf">
        <span className="vp-tag">{tag}</span>
        {art && <span className={art.klasse}>{t[art.text]}</span>}
      </div>
      {vortrag && <VortragText vortrag={vortrag} durchgestrichen={zeile.art === 'entfaellt'} />}
      {zeile.art === 'geaendert' && zeile.vorher && zeile.vorher.redner !== zeile.nachher?.redner && (
        <div className="vp-hinweis" dir="auto">
          {fill(t.vpBisher, { name: zeile.vorher.redner || '—' })}
        </div>
      )}
      {grund && <div className="vp-hinweis">{grund}</div>}
      {!zeile.angelegt && zeile.art !== 'entfaellt' && <div className="vp-hinweis">{t.vpVorgemerkt}</div>}
      {zeile.art !== 'entfaellt' && personFehlt(zeile.nachher) && (
        <div className="vp-hinweis vp-hinweis--warnung">{t.vpOhnePerson}</div>
      )}
    </div>
  )
}

/** Redner wie im Programm („Gastredner · Musterstadt: Max Mustermann"), dazu Thema und Lied. */
function VortragText({ vortrag, durchgestrichen }: { vortrag: Vortrag; durchgestrichen: boolean }) {
  const { state } = useApp()
  const { tu } = useT()
  const rolle = tu(vortrag.eigener ? ROLE_OWN_SPEAKER : ROLE_GUEST_SPEAKER)
  const wer = (
    <>
      {rolle}
      {vortrag.versammlung && (
        <>
          {' · '}
          <bdi>{vortrag.versammlung}</bdi>
        </>
      )}
      {': '}
      <bdi>{vortrag.redner}</bdi>
    </>
  )
  return (
    <div className="vp-vortrag">
      <div className="vp-redner">{durchgestrichen ? <s>{wer}</s> : wer}</div>
      {vortrag.thema && (
        <div className="vp-thema" dir="auto">
          {vortrag.thema}
        </div>
      )}
      {vortrag.lied && (
        <div className="vp-lied">
          {SONG_WORD[state.lang] ?? 'Lied'} {vortrag.lied}
        </div>
      )}
    </div>
  )
}
