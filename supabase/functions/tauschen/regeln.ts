// =============================================================================
// tauschen: die Regeln eines Tauschs (T153, 29.10.2026)
// =============================================================================
// Rein, ohne Datenbank: Was die Function gelesen hat, geht als `Lage` hinein;
// heraus kommt, ob zwei Plätze getauscht werden dürfen, welche Plätze einem
// Fragenden angeboten werden und wie die Wochen danach aussehen.
//
// Getauscht wird ein **Hilfsdienst gegen denselben Dienst an einem anderen
// Tag** (Betreiber, 29.10.2026: wie die freien Plätze, T142 — „aufgaben weist
// der planer zu"). Beide müssen den Dienst können, an ihrem neuen Tag da sein
// und dort nicht schon eingeteilt sein; beide Wochen sind gesendet, keine
// Zusammenkunft fällt aus oder liegt zurück.
//
// Dieselben Regeln für Angebot, Anfrage und Annahme. Zwischen Anfrage und
// Annahme kann sich alles geändert haben — der Planer teilt um, jemand trägt
// eine Abwesenheit ein —, also fragt die Annahme noch einmal, mit frisch
// gelesener Lage.
// =============================================================================

import { helferKey, schluesselTeile, type Tab } from '../_shared/aufgaben-schluessel.ts'
import { angebotsBereich } from '../_shared/freie-plaetze.ts'
import { istAusgefallenFuer, type MeetingTimes, personDisplayName, terminTag, versatzMitAbweichung } from '../_shared/planung.ts'
import { pendingOfMeeting, type ServiceRow, type Week } from '../_shared/zuteilungen.ts'

export interface TauschPerson {
  id: string
  fn: string
  ln: string
  priv: Record<string, boolean> | null
}

export interface TauschWoche {
  start: string
  data: Week
  updated_at: string
}

/** Was die Function gelesen hat — alles aus der Versammlung des Aufrufers. */
export interface Lage {
  /** Die gelesenen Wochen nach ihrem Montag. */
  wochen: ReadonlyMap<string, TauschWoche>
  services: readonly ServiceRow[]
  personen: ReadonlyMap<string, TauschPerson>
  /** Ist die Person an diesem Tag („JJJJ-MM-TT") abwesend? */
  abwesend: (personId: string, tag: string) => boolean
  /** Die Wochen, deren Plan hinausging („Plan senden"). */
  gesendet: ReadonlySet<string>
  zeiten: MeetingTimes
  /** Der Kalendertag, an dem gefragt wird — was davor liegt, ist vorbei. */
  heute: string
}

/** Warum ein Tausch nicht geht — die App nennt den Grund. */
export type TauschFehler =
  /** Kein Hilfsdienst-Schlüssel, verschiedene Dienste oder dieselbe Zusammenkunft. */
  | 'bad-request'
  /** Woche, Dienst oder Platz gibt es nicht (mehr). */
  | 'slot-not-found'
  /** Der abgegebene Platz gehört nicht (mehr) dem Fragenden. */
  | 'not-yours'
  /** Auf dem anderen Platz steht niemand mit Kennung — oder der Fragende selbst. */
  | 'no-partner'
  /** Den Dienst übernimmt eine Gruppe (Reinigung). */
  | 'not-offered'
  | 'meeting-cancelled'
  | 'not-published'
  | 'past'
  | 'not-qualified'
  | 'absent'
  /** Schon in der anderen Zusammenkunft eingeteilt. */
  | 'busy'

/** Ein Platz des Tauschs, mit dem, der ihn jetzt hat. */
export interface TauschPlatz {
  key: string
  woche: string
  tab: Tab
  svc: string
  pos: number
  /** Der Tag der Zusammenkunft („JJJJ-MM-TT"). */
  tag: string
  person: TauschPerson
}

