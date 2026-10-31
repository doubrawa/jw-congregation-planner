import { useCallback, useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { loadAndHydrate } from '../app/hydrate'
import { useKalendertag } from '../app/useKalendertag'
import type { TauschAnfrage } from '../data/tausch'
import type { Dict } from '../i18n/ui'
import { useT } from '../i18n/useT'
import {
  type TauschAngebot,
  tauschAblehnen,
  tauschAngebote,
  tauschAnfragen,
  tauschAnnehmen,
  type TauschBestand,
  type TauschErgebnis,
  tauschDirekt,
  type TauschFehler,
  tauschZurueckziehen,
} from '../lib/tauschen'

/**
 * Warum es nicht ging: was die Function sagt — oder `offline`: Die App zeigt
 * die Offline-Momentaufnahme, und der Aufruf ginge am Reducer vorbei, der dort
 * nur lesen lässt (wie bei den Trolleys).
 */
export type TauschAktionsFehler = TauschFehler | 'offline'

/**
 * Der Satz zu jedem Grund. Dass sich etwas geändert hat, sagt für den Leser
 * dasselbe, gleich woran es liegt; ohne Verbindung derselbe Satz wie bei den
 * Trolleys.
 */
const FEHLER_TEXT = {
  stand: 'tauschFehlerGeaendert',
  'already-asked': 'tauschFehlerSchonGefragt',
  gone: 'tauschFehlerWeg',
  netz: 'trolleyFehlerNetz',
  offline: 'offlineReadOnly',
} as const satisfies Record<TauschAktionsFehler, keyof Dict>

export const tauschFehlerText = (fehler: TauschAktionsFehler, t: Dict): string => t[FEHLER_TEXT[fehler]]

/** Ein Schritt des Tauschens — zurück kommt der Grund, wenn er scheiterte. */
export type TauschSchritt = () => Promise<TauschAktionsFehler | null>

/**
 * Der Satz zum zuletzt gescheiterten Schritt, und der Weg, einen zu gehen —
 * für das Blatt und die Karte gleich: Er steht an Ort und Stelle, bis der
 * nächste Schritt gelingt.
 */
export function useTauschFehler() {
  const { t } = useT()
  const [fehler, setFehler] = useState<string | null>(null)
  const ausfuehren = async (schritt: TauschSchritt): Promise<void> => {
    const f = await schritt()
    setFehler(f ? tauschFehlerText(f, t) : null)
  }
  return { fehler, setFehler, ausfuehren }
}

/**
 * **Tauschen** (T153): die Function rufen (`lib/tauschen.ts`), was sie
 * geschrieben hat in den Zustand legen, und sagen, was geschah. Scheitert ein
 * Aufruf, weil der Stand hier nicht mehr stimmt, lädt die App nach — die
 * Ansicht zeigt dann, was jetzt gilt.
 */
export function useTauschen() {
  const { state, dispatch } = useApp()
  const heute = useKalendertag()
  const [laeuft, setLaeuft] = useState(false)
  const ich = eigenePerson(state)

  const { weeks, services, persons, absences, sentLog, staleAt, members } = state
  const zeiten = state.congregation.times
  const ichId = ich?.id
  // Wer ein Konto hat — nur ohne Datenbank gebraucht, sonst sagt es der Server.
  const konten = useMemo(() => new Set(members.flatMap((m) => (m.personId ? [m.personId] : []))), [members])
  // Gemerkt, damit `angebote` dieselbe Funktion bleibt, solange sich der
  // Bestand nicht ändert — das Blatt lädt sie in einem Effekt.
  const bestand = useCallback(
    (): TauschBestand | null =>
      ichId ? { weeks, services, persons, absences, sentLog, zeiten, ich: ichId, heute, konten } : null,
    [weeks, services, persons, absences, sentLog, zeiten, ichId, heute, konten],
  )

  const rufen = async <T>(aufruf: () => Promise<TauschErgebnis<T>>): Promise<TauschErgebnis<T> | { ok: false; fehler: 'offline' }> => {
    if (state.staleAt) return { ok: false, fehler: 'offline' }
    setLaeuft(true)
    let erg: TauschErgebnis<T>
    try {
      erg = await aufruf()
    } finally {
      // Auch wenn der Aufruf wirft — sonst blieben die Knöpfe für immer gesperrt.
      setLaeuft(false)
    }
    if (!erg.ok && erg.fehler !== 'netz' && state.userId) void loadAndHydrate(dispatch, state.userId, { silent: true })
    return erg
  }

  /** Eine Anfrage, die es nicht mehr gibt, verschwindet auch hier — gleich, wer sie beendet hat. */
  const beenden = async (anfrage: TauschAnfrage, aufruf: () => Promise<TauschErgebnis<void>>): Promise<TauschAktionsFehler | null> => {
    const erg = await rufen(aufruf)
    if (erg.ok || erg.fehler === 'gone') dispatch({ type: 'tauschWeg', id: anfrage.id })
    return erg.ok ? null : erg.fehler
  }

  /** Mit wem der eigene Platz getauscht werden könnte. Liest nur — ohne Sperre der Knöpfe. */
  const angebote = useCallback(
    async (gibtAb: string): Promise<TauschErgebnis<TauschAngebot[]> | { ok: false; fehler: 'offline' }> => {
      const b = bestand()
      if (staleAt || !b) return { ok: false, fehler: 'offline' }
      return tauschAngebote(gibtAb, b)
    },
    [bestand, staleAt],
  )

  return {
    laeuft,
    angebote,
    anfragen: async (gibtAb: string, angebot: TauschAngebot): Promise<TauschAktionsFehler | null> => {
      const b = bestand()
      if (!b) return 'offline'
      const erg = await rufen(() => tauschAnfragen(gibtAb, angebot, b))
      if (!erg.ok) return erg.fehler
      dispatch({ type: 'tauschAngefragt', anfrage: erg.wert })
      return null
    },
    /** Mit jemandem ohne Konto gleich tauschen — abgesprochen ist es mündlich. */
    direkt: async (gibtAb: string, angebot: TauschAngebot): Promise<TauschAktionsFehler | null> => {
      const b = bestand()
      if (!b) return 'offline'
      const erg = await rufen(() => tauschDirekt(gibtAb, angebot, b))
      if (!erg.ok) return erg.fehler
      dispatch({ type: 'getauscht', tausch: { von: b.ich, an: angebot.personId, gibtAb, nimmt: angebot.nimmt }, ohneKonto: true })
      return null
    },
    zurueckziehen: (anfrage: TauschAnfrage) => beenden(anfrage, () => tauschZurueckziehen(anfrage.id)),
    ablehnen: (anfrage: TauschAnfrage) => beenden(anfrage, () => tauschAblehnen(anfrage.id)),
    annehmen: async (anfrage: TauschAnfrage): Promise<TauschAktionsFehler | null> => {
      const erg = await rufen(() => tauschAnnehmen(anfrage.id, heute))
      if (erg.ok) dispatch({ type: 'getauscht', tausch: anfrage })
      else if (erg.fehler === 'gone') dispatch({ type: 'tauschWeg', id: anfrage.id })
      return erg.ok ? null : erg.fehler
    },
  }
}
