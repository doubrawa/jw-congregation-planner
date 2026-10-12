import { Fragment, useRef, useState } from 'react'
import { useApp, useAppDispatch } from '../app/context'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { movableIndices } from '../data/meeting-edit'
import { istSchuelerteil } from '../data/aux-class'
import { dauerAbtrennen, rolleMitHerkunft, istArt, isGuestRole, isSong, mtab, ROLE_CIRCUIT, splitOpeningSong } from '../data/helpers'
import {
  closingSongNr,
  hatLiedPlatz,
  itemMinutes,
  LAC_MAX_MINUTEN,
  LAC_MIN_MINUTEN,
  openingSongNr,
  TALK_PLACEHOLDER,
  themaVon,
} from '../data/meeting-edit'
import { isSpeakerRole } from '../data/helpers'
import { rechteVon } from '../data/rechte'
import { nurZiffern } from '../data/ziffern'
import { useKonflikte } from './useKonflikte'
import { useZusage } from './useZusage'
import { SONG_WORD } from '../../supabase/functions/_shared/i18n/translate-data.ts'
import { useT } from '../i18n/useT'
import type { PartItem, Section, SlotAssignment } from '../data/types'
import { platzAnzeige } from './platz-anzeige'
import { PlatzZeile } from './PlatzZeile'

/**
 * Den Partner eines Schülerteils an- oder abschalten.
 *
 * **Abschalten fragt nach** (4.10.2026): Mit dem Platz geht, wer dort zugeteilt
 * ist — und hatte er zugesagt, bekommt er sofort „Zuteilung zurückgezogen".
 * Anschalten nimmt nichts weg und geht mit einem Tipp.
 */
function PartnerKnopf({ si, ii, hasPartner }: { si: number; ii: number; hasPartner: boolean }) {
  const dispatch = useAppDispatch()
  const { t } = useT()
  const umschalten = () => dispatch({ type: 'togglePartner', si, ii })
  if (!hasPartner) {
    return (
      <button type="button" className="partner-toggle" onClick={umschalten}>
        {t.partnerHinzu}
      </button>
    )
  }
  return <EntfernenKnopf className="partner-toggle" text={t.partnerEntfernen} frage={t.entfernenSicher} onEntfernen={umschalten} />
}

/**
 * Die Minuten eines LAC-Punkts — **direkt eingeben**.
 *
 * Hier standen bis zum 18. September 2026 zwei Knöpfe, und die sprangen in
 * Fünferschritten: „19 Minuten" war damit nicht einstellbar, „20" kostete vier
 * Tipps. Ein Feld nennt den Wert selbst.
 *
 * **Gespeichert wird beim Verlassen, nicht bei jedem Tastendruck.** Sonst wäre
 * die „1" von „19" schon ein eigener Wert — die Zahl würde auf das Minimum
 * geklemmt, das Ende der Zusammenkunft nachgezogen und der Schreibvorgang
 * angestoßen, bevor überhaupt zu Ende getippt ist. Solange das Feld den Fokus
 * hat, gilt deshalb der Entwurf; danach wieder der Wert aus den Daten — der
 * kann ein anderer sein, weil `lacMinuten` auf 5..45 klemmt.
 */
function MinutenFeld({
  mins,
  einheit,
  label,
  onSetzen,
}: {
  mins: number
  einheit: string
  label: string
  onSetzen: (wert: number) => void
}) {
  const [entwurf, setEntwurf] = useState(String(mins))
  const [tippt, setTippt] = useState(false)
  const abbruch = useRef(false)

  /**
   * Übernehmen — **gelesen wird aus dem Feld, nicht aus dem Entwurf.**
   *
   * Das Feld trägt den Wert unabhängig davon, ob React den Entwurf schon
   * übernommen hat; der Entwurf ist nur die Anzeige während des Tippens. Wer
   * hier den Zustand läse, machte das Übernehmen von der Reihenfolge zweier
   * Renderläufe abhängig — eine Abhängigkeit, die kein Nutzen rechtfertigt.
   */
  const beenden = (feld: HTMLInputElement) => {
    setTippt(false)
    if (abbruch.current) {
      abbruch.current = false
      setEntwurf(String(mins))
      return
    }
    const roh = feld.value.trim()
    const zahl = Number(roh)
    // Ein leeres Feld ist keine Null: Wer alles löscht und weiterklickt,
    // wollte die Dauer nicht auf das Minimum setzen.
    if (roh && Number.isFinite(zahl)) onSetzen(zahl)
    else setEntwurf(String(mins))
  }

  return (
    <span className="lac-mins">
      <input
        className="lac-mins-input"
        type="number"
        inputMode="numeric"
        min={LAC_MIN_MINUTEN}
        max={LAC_MAX_MINUTEN}
        step={1}
        aria-label={label}
        value={tippt ? entwurf : String(mins)}
        onFocus={(e) => {
          setEntwurf(String(mins))
          setTippt(true)
          e.currentTarget.select()
        }}
        onChange={(e) => setEntwurf(e.target.value)}
        onBlur={(e) => beenden(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          // Abbrechen über ein Merkfähnchen statt über den Entwurf: Das
          // Verlassen liest das Feld, und dort stünde die verworfene Zahl noch.
          if (e.key === 'Escape') {
            abbruch.current = true
            e.currentTarget.blur()
          }
        }}
      />
      <span className="lac-mins-einheit">{einheit}</span>
    </span>
  )
}

