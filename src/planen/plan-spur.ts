import type { SpurLage, SpurSchritt } from '../bausteine/Spur'
import { istAusgefallen, MEETING_TABS } from '../data/helpers'
import { offeneMeldungen, vergangeneZusammenkuenfte } from '../data/plan-versand'
import { besetztVon, besetzung, zusagenStand } from '../data/saal'
import type { ConfirmationMap, FsInstance, MeetingKey, MeetingTimes, SentLog, Service, Week, WeitererPlan } from '../data/types'
import type { PlanStand } from '../data/weitere-plaene'
import type { Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'

/** Die Zahlen hinter der Spur einer Woche beim Planen. */
export interface WochenZahlen {
  /** Besetzte und alle Plätze der gezeigten Zusammenkunft — bei den Zusagen der Woche beider. */
  besetzt: number
  gesamt: number
  /** Zuteilungen der ganzen Woche, von denen noch niemand weiß — die Zahl am „Plan senden". */
  neu: number
  /** Bestätigt von allen Plätzen der Zusammenkunft, die etwas zu bestätigen haben. */
  bestaetigt: number
  zuBestaetigen: number
}

/** Was die Zahlen der Spur aus dem Zustand brauchen. */
type SpurQuellen = { services: Service[]; confirmations: ConfirmationMap; sentLog: SentLog; zeiten: MeetingTimes }

/** Besetzung und Zusagen **einer** Zusammenkunft — wie der Saal (`besetzung`) und `zusagenStand`. */
function zahlenDerZusammenkunft(week: Week, tab: MeetingKey, q: SpurQuellen): Omit<WochenZahlen, 'neu'> {
  const meeting = week[tab]
  const { besetzt, gesamt } = besetztVon(besetzung(meeting, q.services, q.confirmations, week.start, tab, null))
  const zusagen = zusagenStand(meeting, q.services, q.confirmations, week.start, tab)
  return { besetzt, gesamt, bestaetigt: zusagen.bestaetigt, zuBestaetigen: zusagen.gesamt }
}

/**
 * Was noch hinaus muss (`offeneMeldungen`, wie der Knopf „Plan senden").
 * Gesendet wird die ganze Woche, deshalb zählt „neu" beide Zusammenkünfte und
 * die Treffpunkte — beim Plan einer Zusammenkunft wie bei den Zusagen.
 */
function neuDerWoche(week: Week, fsWeek: FsInstance[] | undefined, q: SpurQuellen, heute: Date): number {
  return offeneMeldungen(week, fsWeek, q.services, q.confirmations, q.sentLog, q.zeiten, heute).length
}

/**
 * Die Zahlen aus den Funktionen, die sie auch sonst liefern: die Besetzung
 * (`besetzung`, wie der Saal), die Zusagen (`zusagenStand`) und, was noch
 * hinaus muss (`neuDerWoche`).
 */
export function wochenZahlen(
  week: Week,
  fsWeek: FsInstance[] | undefined,
  tab: MeetingKey,
  q: SpurQuellen,
  heute: Date,
): WochenZahlen {
  return { ...zahlenDerZusammenkunft(week, tab, q), neu: neuDerWoche(week, fsWeek, q, heute) }
}

/**
 * Dieselben Zahlen für die **Zusagen der Woche** (Phase 5g): beide
 * Zusammenkünfte zusammen, ohne die ausgefallenen und ohne die, die vorbei
 * sind — wie die Liste darunter (`zusagenDerWoche`).
 */
export function zahlenDerWoche(
  week: Week,
  fsWeek: FsInstance[] | undefined,
  q: SpurQuellen,
  heute: Date,
): WochenZahlen {
  const vorbei = vergangeneZusammenkuenfte(week, q.zeiten, heute)
  const summe = { besetzt: 0, gesamt: 0, bestaetigt: 0, zuBestaetigen: 0 }
  for (const tab of MEETING_TABS) {
    if (istAusgefallen(week, tab) || vorbei.has(tab)) continue
    const z = zahlenDerZusammenkunft(week, tab, q)
    summe.besetzt += z.besetzt
    summe.gesamt += z.gesamt
    summe.bestaetigt += z.bestaetigt
    summe.zuBestaetigen += z.zuBestaetigen
  }
  return { ...summe, neu: neuDerWoche(week, fsWeek, q, heute) }
}

/** Wohin ein Tipp auf einen Schritt der Spur führt — wo es einen Weg gibt. */
export type SpurZiele = Partial<Record<'zuteilen' | 'zusagen', () => void>>

/**
 * **Wie weit die Woche ist** (T121, Baustein `GSpur`): Zuteilen, Senden,
 * Zusagen. Der laufende Schritt ist der erste, der nicht fertig ist — erst
 * werden die Plätze besetzt, dann geht der Plan hinaus, dann kommen die
 * Zusagen. Zahlen stehen als „a/b" oder „Neu: n": So stimmt die Form in jeder
 * Sprache. `ziele` macht Schritte zu Wegen: vom Plan zu den Zusagen der Woche
 * und zurück.
 */
export function spurDerWoche(
  z: WochenZahlen,
  t: Pick<Dict, 'spurZuteilen' | 'spurSenden' | 'spurZusagen' | 'neuN'>,
  ziele: SpurZiele = {},
): SpurSchritt[] {
  const alleBesetzt = z.besetzt >= z.gesamt
  const zuteilen: SpurLage = alleBesetzt ? 'voll' : 'jetzt'
  // Gesendet wird die ganze Woche: Was noch hinaus muss, zählt auch dann, wenn
  // die gezeigte Zusammenkunft leer ist — sonst stünde „Neu: 3" an einem
  // Schritt, der nach „nichts zu tun" aussieht.
  const senden: SpurLage = z.neu > 0 ? (alleBesetzt ? 'jetzt' : 'teil') : z.besetzt > 0 ? 'voll' : 'leer'
  const zusagenFertig = z.zuBestaetigen > 0 && z.bestaetigt >= z.zuBestaetigen
  const zusagen: SpurLage = zusagenFertig
    ? 'voll'
    : zuteilen === 'voll' && senden === 'voll'
      ? 'jetzt'
      : z.bestaetigt > 0
        ? 'teil'
        : 'leer'
  return [
    { name: t.spurZuteilen, wert: `${z.besetzt}/${z.gesamt}`, lage: zuteilen, ziel: ziele.zuteilen },
    { name: t.spurSenden, wert: z.neu > 0 ? fill(t.neuN, { n: z.neu }) : undefined, lage: senden },
    {
      name: t.spurZusagen,
      wert: z.zuBestaetigen > 0 ? `${z.bestaetigt}/${z.zuBestaetigen}` : undefined,
      lage: zusagen,
      ziel: ziele.zusagen,
    },
  ]
}

/**
 * **Wo ein Weiterer Plan steht** (T121, Entwurf `GPlaenePlanen`): Entwurf,
 * veröffentlicht, abgeschlossen. Ein Plan, der als Entwurf ablief, war nie
 * veröffentlicht — sein mittlerer Schritt bleibt leer.
 */
export function spurDesPlans(
  plan: Pick<WeitererPlan, 'entwurf'>,
  stand: PlanStand,
  t: Pick<Dict, 'wpEntwurf' | 'spurVeroeffentlicht' | 'spurAbgeschlossen'>,
): SpurSchritt[] {
  const [entwurf, veroeffentlicht, abgeschlossen]: [SpurLage, SpurLage, SpurLage] =
    stand === 'entwurf'
      ? ['jetzt', 'leer', 'leer']
      : stand === 'aktuell'
        ? ['voll', 'jetzt', 'leer']
        : ['voll', plan.entwurf ? 'leer' : 'voll', 'voll']
  return [
    { name: t.wpEntwurf, lage: entwurf },
    { name: t.spurVeroeffentlicht, lage: veroeffentlicht },
    { name: t.spurAbgeschlossen, lage: abgeschlossen },
  ]
}
