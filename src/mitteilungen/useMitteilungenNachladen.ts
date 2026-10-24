import { useContext, useEffect, useState } from 'react'
import { AppStoreContext, useApp } from '../app/context'
import { loadAndHydrate } from '../app/hydrate'
import { loadNotifications } from '../lib/data'

/**
 * **Beim Öffnen still nachladen — aber nur, was die Mitteilungen brauchen.**
 *
 * Die Mitteilungen kamen bis dahin ausschließlich beim Start der App aus der
 * Datenbank — es gibt kein Realtime-Abo und kein Nachladen bei Fokus. Wer die
 * App als PWA offen liegen hat, sah also den Stand vom letzten echten Start:
 * Ein zweiter Planer teilte zu, jemand sagte ab, ein Ersatz wurde gesucht —
 * nichts davon kam an, bis die App neu gestartet wurde.
 *
 * Der Push-Klick löst dasselbe Nachladen schon aus (AppShell). Was fehlte,
 * war der Fall, in dem jemand von sich aus nachsieht — und das ist genau der
 * Moment, in dem er den aktuellen Stand erwartet.
 *
 * **Zwei Stufen statt eines vollen Ladevorgangs.** Hier stand
 * `loadAndHydrate`: dreizehn Abfragen, darunter 52 Wochen als JSONB, alle
 * Bestätigungen und das Versand-Tagebuch — für fünfzig Zeilen Text. Jetzt
 * holt die erste Stufe nur die Mitteilungen; ist keine neue dabei, bleibt es
 * dabei.
 *
 * Die zweite Stufe ist nicht wegzulassen: Eine **neue** Zeile trägt oft einen
 * Aufgaben-Schlüssel, und ob daraus ein Bestätigen-Knopf wird, entscheidet
 * `state.myTasks` — abgeleitet aus Wochen und Bestätigungen. Ohne den vollen
 * Nachlauf zeigte die Seite die frische Zuteilung an und verschwiege genau den
 * Knopf, für den sie den Schlüssel mitbringt.
 *
 * Einmal beim Öffnen, nicht wiederholt: Die leere Abhängigkeitsliste ist hier
 * Absicht, die Seite wird beim Verlassen ausgehängt. Deshalb darf der
 * Vergleich unten `state.notifs` von genau diesem Zeitpunkt festhalten — das
 * ist der Stand, den der Betrachter gerade vor sich hat.
 */
export function useMitteilungenNachladen(): void {
  const { state, dispatch } = useApp()
  // Der Stand, wenn die Antwort kommt — nicht der beim Öffnen (siehe unten).
  const store = useContext(AppStoreContext)
  const userId = state.userId
  const congId = state.congregationId
  // Einmal gemerkt, nicht bei jedem Render neu gebaut: Die Seite rendert mit
  // jeder Änderung am Zustand, gebraucht wird nur der Stand beim Öffnen.
  const [bekannt] = useState(() => new Set(state.notifs.map((n) => n.id)))
  useEffect(() => {
    // Ohne Konto und Versammlung (Entwicklerseite) gibt es nichts nachzuladen.
    if (!userId || !congId) return
    void (async () => {
      const frisch = await loadNotifications(congId, state.weeks, state.congregation.times)
      // Nicht gelesen (kein Netz, Fehler) → der bisherige Stand bleibt stehen.
      if (!frisch) return
      // „Alle löschen" (T140), während die Abfrage lief: Ihr Stand ist älter als
      // das Löschen und brächte die Liste zurück (Review 24.10.2026).
      if (bekannt.size > 0 && store?.holen().notifs.length === 0) return
      if (frisch.some((n) => !bekannt.has(n.id))) {
        await loadAndHydrate(dispatch, userId, { silent: true })
        return
      }
      dispatch({ type: 'setNotifs', notifs: frisch })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
