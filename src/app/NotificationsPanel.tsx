import { useEffect, useRef } from 'react'
import { useBackDismiss } from '../components/useBackDismiss'
import { useEscape } from '../components/useEscape'
import { useDialogFocus } from '../components/useDialogFocus'
import { useZweiTipp } from '../components/useZweiTipp'
import { NOTIF_TITLE_KEY } from '../i18n/ui'
import { useT } from '../i18n/useT'
import { useApp } from './context'
import { loadNotifications } from '../lib/data'
import { loadAndHydrate } from './hydrate'
import { mitteilungsZiel, sichtbareMitteilungen } from './mitteilungen'
import { relativeZeit } from '../i18n/zeit'
import { rechteVon } from '../data/rechte'

/** Mitteilungen-Overlay (Kopf-Chip öffnet); Backdrop-Klick oder Escape schließt. */
export function NotificationsPanel() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const dlg = useRef<HTMLDivElement>(null)
  useDialogFocus(dlg)
  useBackDismiss(true, () => dispatch({ type: 'closeNotifs' }))

  useEscape(() => dispatch({ type: 'closeNotifs' }))

  const { zuteilen } = rechteVon(state)
  const sichtbar = sichtbareMitteilungen(state.notifs, zuteilen)
  /*
   * **„Alle löschen" fragt einmal nach** — wie Person löschen und Leeren
   * (`useZweiTipp`). Es löscht die eigenen Zeilen in der Datenbank, und
   * zurück holt sie nichts; bis zum 1.10.2026 genügte dafür ein einziger
   * Fehltipp neben „Alle gelesen".
   */
  const loeschen = useZweiTipp(() => dispatch({ type: 'clearNotifs' }))

  /*
   * **Beim Öffnen still nachladen — aber nur, was die Glocke braucht.**
   *
   * Die Mitteilungen kamen bis dahin ausschließlich beim Start der App aus der
   * Datenbank — es gibt kein Realtime-Abo und kein Nachladen bei Fokus. Wer die
   * App als PWA offen liegen hat, sah in der Glocke also den Stand vom letzten
   * echten Start: Ein zweiter Planer teilte zu, jemand sagte ab, ein Ersatz
   * wurde gesucht — nichts davon kam an, bis die App neu gestartet wurde.
   *
   * Der Push-Klick löst dasselbe Nachladen schon aus (AppShell). Was fehlte,
   * war der Fall, in dem jemand von sich aus nachsieht — und das ist genau der
   * Moment, in dem er den aktuellen Stand erwartet.
   *
   * **Zwei Stufen statt eines vollen Ladevorgangs.** Hier stand
   * `loadAndHydrate`: dreizehn Abfragen, darunter 52 Wochen als JSONB, alle
   * Bestätigungen und das Versand-Tagebuch — für fünfzig Zeilen Text. Jetzt
   * holt die erste Stufe nur die Glocken-Zeilen; ist keine neue dabei, bleibt
   * es dabei.
   *
   * Die zweite Stufe ist nicht wegzulassen: Eine **neue** Zeile trägt oft einen
   * Aufgaben-Schlüssel, und ob daraus ein Bestätigen-Knopf wird, entscheidet
   * `state.myTasks` — abgeleitet aus Wochen und Bestätigungen. Ohne den vollen
   * Nachlauf zeigte die Glocke die frische Zuteilung an und verschwiege genau
   * den Knopf, für den sie den Schlüssel mitbringt.
   *
   * Einmal beim Öffnen, nicht wiederholt: Die leere Abhängigkeitsliste ist hier
   * Absicht, das Panel wird beim Schließen ausgehängt. Deshalb darf der
   * Vergleich unten `state.notifs` von genau diesem Zeitpunkt festhalten — das
   * ist der Stand, den der Betrachter gerade vor sich hat.
   */
  const userId = state.userId
  const congId = state.congregationId
  const bekannt = useRef(new Set(state.notifs.map((n) => n.id)))
  useEffect(() => {
    // Ohne Konto und Versammlung (Entwicklerseite) gibt es nichts nachzuladen.
    if (!userId || !congId) return
    void (async () => {
      const frisch = await loadNotifications(congId, state.weeks, state.congregation.times)
      // Nicht gelesen (kein Netz, Fehler) → der bisherige Stand bleibt stehen.
      if (!frisch) return
      if (frisch.some((n) => !bekannt.current.has(n.id))) {
        await loadAndHydrate(dispatch, userId, { silent: true })
        return
      }
      dispatch({ type: 'setNotifs', notifs: frisch })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="notif-backdrop" onClick={() => dispatch({ type: 'closeNotifs' })} />
      <div className="notif-panel" role="dialog" aria-modal="true" aria-label={t.mitteilungen} ref={dlg}>
        <div className="notif-head">
          <h2 className="notif-title">{t.mitteilungen}</h2>
          {sichtbar.length > 0 && (
            <div className="notif-actions">
              <button
                type="button"
                className="notif-mark-read"
                onClick={() => {
                  loeschen.entschaerfen()
                  dispatch({ type: 'markAllRead' })
                }}
              >
                {t.alleGelesen}
              </button>
              <button
                type="button"
                className={loeschen.armed ? 'notif-clear is-armed' : 'notif-clear'}
                onClick={loeschen.onClick}
                onBlur={loeschen.onBlur}
              >
                {loeschen.armed ? t.loeschenSicher : t.alleLoeschen}
              </button>
            </div>
          )}
        </div>
        {/* Leer stand hier bis zum 1.10.2026 nur der Kopf mit „Alle gelesen" — ohne ein Wort dazu. */}
        {sichtbar.length === 0 && <p className="notif-empty">{t.keineMitteilungen}</p>}
        {sichtbar.map((notif) => {
          const canConfirm =
            // Eine Absage trägt seit dem 4.10.2026 den Schlüssel der Aufgabe —
            // den eines anderen. Hat der Planer den Platz inzwischen selbst
            // übernommen, stünde an der Absage sonst „Bestätigen".
            notif.type !== 'verhindert' &&
            !!notif.taskId &&
            state.myTasks.some((task) => task.id === notif.taskId && task.status === 'offen')
          const titleKey = NOTIF_TITLE_KEY[notif.title]
          const text = tu(notif.text)
          /*
           * **Ein Tipp führt dorthin, wo die Mitteilung herkommt** (4.10.2026,
           * `mitteilungsZiel`) — und sie gilt damit als gelesen. Offline nicht:
           * Gespeichert werden kann dann nichts, und die Sperre (store.tsx)
           * meldete statt des Sprungs bloß „nur lesen". Das Ziel selbst ist
           * Ansehen und geht auch offline.
           */
          const oeffnen = () => {
            if (!notif.read && !state.staleAt) dispatch({ type: 'mitteilungGelesen', id: notif.id })
            for (const aktion of mitteilungsZiel(notif, { zuteilen, weeks: state.weeks, myTasks: state.myTasks })) dispatch(aktion)
          }
          return (
            <div key={notif.id} className={notif.read ? 'notif-row' : 'notif-row is-unread'}>
              <span className="notif-dot" />
              <div>
                <button type="button" className="notif-row-link" onClick={oeffnen}>
                  <span className="notif-row-title">{titleKey ? t[titleKey] : notif.title}</span>
                  {/* Höchstens zwei Zeilen (shell.css); der ganze Text steht im Tooltip. */}
                  <span className="notif-row-text" title={text}>
                    {text}
                  </span>
                  <span className="notif-row-time">{relativeZeit(notif.at, state.lang)}</span>
                </button>
                {canConfirm && (
                  <button
                    type="button"
                    className="notif-confirm"
                    onClick={() => notif.taskId && dispatch({ type: 'confirmTask', id: notif.taskId })}
                  >
                    ✓ {t.bestaetigen}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
