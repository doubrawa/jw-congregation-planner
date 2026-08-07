import { useApp } from '../app/context'
import { missingVariants } from '../data/localize'
import { CONG_TO_JW, LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import { importNextWeek, importWeekVariants, latestImportedStart, loadedUntilMs } from '../lib/import'

/**
 * Programm-Import: holt die nächste Woche von jw.org (Produktion) bzw.
 * simuliert eine Beispielwoche (Demo). Weitere Programmsprachen werden als
 * Varianten mitgeholt, fehlende Varianten bereits geladener Wochen nachgezogen.
 */
export function ImportPanel() {
  const { state, dispatch } = useApp()
  const { t, tp } = useT()

  /**
   * Bis wann Programme vorliegen. Vorher stand hier eine feste Beschriftung
   * („Arbeitsheft Sep/Okt 2026"), die nichts über den tatsächlichen Stand
   * aussagte und mit der Zeit schlicht falsch wurde.
   *
   * Zwei Quellen, weil nur importierte Wochen ein ISO-Datum tragen: mit Datum
   * das echte Wochenende, ohne Datum (Demo- und Vorlagenwochen) der
   * Wochenbereich der letzten Woche im Klartext.
   */
  const bisMs = loadedUntilMs(state.weeks)
  const letzte = state.weeks[state.weeks.length - 1]
  const bis =
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

  const importWorkbook = async () => {
    if (state.importing) return
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
    const langCode = CONG_TO_JW[state.congLang] ?? 'de'
    // Weitere Programmsprachen als Varianten mitholen (ohne die Primärsprache)
    const altCodes = [
      ...new Set(
        state.progLangs
          .map((name) => CONG_TO_JW[name])
          .filter((c): c is string => Boolean(c) && c !== langCode),
      ),
    ]
    // Erst fehlende Varianten bereits geladener Wochen nachholen (z. B. wenn
    // eine Programmsprache nach deren Import hinzugefügt wurde). Fehler je
    // Woche werden übersprungen — der nächste Import versucht es erneut.
    for (const gap of missingVariants(state.weeks, altCodes, langCode)) {
      const filled = await importWeekVariants(gap.start, gap.lang, gap.codes)
      if (filled.ok && filled.week.alt) {
        dispatch({ type: 'mergeWeekAlt', wi: gap.wi, alt: filled.week.alt })
      }
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

  const importLabel = state.importing
    ? t.importiere
    : state.imported
      ? t.alleImportiert
      : t.importBtn

  return (
    <div className="panel panel--pb16" data-farbe="neutral">
      <h2 className="panel-label">{t.importCard}</h2>
      <p className="panel-hint">{t.importDesc}</p>
      <div className="imp-status">
        <span className="kv-key">{bis ? fill(t.geladenBis, { datum: bis }) : t.geladenNichts}</span>
        {bis && <span className="imp-count">{fill(t.wochenGeladen, { n: state.weeks.length })}</span>}
      </div>
      <button type="button" className="btn-outline imp-btn" onClick={importWorkbook}>
        {importLabel}
      </button>
    </div>
  )
}