/**
 * Ein Programm-Abschnitt beim Planen (T121, Entwurf `GPlanen`): eine Karte wie
 * beim Ansehen, je Punkt Titel und Dauer und darunter — ab dem Tablet daneben —
 * seine Plätze als Zeilen (`PlatzZeile`); ein Tipp öffnet das Zuteilen. Bei
 * „Unser Leben als Christ" mit Minuten-/Verschieben-/Löschen-Steuerung und
 * Punkt-hinzufügen, am Wochenende Vortragsthema (Freitext) und Anfangslied.
 *
 * `section` ist die Anzeige-Fassung (Programmsprache), `rawSection` die
 * kanonische (deutsche Labels/Minuten) — die Logik läuft immer auf `rawSection`.
 */
export function MeetingSection({
  si,
  section,
  rawSection,
  mitAux,
  tpw,
}: {
  si: number
  section: Section
  rawSection: Section
  mitAux: boolean // Zusammenkunft mit Zusätzlicher Klasse
  tpw: (s: string) => string
}) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [lacTitle, setLacTitle] = useState('')

  const isLac = istArt(rawSection, 'lac')
  // Den Ablauf ändert nur der Admin — eigene Punkte, Reihenfolge, Minuten
  // (4.10.2026). Thema, Lieder und Partner gehören zum Zuteilen: Die setzt
  // auch der Planer (Grenzfälle des Betreibers, `zuteilen-grenze.ts`).
  const darfUmbauen = rechteVon(state).admin
  // Wochenende: Vortragsthema als Freitext, Anfangslied als Nummernfeld
  const isTalk = state.tab === 'we' && istArt(rawSection, 'vortrag')
  const isOpening = state.tab === 'we' && istArt(rawSection, 'eroeffnung')
  // …und am Wochenende ebenso das Schlusslied: es steht nicht im Arbeitsheft,
  // sondern kommt aus der Studienausgabe — fehlt sie, muss es nachtragbar sein.
  const isClosing = state.tab === 'we' && istArt(rawSection, 'abschluss')
  // „SCHLUSSLIED“ als eigener UI-Schlüssel scheitert nicht am Aufwand, sondern
  // an der Quelle: gemessen am Kongressprogramm in allen 34 Sprachen (T33)
  // nennen 8 davon Lied und Gebet mit *einem* Schlusswort, Französisch mit gar
  // keinem. „Lied“ liegt dagegen überall gemessen vor — unter der ebenfalls
  // gemessenen Überschrift ABSCHLUSS ist es eindeutig.
  const schlussliedLbl = (SONG_WORD[state.lang] ?? 'Lied').toUpperCase()
  // Lied aus dem ERÖFFNUNG/ABSCHLUSS-Sammeltitel mittig+kursiv herausziehen —
  // außer dort, wo es als editierbares Nummernfeld bleibt („beim Planen am
  // Sonntag"): Wochenend-Eröffnung und Wochenend-Abschluss.
  const splitSong =
    (istArt(rawSection, 'eroeffnung') && !isOpening) ||
    (istArt(rawSection, 'abschluss') && !isClosing)
  const movables = movableIndices(rawSection.items)
  // Gefragt wird an der **kanonischen** Woche: Das Lied-Atom heißt dort
  // „Lied", in der Anzeigesprache steht womöglich „Song" oder „سرود".
  const liedPlatzDa =
    (isOpening || isClosing) &&
    hatLiedPlatz(state.weeks[state.week]?.we, isOpening ? 'eroeffnung' : 'abschluss')
  // Die gespeicherte Liednummer des Felds. Ohne Woche gäbe es diesen Abschnitt
  // nicht; der Index-Zugriff sieht das nicht.
  const liedWe = state.weeks[state.week]?.we
  const liedNr = !liedWe ? '' : isOpening ? openingSongNr(liedWe) : isClosing ? closingSongNr(liedWe) : ''

  // Die Zusage je Platz — dieselben Schlüssel, unter denen bestätigt wird.
  const zusage = useZusage()
  const tab = mtab(state.tab)

  // Wer oben unter „Zu klären" steht, wird hier an seinem Platz rot.
  const konflikte = useKonflikte(tab)

  /**
   * Die Platzreihen eines Programmpunkts: nur Hauptsaal — oder Hauptsaal und
   * Zusätzliche Klasse, wenn eine eingerichtet ist und der Punkt ein
   * Schülerteil ist (Bibellesung, „Uns im Dienst verbessern").
   */
  const auxRows = (item: PartItem): Array<{ aux: boolean; slots: SlotAssignment[] }> => {
    const rows = [{ aux: false, slots: item.names }]
    if (mitAux && istSchuelerteil(item)) rows.push({ aux: true, slots: item.aux ?? [] })
    return rows
  }

  const openPartSlot = (
    ii: number,
    ni: number,
    item: PartItem,
    slot: SlotAssignment,
    aux = false,
  ) => {
    // Rolle und Raum stehen getrennt vom Titel: beide gehören in die Sprache
    // des Lesers, der Titel in die der Versammlung (siehe SlotSelection.label).
    // Im Sheet-Titel den Raum nennen — sonst sieht man beim Zuteilen nicht, ob
    // man gerade den Hauptsaal oder die Zusätzliche Klasse besetzt.
    const rolle = rolleMitHerkunft(slot) ?? ''
    const raum = aux ? t.auxKlasse : ''
    dispatch({
      type: 'openSlot',
      sel: {
        kind: 'part',
        wi: state.week,
        tab,
        si,
        ii,
        ni,
        aux: aux || undefined,
        label: item.title,
        labelRolle: [rolle, raum].filter(Boolean).join(' · ') || undefined,
        priv: slot.bereichsKey ?? null,
        groups: false,
        // `isSpeakerRole`, nicht `isGuestRole`: das Flag öffnet die
        // Freitext-Felder und muss deshalb auch beim **eigenen** Redner gesetzt
        // sein — sonst gäbe es keinen Weg zurück zum Gastredner (T29).
        guest: isSpeakerRole(slot.rolle),
      },
    })
  }

  const addLac = () => {
    if (!lacTitle.trim()) {
      dispatch({ type: 'showToast', text: t.toastNameEingeben })
      return
    }
    dispatch({ type: 'lacAdd', si, title: lacTitle })
    setLacTitle('')
  }

  // Die Lieder stehen rechts im Kopf, wie beim Ansehen: eigene Liedzeilen und
  // das Lied aus dem Sammeltitel von Eröffnung und Abschluss — außer dort, wo
  // es am Wochenende ein Nummernfeld ist (unten).
  const lieder: string[] = []
  for (const item of section.items) {
    const lied = isSong(item) ? tpw(item.song) : splitSong ? splitOpeningSong(tpw(item.title)).song : null
    if (lied) lieder.push(lied)
  }

  return (
    <section className="prog-abschnitt" data-farbe={section.farbe}>
      <div className="prog-abschnitt-kopf">
        <h2 className="prog-abschnitt-name">{tpw(section.label)}</h2>
        {lieder.length > 0 && <span className="prog-lied">{lieder.join(' · ')}</span>}
      </div>
      {section.items.map((item, ii) => {
        if (isSong(item)) return null
        // Die Sprachvariante ist strukturgleich zur kanonischen Woche
        // (`localizedWeek` prüft das); ohne kanonisches Gegenstück bleibt der
        // Punkt lesbar, aber nicht bearbeitbar.
        const rawItem = rawSection.items[ii] ?? item
        // Der Schlüssel eines Platzes kommt aus der kanonischen Woche (`iid`).
        const keyItem = isSong(rawItem) ? item : rawItem
        const rawTitle = isSong(rawItem) ? '' : rawItem.title
        // Punkt der Kreisaufseher-Woche? Sein fester Begriff ist das erste Atom
        // des kanonischen Titels; dahinter steht das Thema (T62).
        const istCoPunkt = !isSong(rawItem) && rawItem.names.some((n) => n.rolle === ROLE_CIRCUIT)
        const coBegriff = istCoPunkt ? (rawTitle.split(' · ')[0] ?? '') : ''
        const rawMins = isSong(rawItem) ? null : itemMinutes(rawItem)
        const editable = darfUmbauen && isLac && rawMins != null
        const mPos = movables.indexOf(ii)
        // Schülerteil (Gesprächsführer-Slot vorhanden) → Partner an-/abschaltbar.
        // Sprachunabhängig über die Qualifikation erkannt, nicht über den Label-Text.
        const canPartner = !isSong(rawItem) && rawItem.names.some((n) => n.bereichsKey === 'schulung')
        const hasPartner =
          !isSong(rawItem) && rawItem.names.some((n) => n.bereichsKey === 'schulungPartner')
        const { song, rest } = splitSong
          ? splitOpeningSong(tpw(item.title))
          : { song: null, rest: '' }
        // Die Dauer neben dem Titel, wie beim Ansehen (`dauerAbtrennen`).
        const { dauer, rest: zusatz } = dauerAbtrennen(item.meta ?? '', item.mins)
        return (
          <div key={ii} className="prog-row">
            <div className="prog-row-text">
              {coBegriff && !isTalk ? (
                /*
                  Dienstvortrag und Schlussvortrag der Kreisaufseher-Woche
                  (T62): der Begriff steht fest und wird übersetzt, das Thema
                  ist Freitext dahinter — wie „Bibellesung · Jer 32:6-18".
                  Erkannt am Rollen-Platz, nicht am Titeltext: der Titel ist in
                  der Anzeigesprache, die Rolle ist kanonisch.
                */
                <div className="plan-item-title">
                  <span className="co-begriff">{tpw(coBegriff)}</span>
                  <input
                    // Mit dem gespeicherten Titel im Schlüssel, wie beim
                    // Vortragsthema darunter: Ein ungesteuertes Feld zeigte
                    // nach einer Änderung von außen sonst den alten Text.
                    key={`thema-${state.week}-${si}-${ii}-${rawTitle}`}
                    type="text"
                    dir="auto"
                    className="talk-title-input"
                    placeholder={t.vortragThemaPh}
                    aria-label={t.vortragThemaPh}
                    defaultValue={themaVon(rawTitle, coBegriff)}
                    onBlur={(e) =>
                      dispatch({
                        type: 'setPartThema',
                        tab,
                        si,
                        ii,
                        begriff: coBegriff,
                        thema: e.target.value,
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                  />
                </div>
              ) : isTalk ? (
                <input
                  // Der gespeicherte Titel gehört in den Schlüssel: Das Feld ist
                  // ungesteuert, und setzt ihn jemand von außen (Vortragsplan,
                  // T122), zeigte es sonst den alten — und schriebe ihn beim
                  // Verlassen zurück.
                  key={`talk-${state.week}-${ii}-${rawTitle}`}
                  type="text"
                  dir="auto"
                  className="talk-title-input"
                  placeholder={t.vortragThemaPh}
                  aria-label={t.vortragThemaPh}
                  defaultValue={rawTitle === TALK_PLACEHOLDER ? '' : rawTitle}
                  onBlur={(e) => dispatch({ type: 'talkEdit', si, ii, title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                />
              ) : (
                <div className="prog-title">
                  {item.num != null && <span className="prog-num">{item.num} </span>}
                  {song ? rest : tpw(item.title)}
                </div>
              )}
              {zusatz && <div className="prog-item-meta">{tpw(zusatz)}</div>}
              {editable && (
                <div className="lac-edit">
                  {/*
                    Die Einheit kommt aus dem Programm-Übersetzer, nicht aus der
                    Oberfläche: Sie steht neben einer Zahl des Programms und folgt
                    deshalb der Versammlungssprache („min.", „دقيقة", „分"). Geholt
                    wird sie, indem eine Null übersetzt und wieder abgezogen wird —
                    die Wörterbücher kennen nur die ganze Angabe „N Min.".
                  */}
                  <MinutenFeld
                    mins={rawMins}
                    einheit={tpw('0 Min.').replace(/^0/, '')}
                    label={t.a11yMinuten}
                    onSetzen={(wert) => dispatch({ type: 'lacMinuten', si, ii, mins: wert })}
                  />
                  <div className="lac-move">
                    <button
                      type="button"
                      className="lac-move-btn"
                      aria-label={t.a11yMoveUp}
                      disabled={mPos <= 0}
                      onClick={() => dispatch({ type: 'lacMove', si, ii, dir: -1 })}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="lac-move-btn"
                      aria-label={t.a11yMoveDown}
                      disabled={mPos >= movables.length - 1}
                      onClick={() => dispatch({ type: 'lacMove', si, ii, dir: 1 })}
                    >
                      ▼
                    </button>
                  </div>
                  <span className="lac-spacer" />
                  <EntfernenKnopf className="lac-remove" onEntfernen={() => dispatch({ type: 'lacRemove', si, ii })} />
                </div>
              )}
              {canPartner && <PartnerKnopf si={si} ii={ii} hasPartner={hasPartner} />}
            </div>
            {dauer && <span className="prog-dauer">{tpw(dauer)}</span>}
            <div className="prog-names">
              {/*
                Zwei Reihen, sobald eine Zusätzliche Klasse eingerichtet ist:
                derselbe Programmpunkt wird dort parallel durchgeführt. Ohne
                Klasse bleibt es die schlichte, unbeschriftete Reihe von vorher.
              */}
              {auxRows(item).map(({ aux, slots }, _, reihen) => (
                <Fragment key={aux ? 'aux' : 'haupt'}>
                  {/* Raum nur benennen, wo es tatsächlich zwei Reihen gibt —
                      sonst stünde „Hauptsaal" auch über Gebet und Vorsitz. */}
                  {reihen.length > 1 && <div className="prog-raum">{aux ? t.auxKlasse : t.auxHauptsaal}</div>}
                  {slots.map((slot, ni) => {
                    // Keine Zusage, wo es nichts zu bestätigen gibt: Wer in
                    // `SKIP_ROLE` steht (Gastredner, Kreisaufseher), hat weder
                    // Aufgabe noch Erinnerung noch die App, und eine
                    // ausgefallene Zusammenkunft hat gar keine Aufgaben (T30).
                    const stand =
                      slot.name && !isGuestRole(slot.rolle) && zusage.moeglich(tab)
                        ? zusage.teil(tab, keyItem, ni, aux)
                        : null
                    // **Auch der leere Platz nennt seine Rolle**: Beim
                    // Versammlungsbibelstudium sind Leiter und Leser sonst zwei
                    // gleiche Zeilen, und beim Schülerteil gilt die
                    // Geschlechterregel für den Partner-Platz. Die Rolle in der
                    // Sprache des Lesers — sie gehört zur Bedienung.
                    const rolle = rolleMitHerkunft(slot)
                    return (
                      <PlatzZeile
                        key={ni}
                        name={slot.name}
                        rolle={rolle ? tu(rolle) : undefined}
                        {...platzAnzeige(slot, stand, konflikte.von(slot), t)}
                        onClick={() => openPartSlot(ii, ni, item, slot, aux)}
                      />
                    )
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        )
      })}
      {isLac && darfUmbauen && (
        <div className="lac-add-row">
          <input
            type="text"
            dir="auto"
            className="lac-add-input"
            placeholder={t.lacPh}
            aria-label={t.lacPh}
            value={lacTitle}
            onChange={(e) => setLacTitle(e.target.value)}
          />
          <button type="button" className="lac-add-btn" onClick={addLac}>
            {t.lacAdd}
          </button>
        </div>
      )}
      {/*
        Nur wo die Nummer auch landen kann (V7): Trägt der Abschnitt weder ein
        Lied-Item noch ein Lied-Atom im Titel, hätte `setSong` nichts, wohin es
        schreiben könnte — der Planer tippte eine Zahl ein und sähe nichts.
      */}
      {(isOpening || isClosing) && liedPlatzDa && (
        <div className="talk-song-row">
          <span className="plan-helper-label">
            {isOpening ? t.anfangsliedLbl : schlussliedLbl}
          </span>
          <input
            // Die gespeicherte Nummer im Schlüssel — aus demselben Grund wie
            // beim Vortragsthema: Der Vortragsplan setzt das Anfangslied von
            // außen.
            key={`song-${isOpening ? 'open' : 'close'}-${state.week}-${liedNr}`}
            type="text"
            inputMode="numeric"
            maxLength={4}
            className="lac-add-input talk-song-input"
            placeholder={t.liedNrPh}
            aria-label={isOpening ? t.anfangsliedLbl : schlussliedLbl}
            defaultValue={liedNr}
            onInput={(e) => {
              // Nur Ziffern zulassen (Liederbuch-Nummer) — jeder Schrift.
              const el = e.currentTarget
              const digits = nurZiffern(el.value)
              if (el.value !== digits) el.value = digits
            }}
            onBlur={(e) =>
              dispatch({ type: isOpening ? 'openingSong' : 'closingSong', song: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </div>
      )}
    </section>
  )
}