/**
 * Ja mit beiden Plätzen und `bis`, dem früheren der beiden Tage: So lange gilt
 * eine Anfrage — danach ist einer der Plätze vorbei.
 */
export type TauschUrteil = { ok: true; a: TauschPlatz; b: TauschPlatz; bis: string } | { ok: false; fehler: TauschFehler }

/**
 * Der Kalendertag einer Zusammenkunft — Wochenstart und Versatz, eine Abweichung vor dem Rhythmus (`terminTag`).
 * Exportiert für die Mitgliedsrechte-Probe: Sie wählt ihre Wochen mit derselben Rechnung wie die Function.
 */
export function tagDerZusammenkunft(woche: TauschWoche, tab: Tab, zeiten: MeetingTimes): string | null {
  return terminTag(woche.start, versatzMitAbweichung(woche.data.dev, tab, zeiten[tab].wd))
}

/** Hat die Person in dieser Zusammenkunft schon etwas — Id vor Name, wie überall? */
function hatSchon(lage: Lage, woche: TauschWoche, tab: Tab, person: TauschPerson): boolean {
  const meeting = woche.data[tab]
  if (!meeting) return false
  const name = personDisplayName(person.fn, person.ln)
  return pendingOfMeeting(woche.start, tab, meeting, [...lage.services], new Map()).some((p) =>
    p.pid ? p.pid === person.id : p.name === name,
  )
}

/**
 * **Darf `fragender` seinen Platz `gibtAb` gegen `nimmt` tauschen?**
 *
 * `a` ist danach der abgegebene Platz (mit dem Fragenden), `b` der übernommene
 * (mit dem, der ihn jetzt hat — dem Partner). Gefragt wird in der Reihenfolge,
 * in der ein Grund dem Fragenden am meisten sagt: erst ob es die Plätze gibt,
 * dann ob sie zusammenpassen, zuletzt die beiden Personen.
 */
export function tauschPruefen(lage: Lage, gibtAb: string, nimmt: string, fragender: string): TauschUrteil {
  const ta = schluesselTeile(gibtAb)
  const tb = schluesselTeile(nimmt)
  if (ta?.art !== 'helper' || tb?.art !== 'helper') return { ok: false, fehler: 'bad-request' }
  if (ta.svc !== tb.svc || (ta.woche === tb.woche && ta.tab === tb.tab)) return { ok: false, fehler: 'bad-request' }

  const svc = lage.services.find((s) => s.key === ta.svc)
  if (!svc || ta.pos >= svc.count || tb.pos >= svc.count) return { ok: false, fehler: 'slot-not-found' }
  const bereich = angebotsBereich(svc)
  if (!bereich) return { ok: false, fehler: 'not-offered' }

  const wa = lage.wochen.get(ta.woche)
  const wb = lage.wochen.get(tb.woche)
  if (!wa?.data[ta.tab] || !wb?.data[tb.tab]) return { ok: false, fehler: 'slot-not-found' }
  const slotA = wa.data[ta.tab]?.helpers?.[ta.svc]?.[ta.pos]
  const slotB = wb.data[tb.tab]?.helpers?.[tb.svc]?.[tb.pos]
  // Id vor Name: Ein Platz ohne Kennung lässt sich keinem sicher zuordnen.
  if (!slotA?.pid || slotA.pid !== fragender) return { ok: false, fehler: 'not-yours' }
  if (!slotB?.pid || slotB.pid === fragender) return { ok: false, fehler: 'no-partner' }
  const ich = lage.personen.get(fragender)
  const partner = lage.personen.get(slotB.pid)
  if (!ich) return { ok: false, fehler: 'not-yours' }
  if (!partner) return { ok: false, fehler: 'no-partner' }

  if (istAusgefallenFuer(wa.data.dev, ta.tab) || istAusgefallenFuer(wb.data.dev, tb.tab)) {
    return { ok: false, fehler: 'meeting-cancelled' }
  }
  if (!lage.gesendet.has(ta.woche) || !lage.gesendet.has(tb.woche)) return { ok: false, fehler: 'not-published' }
  const tagA = tagDerZusammenkunft(wa, ta.tab, lage.zeiten)
  const tagB = tagDerZusammenkunft(wb, tb.tab, lage.zeiten)
  // Eine Woche ohne lesbaren Montag hat keinen Tag, an dem getauscht würde.
  if (!tagA || !tagB) return { ok: false, fehler: 'slot-not-found' }
  if (tagA < lage.heute || tagB < lage.heute) return { ok: false, fehler: 'past' }

  if (!ich.priv?.[bereich] || !partner.priv?.[bereich]) return { ok: false, fehler: 'not-qualified' }
  if (lage.abwesend(ich.id, tagB) || lage.abwesend(partner.id, tagA)) return { ok: false, fehler: 'absent' }
  if (hatSchon(lage, wb, tb.tab, ich) || hatSchon(lage, wa, ta.tab, partner)) return { ok: false, fehler: 'busy' }

  return {
    ok: true,
    a: { key: gibtAb, woche: ta.woche, tab: ta.tab, svc: ta.svc, pos: ta.pos, tag: tagA, person: ich },
    b: { key: nimmt, woche: tb.woche, tab: tb.tab, svc: tb.svc, pos: tb.pos, tag: tagB, person: partner },
    bis: tagA < tagB ? tagA : tagB,
  }
}

