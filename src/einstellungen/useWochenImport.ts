import { useMemo } from 'react'
import { useApp } from '../app/context'
import { missingVariants } from '../data/localize'
import { JW_TO_CONG, LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { importNextWeek, importWeekVariants, latestImportedStart, loadedUntilMs } from '../lib/import'

/**
 * **Der Programm-Import als eine Handlung** — dieselbe hinter zwei Knöpfen.
 *
 * Er stand bis T95 nur im Import-Panel der Einstellungen. Der Start-Bildschirm
 * sagt dem Planer jetzt, wenn die Programme knapp werden, und bietet den Knopf
 * gleich dort an. Stünde der Ablauf zweimal da, liefe er auseinander — und die
 * Grenzen darin sind keine Kleinigkeiten: Offline wird gar nicht erst
 * angefangen, und fehlende Sprachvarianten werden vor der neuen Woche
 * nachgeholt.
 *
 * Holt die nächste Woche von jw.org (Produktion) bzw. simuliert eine
 * Beispielwoche (Demo). Weitere Programmsprachen werden als Varianten
 * mitgeholt, fehlende Varianten bereits geladener Wochen nachgezogen.
 */
/**
 * Wie viele Wochen ihre Sprachvarianten gleichzeitig nachholen dürfen.
 *
 * Vier: genug, damit ein Nachzug über ein ganzes Ladefenster nicht mehr
 * Minuten dauert, und wenig genug, dass weder jw.org noch die Laufzeit der
 * Edge Function darunter leidet.
 */
const VARIANTEN_BLOCK = 4

export function useWochenImport(): {
  /** Startet den Import (nichts, solange einer läuft). */
  importieren: () => Promise<void>
  /** Beschriftung des Knopfs: bereit, läuft oder fertig. */
  knopf: string
  /** Bis wann Programme vorliegen, als Text — `null`, wenn keine Woche geladen ist. */
  geladenBis: string | null
  /** Dasselbe als Kalendertag (`loadedUntilMs`) — `null` ohne Kalenderdaten. */
  geladenBisMs: number | null
} {
  const { state, dispatch } = useApp()
  const { t, tp } = useT()

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

  const importieren = async (): Promise<void> => {
    if (state.importing) return
    /*
     * **Offline-Stand: gar nicht erst anfangen.**
     *
     * Der Reducer weist Schreib-Aktionen im Offline-Stand ab (`readonly.ts`) —
     * aber nur den Reducer. Was danach in derselben Funktion steht, lief
     * weiter: Der Abruf lief weiter — eine Woche von jw.org holen, Varianten
     * nachladen, und am Ende wirft der abgewiesene `addImportedWeek` alles
     * wieder weg. `startImport` steht mit Absicht nicht in der Positivliste;
     * die Antwort darauf ist der Hinweis, nicht ein Ladebalken ins Leere.
     *
     * `PlanSendenPanel` zieht dieselbe Grenze und aus demselben Grund: Wer eine
     * Edge Function unmittelbar ruft, kommt am Reducer vorbei.
     */
    if (state.staleAt) {
      dispatch({ type: 'showToast', text: t.offlineReadOnly })
      return
    }
    // Demo-Modus: simulierter Abruf (eine Beispielwoche) wie bisher
    if (state.dataStatus === 'demo') {
      if (state.imported) {
        dispatch({ type: 'showToast', text: t.toastAlleWochen })
        return
      }
      dispatch({ type: 'startImport' })
      setTimeout(() => dispatch({ type: 'finishImport' }), 900)
      return
    }
    // Produktion: echter Abruf der nächsten Woche von jw.org (Edge Function),
    // direkt in der Versammlungssprache (jw.org-Code, sonst Deutsch).
    dispatch({ type: 'startImport' })
    // **Nur bekannte Codes.** Zustand und Datenbank führen den jw.org-Code;
    // steht dort etwas, das die Tabelle nicht kennt (eine Zeile aus der Zeit
    // der Anzeigenamen, ein Tippfehler im Debug-Hash), holt der Import lieber
    // Deutsch als eine Adresse, die es nicht gibt.
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
     */
    const luecken = missingVariants(state.weeks, altCodes, langCode)
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
          dispatch({ type: 'mergeWeekAlt', wi: gap.wi, alt: filled.week.alt })
        }
      })
    }
    const res = await importNextWeek(latestImportedStart(state.weeks), langCode, altCodes)
    if (!res.ok) {
      dispatch({ type: 'stopImport' })
      // 'demo' heißt: keine Datenbank angebunden, der Abruf ist gar nicht
      // möglich. Hier stand früher t.demoHinweis — der redet vom Anmelden
      // („Zugangsdaten beliebig") und passte an dieser Stelle nicht.
      const text =
        res.error === 'demo' ? t.importOhneDb : res.error === 'unbekannt' ? t.importFehler : res.error
      dispatch({ type: 'showToast', text })
      return
    }
    dispatch({ type: 'addImportedWeek', week: res.week })
  }

  const knopf = state.importing ? t.importiere : state.imported ? t.alleImportiert : t.importBtn

  return { importieren, knopf, geladenBis, geladenBisMs }
}
