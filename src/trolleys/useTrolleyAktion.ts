import { useState } from 'react'
import { useApp } from '../app/context'
import { loadAndHydrate } from '../app/hydrate'
import { useKalendertag } from '../app/useKalendertag'
import type { TrolleyTermin } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import {
  trolleyAustragen,
  trolleyDazukommen,
  trolleyEintragen,
  trolleyEntfernen,
  type TrolleyErgebnis,
  type TrolleyFehler,
} from '../lib/trolley'

/**
 * Warum eine Trolley-Aktion nicht ging: was die Function sagt — oder
 * `offline`: Die App zeigt die Offline-Momentaufnahme, und der Aufruf ginge am
 * Reducer vorbei, der dort nur lesen lässt (wie Import und „Plan senden").
 */
export type AktionsFehler = TrolleyFehler | 'offline'

/** Der Satz zu jedem Grund, an dem eine Trolley-Aktion scheitert. */
const FEHLER_TEXT = {
  'kein-recht': 'trolleyFehlerKeinRecht',
  vorbei: 'trolleyFehlerVorbei',
  zeit: 'trolleyFehlerZeit',
  belegt: 'trolleyFehlerBelegt',
  doppelt: 'trolleyFehlerDoppelt',
  'partner-doppelt': 'trolleyFehlerPartnerDoppelt',
  'partner-ohne-recht': 'trolleyFehlerPartnerRecht',
  'schon-partner': 'trolleyFehlerSchonPartner',
  weg: 'trolleyFehlerWeg',
  stand: 'trolleyFehlerStand',
  netz: 'trolleyFehlerNetz',
  offline: 'offlineReadOnly',
} as const satisfies Record<AktionsFehler, keyof Dict>

/** Der Grund in Worten; `partner` füllt die Sätze, die ihn nennen. */
export function trolleyFehlerText(fehler: AktionsFehler, t: Dict, partner = ''): string {
  return fill(t[FEHLER_TEXT[fehler]], { name: partner })
}

/**
 * Gründe, nach denen der Stand hier nicht mehr stimmt: Jemand war schneller,
 * oder der Termin ist weg. Dann wird nachgeladen, damit die Ansicht zeigt, was
 * jetzt gilt.
 */
const VERALTET: ReadonlySet<TrolleyFehler> = new Set(['stand', 'weg', 'schon-partner', 'belegt'])

/**
 * **Eine Trolley-Aktion ausführen** (T121, Phase 7): die Function rufen
 * (`lib/trolley.ts`), was sie zurückgibt in den Zustand legen und sagen, was
 * geschah. Scheitert sie, kommt der Grund zurück — die Blätter zeigen ihn an
 * Ort und Stelle; ist der Stand veraltet, lädt die App nach.
 */
export function useTrolleyAktion() {
  const { state, dispatch } = useApp()
  const heute = useKalendertag()
  const [laeuft, setLaeuft] = useState(false)

  const rufen = async <E extends { ok: true }>(
    aufruf: () => Promise<E | { ok: false; fehler: TrolleyFehler }>,
  ): Promise<E | { ok: false; fehler: AktionsFehler }> => {
    if (state.staleAt) return { ok: false, fehler: 'offline' }
    setLaeuft(true)
    let erg: E | { ok: false; fehler: TrolleyFehler }
    try {
      erg = await aufruf()
    } finally {
      // Auch wenn der Aufruf wirft — sonst blieben die Knöpfe für immer gesperrt.
      setLaeuft(false)
    }
    if (!erg.ok && VERALTET.has(erg.fehler) && state.userId) void loadAndHydrate(dispatch, state.userId, { silent: true })
    return erg
  }

  const ausfuehren = async (
    id: string,
    toast: 'eingetragen' | 'dazu' | 'ausgetragen',
    aufruf: () => Promise<TrolleyErgebnis>,
  ): Promise<AktionsFehler | null> => {
    const erg = await rufen(aufruf)
    if (!erg.ok) return erg.fehler
    dispatch({ type: 'trolleyTermin', id, termin: erg.termin, toast })
    return null
  }

  return {
    laeuft,
    eintragen: (termin: TrolleyTermin) => ausfuehren(termin.id, 'eingetragen', () => trolleyEintragen(termin, heute)),
    dazukommen: (termin: TrolleyTermin, ich: string) =>
      ausfuehren(termin.id, 'dazu', () => trolleyDazukommen(termin, ich, heute)),
    austragen: (termin: TrolleyTermin, ich: string) =>
      ausfuehren(termin.id, 'ausgetragen', () => trolleyAustragen(termin, ich, heute)),
    /** Den Trolley entfernen (Admin) — ist er schon fort, ist das so gut wie entfernt. */
    entfernen: async (trolleyId: string): Promise<AktionsFehler | null> => {
      const erg = await rufen(() => trolleyEntfernen(trolleyId, heute))
      if (!erg.ok && erg.fehler !== 'weg') return erg.fehler
      dispatch({ type: 'trolleyEntfernt', id: trolleyId })
      return null
    },
  }
}