/**
 * **Die Plätze, die `fragender` gegen `gibtAb` tauschen könnte** — jeder Platz
 * desselben Dienstes in den gelesenen Wochen, für den `tauschPruefen` Ja sagt,
 * der früheste zuerst. Ob der Partner ein Konto hat (sonst könnte er nicht
 * antworten), weiß die Lage nicht; das prüft die Function.
 */
export function tauschAngebote(lage: Lage, gibtAb: string, fragender: string): TauschPlatz[] {
  const teile = schluesselTeile(gibtAb)
  if (teile?.art !== 'helper') return []
  const svc = lage.services.find((s) => s.key === teile.svc)
  if (!svc) return []
  const out: TauschPlatz[] = []
  for (const woche of lage.wochen.values()) {
    for (const tab of ['mid', 'we'] as const) {
      for (let pos = 0; pos < svc.count; pos++) {
        const key = helferKey(woche.start, tab, svc.key, pos)
        const urteil = tauschPruefen(lage, gibtAb, key, fragender)
        if (urteil.ok) out.push(urteil.b)
      }
    }
  }
  return out.sort((x, y) => x.tag.localeCompare(y.tag) || x.key.localeCompare(y.key))
}

/**
 * **Die Wochen nach dem Tausch**: auf `a` steht der Partner, auf `b` der
 * Fragende — je mit Name und Kennung, wie der Planer zuteilt. Liegen beide
 * Plätze in einer Woche, ist es eine geänderte Woche, sonst zwei. Die
 * gelesenen bleiben unberührt.
 */
export function tauschAnwenden(lage: Lage, a: TauschPlatz, b: TauschPlatz): Map<string, Week> {
  const neu = new Map<string, Week>()
  const woche = (start: string): Week => {
    const da = neu.get(start)
    if (da) return da
    const kopie = structuredClone(lage.wochen.get(start)!.data)
    neu.set(start, kopie)
    return kopie
  }
  const setzen = (platz: TauschPlatz, person: TauschPerson): void => {
    const reihe = ((woche(platz.woche)[platz.tab]!.helpers ??= {})[platz.svc] ??= [])
    // Wie `assignSlot` im Client: Lücken davor als leere Plätze auffüllen.
    while (reihe.length <= platz.pos) reihe.push({ name: '' })
    reihe[platz.pos] = { name: personDisplayName(person.fn, person.ln), pid: person.id }
  }
  setzen(a, b.person)
  setzen(b, a.person)
  return neu
}
