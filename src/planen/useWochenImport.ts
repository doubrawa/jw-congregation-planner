import { useMemo } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { missingVariants } from '../data/localize'
import { fromIso, istVorbei, weekEndMs } from '../data/meeting-dates'
import type { Week } from '../data/types'
import { JW_TO_CONG, LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { holenNach, loadedUntilMs } from '../data/holen'
import { type ImportFehler, importNextWeek, importWeekVariants } from '../lib/import'

/**
 * Wie viele Wochen ihre Sprachvarianten gleichzeitig nachholen dürfen.
 *
 * Vier: genug, damit ein Nachzug über ein ganzes Ladefenster nicht mehr
 * Minuten dauert, und wenig genug, dass weder jw.org noch die Laufzeit der
 * Edge Function darunter leidet.
 */
const VARIANTEN_BLOCK = 4

/**
 * **Der Programm-Import als eine Handlung** — dieselbe hinter jedem „Holen".
 *
 * Er stand bis T95 nur im Import-Panel der Einstellungen, danach auch auf dem
 * Start, seit Phase 10 von T121 bei den Wochen (`GWochen`, `GDesktopPlanen`)
 * und auf dem Start — die Einstellungen führen ihn nicht mehr. Stünde der
 * Ablauf mehrmals da, liefe er auseinander — und die Grenzen darin sind keine
 * Kleinigkeiten: Offline wird gar nicht erst angefangen, und fehlende
 * Sprachvarianten werden vor der neuen Woche nachgeholt.
 *
 * **Holen und Übernehmen sind zwei Schritte** (Entwurf `GImport`): Erst zeigt
 * das Blatt, was aus dem Arbeitsheft kam, dann hängt „Übernehmen" die Woche
 * an — auf Wunsch gleich mit dem automatischen Zuteilen.
 */
export function useWochenImport(): {
  /**
   * Darf jetzt geholt werden? Nicht im Offline-Stand (dann mit Hinweis) und
   * nicht, solange schon geholt wird.
   */
  holenMoeglich: () => boolean
  /**
   * Holt die nächste Woche von jw.org, ohne sie anzuhängen. `null`, wenn
   * nichts kam — warum, sagt der Toast.
   */
  holen: () => Promise<Week | null>
  /**
   * Hängt eine geholte Woche an. Mit `zuteilen` öffnet sich ihr Plan, und die
   * offenen Plätze der ganzen Woche werden automatisch besetzt.
   */
  uebernehmen: (week: Week, zuteilen: boolean) => void
  /** Bis wann Programme vorliegen, als Text — `null`, wenn keine Woche geladen ist. */
  geladenBis: string | null
  /** Dasselbe als Kalendertag (`loadedUntilMs`) — `null` ohne Kalenderdaten. */
  geladenBisMs: number | null
} {
  const { state, dispatch } = useApp()
  const { t, tp } = useT()
  const heute = useKalendertag()

  /**
   * Bis wann Programme vorliegen. Vorher stand im Import-Panel eine feste
   * Beschriftung („Arbeitsheft Sep/Okt 2026"), die nichts über den tatsächlichen
   * Stand aussagte und mit der Zeit schlicht falsch wurde.
   *
   * Zwei Quellen, weil nur importierte Wochen ein ISO-Datum tragen: mit Datum
   * das echte Wochenende, ohne Datum (Demo- und Vorlagenwochen) der
   * Wochenbereich der letzten Woche im Klartext.
   *
   * Gemerkt, weil der Hook auf dem Start-Bildschirm hängt: Der rendert bei jedem
   * Dispatch, und das Datumsformat entstand dabei jedes Mal neu — auch wenn die
   * Zeile gar nicht angezeigt wird, weil die Programme reichen.
   */
  const { geladenBis, geladenBisMs } = useMemo(() => {
    const bisMs = loadedUntilMs(state.weeks)
    const letzte = state.weeks[state.weeks.length - 1]
    const text =
      bisMs !== null
        ? new Intl.DateTimeFormat(LOCALES[state.lang], {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC', // week.start ist ein reines Kalenderdatum
          }).format(bisMs)
        : letzte
          ? tp(letzte.range)
          : null
    return { geladenBis: text, geladenBisMs: bisMs }
  }, [state.weeks, state.lang, tp])

  const holenMoeglich = (): boolean => {
    if (state.importing) return false
    /*
     * **Offline-Stand: gar nicht erst anfangen.**
     *
     * Der Reducer weist Schreib-Aktionen im Offline-Stand ab (`readonly.ts`) —
     * aber nur den Reducer. Was danach in derselben Funktion steht, lief
     * weiter: eine Woche von jw.org holen, Varianten nachladen, und am Ende
     * wirft der abgewiesene `addImportedWeek` alles wieder weg. `startImport`
     * steht mit Absicht nicht in der Positivliste; die Antwort darauf ist der
     * Hinweis, nicht ein Ladebalken ins Leere.
     *
     * „Plan senden" (`sendeUmfang`) zieht dieselbe Grenze und aus demselben
     * Grund: Wer eine Edge Function unmittelbar ruft, kommt am Reducer vorbei.
     */
    if (state.staleAt) {
      dispatch({ type: 'showToast', text: t.offlineReadOnly })
      return false
    }
    return true
  }

  const holen = async (): Promise<Week | null> => {
    // Abruf der nächsten Woche von jw.org (Edge Function), direkt in der
    // Versammlungssprache (jw.org-Code, sonst Deutsch). Einen eigenen Zweig
    // für die Entwicklerseite gibt es nicht mehr: Bis zum 2.10.2026 hängte er
    // eine erfundene Woche aus den Testdaten an und zog sie damit in die App.
    // Die Seite hat keinen Client, also endet der Abruf wie ohne Datenbank.
    dispatch({ type: 'startImport' })
    // **Nur bekannte Codes.** Zustand und Datenbank führen den jw.org-Code;
    // steht dort etwas, das die Tabelle nicht kennt (eine Zeile aus der Zeit
    // der Anzeigenamen), holt der Import lieber Deutsch als eine Adresse, die
    // es nicht gibt.
    const langCode = JW_TO_CONG[state.congLang] ? state.congLang : 'de'
    // Weitere Programmsprachen als Varianten mitholen (ohne die Primärsprache)
    const altCodes = [
      ...new Set(state.progLangs.filter((c) => JW_TO_CONG[c] && c !== langCode)),
    ]
    /*
     * Erst fehlende Varianten bereits geladener Wochen nachholen (z. B. wenn
     * eine Programmsprache nach deren Import hinzugefügt wurde). Fehler je
     * Woche werden übersprungen — der nächste Import versucht es erneut.
     *
     * **In Blöcken, nicht einzeln nacheinander.** Wird eine zweite
     * Programmsprache nachträglich eingerichtet, sind das bei vollem
     * Ladefenster bis zu 52 Lücken — und jede ist ein eigener Aufruf der Edge
     * Function, die ihrerseits rund zehn Seiten von jw.org holt. Streng
     * nacheinander lagen damit Minuten hinter einem einzigen Knopfdruck, ohne
     * Fortschrittsanzeige außer „importiere …".
     *
     * Und nicht alle auf einmal: Die Blöcke begrenzen, was gleichzeitig gegen
     * jw.org läuft und wie lange die Function rechnet.
     *
     * **Nur Wochen, die noch kommen.** Eine vergangene braucht beim Planen
     * niemand mehr in einer weiteren Sprache — und `import-week` findet sie
     * nach dem Ende ihrer Ausgabe gar nicht mehr (`discoverWeeks` liest nur
     * die laufenden Ausgaben, die Antwort ist ein 404). Bis zum 16.10.2026
     * fragte deshalb jedes „Holen" nach jeder alten Woche ohne die Sprache
     * erneut: bei vollem Ladefenster rund vierzig vergebliche Aufrufe vor
     * jedem Abruf, jeder mit mehreren Seiten von jw.org.
     */
    const luecken = missingVariants(state.weeks, altCodes, langCode).filter(
      (luecke) => !istVorbei(weekEndMs(luecke.start), fromIso(heute)),
    )
    for (let i = 0; i < luecken.length; i += VARIANTEN_BLOCK) {
      const block = luecken.slice(i, i + VARIANTEN_BLOCK)
      const geholt = await Promise.all(
        block.map((gap) => importWeekVariants(gap.start, gap.lang, gap.codes)),
      )
      // Eingetragen wird in Blockreihenfolge, damit der Ablauf nachvollziehbar
      // bleibt — die Wochen sind voneinander unabhängig.
      block.forEach((gap, j) => {
        const filled = geholt[j]
        if (filled?.ok && filled.week.alt) {
          dispatch({ type: 'mergeWeekAlt', start: gap.start, alt: filled.week.alt })
        }
      })
    }
    // Ab demselben Tag gerechnet wie „Holen" bei den Wochen (`naechsteHolWoche`).
    const res = await importNextWeek(holenNach(state.weeks, fromIso(heute)), langCode, altCodes)
    // Geholt ist geholt: Ob die Woche übernommen wird, entscheidet das Blatt.
    dispatch({ type: 'stopImport' })
    if (res.ok) return res.week
    // Jeder Fehler hat seinen Satz in der Sprache des Lesers — keiner kommt
    // als Meldung des Servers durch (`ImportFehler`). Ohne Datenbank (auch:
    // Entwicklerseite) ist der Abruf gar nicht möglich; hier stand früher der
    // Anmeldehinweis, der vom Anmelden redet und nicht passte.
    const TEXT: Record<ImportFehler, string> = {
      'ohne-datenbank': t.importOhneDb,
      ende: t.toastAlleWochen,
      'sprache-fehlt': t.holenSpracheFehlt,
      unbekannt: t.importFehler,
    }
    dispatch({ type: 'showToast', text: TEXT[res.error] })
    return null
  }

  const uebernehmen = (week: Week, zuteilen: boolean): void => {
    /*
     * Die Woche kommt ans Ende (`addImportedWeek`): Geholt wird immer die nach
     * der spätesten. Steht dieselbe schon da, hängt der Reducer nichts an und
     * sagt es — dann gibt es auch keinen Plan zu öffnen.
     */
    const neu = !state.weeks.some((w) => w.start === week.start)
    const wi = state.weeks.length
    dispatch({ type: 'addImportedWeek', week })
    if (!zuteilen || !neu) return
    // Der Reducer arbeitet die Aktionen der Reihe nach ab: Der Sprung sieht die
    // neue Woche schon, das Zuteilen den Sprung.
    dispatch({ type: 'navigate', screen: 'planen', woche: { wi, tab: 'mid' } })
    dispatch({ type: 'autoAssign', scope: 'all', umfang: 'woche' })
  }

  return { holenMoeglich, holen, uebernehmen, geladenBis, geladenBisMs }
}
