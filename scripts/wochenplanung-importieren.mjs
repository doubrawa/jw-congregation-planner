#!/usr/bin/env node
/**
 * Wochenplanung aus New World Scheduler → JW Congregation Planner.
 *
 * **Was dieses Skript tut — und was nicht.** Das Programm einer Woche
 * (Abschnitte, Lieder, Titel, Zeitrahmen, Schriftstellen, Übersetzungen) kommt
 * bei uns **von jw.org** über „Nächste Woche importieren"; nur dort steht es
 * amtlich und in jeder Sprache. New World Scheduler kennt dasselbe Programm,
 * trägt aber zusätzlich die **Zuteilungen** — wer Vorsitz hat, betet, den
 * Vortrag hält, den Schülerteil macht … Dieses Skript nimmt genau die
 * Zuteilungen und spielt sie **auf die bereits importierten jw.org-Wochen**.
 *
 * Es baut also keine Wochen; es füllt die offenen Plätze bestehender. Wochen
 * ohne jw.org-Import bleiben unberührt (und werden gemeldet). Damit gilt
 * weiterhin [[an-jw-org-messen]]: die Struktur ist die amtliche, wir erfinden
 * keine.
 *
 * **Zuordnung.** Alles hängt am Montag der Programmwoche. NWS datiert die
 * Zusammenkunft unter der Woche auf den Montag, das Wochenende auf den Samstag
 * (= Montag + 5) — beides wird auf den Montag der Woche zurückgerechnet, den
 * `weeks.start` trägt. Personen werden über den **Anzeigenamen** an die
 * `pid` (Person-Id) der App gebunden; beide Seiten stammen aus denselben
 * NWS-Stammdaten, die Namen sind identisch. Namensgleichheit ist Absicht (die
 * App bindet Zuteilungen selbst so) — Dubletten werden gemeldet, nicht geraten.
 *
 * **Feste Programmplätze** werden gefüllt: Vorsitz, Gebete, Vortrag/Geistige
 * Schätze/Bibellesung, Schülerteile (mit Partner), „Leben als Christ",
 * Versammlungsbibelstudium (Leiter/Leser), Ratgeber; am Wochenende Vorsitz,
 * Wachtturm-Leser, öffentlicher Vortrag (Redner + Thema, wenn vorhanden) und
 * die Lieder. Der Wochenend-Studienleiter kennt NWS nicht als eigenen Platz; er
 * bleibt offen.
 *
 * **Hilfsdienste** (NWS „Duties") werden ebenfalls gefüllt, personenbasiert und
 * je Zusammenkunft (NWS datiert sie wie die Programme: Mo = Mitte, Sa =
 * Wochenende). Die sechs NWS-Dienste bilden 1:1 auf die App-Dienste ab —
 * Saalordner→`saal`, Türordner→`ord`, Rundgangsordner→`rund`, Mikrofone→`mik`,
 * Audio/Video→`ton`, Zoomordner→`zoom` (an deinem Datensatz verifiziert). Die
 * **Reinigung** wird als Gruppen-Rotation in `rein` gesetzt: NWS teilt sie einer
 * Felddienstgruppe zu („PDG-N"), die auf die App-Gruppe „Gruppe N" abgebildet
 * wird (der Name steht ohne pid im Slot, wie bei jeder Gruppen-Rotation). „Dienst
 * 7" (ohne App-Pendant), Garten und Instandhaltung werden nur gezählt gemeldet.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/wochenplanung-importieren.mjs \
 *     [--daten C:\DATA\Claude\nws-export\MyData-decrypted] \
 *     [--cong <congregation-id>] [--nur-leere] [--trocken]
 *
 * `--trocken`  zeigt nur, was geschähe, und schreibt nichts.
 * `--nur-leere` füllt nur offene Plätze; ohne die Flagge gewinnt NWS auch über
 *              bereits gesetzte Namen. Die Flagge schützt **Zuteilungen** —
 *              Liednummern gehören zur Programmstruktur und folgen immer NWS.
 *
 * Übersprungen wird, was der Planer selbst entschieden hat: Wochen mit Anlass
 * (Kreisaufseher, Gedächtnismahl, Kongress) und einzeln gestrichene
 * Zusammenkünfte. NWS kennt beides nicht und teilte sonst ins Leere.
 *
 * Der **Service-Role-Key** umgeht RLS und darf niemals in die App oder ins
 * Repository. Personenbezogene Daten — Ausgaben nicht einchecken.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

/* ===================== Stabile Identität (uuid5) ========================== */

/**
 * Deterministische uuid5 (RFC 4122) — **dieselbe Ableitung wie der
 * Personen-Generator** (`build-personen-sql.mjs`): die App-Person trägt
 * `uuid5("person:<NWS-ID>")` als `id`. Darüber lässt sich eine NWS-Person
 * eindeutig ihrer App-Person zuordnen, auch wenn zwei denselben Anzeigenamen
 * tragen (Dublette „Josef Mayer"). Namespace und Eingabeform müssen exakt zum
 * Generator passen, sonst stimmt die id nicht.
 */
const UUID_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
export function uuid5(name) {
  const ns = Buffer.from(UUID_NS.replace(/-/g, ''), 'hex')
  const h = createHash('sha1').update(ns).update(name, 'utf8').digest()
  h[6] = (h[6] & 0x0f) | 0x50 // Version 5
  h[8] = (h[8] & 0x3f) | 0x80 // Variante
  const s = h.subarray(0, 16).toString('hex')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`
}

/* ===================== NWS-Aufzählungen (aus der Assembly) ================= */

/** PartTypes-Index der Zuteilungen unter der Woche (CLMAssignment.c). */
export const PART = {
  Chairman: 0, OpeningPrayer: 1, ClosingPrayer: 2, TreasuresTalk: 3, SpiritualGems: 4,
  AuxCounselor: 5, BibleReading: 6, Apply1: 7, Apply2: 8, Apply3: 9, Apply4: 10,
  Apply1Assistant: 11, Apply2Assistant: 12, Apply3Assistant: 13, Apply4Assistant: 14,
  Living1: 15, Living2: 16, CBS: 17, CBSReader: 18, Unknown: 19, Living3: 20,
}
/** AssignmentTypes am Wochenende (Assignment.a). */
export const ASG = {
  LocalPublicTalk: 0, AwayPublicTalk: 1, Chairman: 2, WatchtowerReader: 3,
  CustomWeekend1: 4, CustomWeekend2: 5, FieldServiceConductor: 6, CustomFieldService: 7,
  Hospitality: 8, PublicWitnessing: 9,
}

/**
 * NWS-Dienst (Duty1..6) → App-Dienstschlüssel. An diesem Datensatz verifiziert
 * (Audio/Video = Duty5, Zoomordner = Duty6). Duty7+ hat kein App-Pendant.
 */
export const DUTY_KEY = { 1: 'saal', 2: 'ord', 3: 'rund', 4: 'mik', 5: 'ton', 6: 'zoom' }

/**
 * DutyType (Duty.c) → { key, pos } oder { skip }. Die Dienste liegen ab 28 in
 * Zweierschritten (Position 1/2 je Dienst): `Duty = ⌊(c-28)/2⌋+1`,
 * `pos = (c-28) mod 2 + 1`. Reinigung/Garten/Instandhaltung/Benutzerdefiniert
 * tragen eigene Bereiche und werden übersprungen (Reinigung ist gruppenbasiert,
 * in der App eine Rotation).
 */
export function dutySlot(c) {
  if ((c >= 13 && c <= 16) || (c >= 24 && c <= 27)) return { skip: 'reinigung' }
  if (c >= 48 && c <= 51) return { skip: 'instandhaltung' }
  if (c >= 52 && c <= 55) return { skip: 'garten' }
  if (c === 56) return { skip: 'custom' }
  const auf = (duty, pos) => (DUTY_KEY[duty] ? { key: DUTY_KEY[duty], pos } : { skip: 'dienst7' })
  // DutyTypes-Enum (an der NWS-Assembly abgelesen): Duty1–3 je 2 Positionen
  // (28–33), **Duty4 (Mikrofone) VIER** (34–37), Duty5–9 je 2 (38–47). Der Sprung
  // bei Duty4 ist der Grund, warum ⌊(c-28)/2⌋ ab c=36 falsch läge (mik3→ton usw.).
  if (c >= 28 && c <= 33) return auf(Math.floor((c - 28) / 2) + 1, ((c - 28) % 2) + 1)
  if (c >= 34 && c <= 37) return auf(4, c - 33) // Mikrofone P1–P4
  if (c >= 38 && c <= 47) return auf(Math.floor((c - 38) / 2) + 5, ((c - 38) % 2) + 1)
  return { skip: 'unbekannt' }
}

/** Zusammenkunft, zu der ein NWS-Dienst gehört: Mo → Mitte, Sa/So → Wochenende. */
export function meetingOfDuty(iso) {
  const wd = new Date(`${iso}T12:00:00Z`).getUTCDay()
  if (wd === 1) return 'mid'
  if (wd === 6 || wd === 0) return 'we'
  return null
}

/** Anzeige-Name je Dienstschlüssel (für den Zuordnungs-Bericht). */
export const DIENST_ANZEIGE = {
  saal: 'Saalordner', ord: 'Türordner', rund: 'Rundgangsordner',
  mik: 'Mikrofone', ton: 'Audio/Video', zoom: 'Zoomordner', rein: 'Reinigung',
}
/**
 * Muster, an dem der passende **App-Dienst** über seinen Namen erkannt wird.
 * Nötig, weil in der App angelegte Dienste keinen festen Schlüssel (`rund`)
 * tragen, sondern `svc-<uuid>` — dann greift der Name.
 */
const DIENST_MUSTER = {
  saal: /saalordner|\bsaal/i,
  ord: /eingangsordner|türordner|\btür/i,
  rund: /rundgang/i,
  mik: /mikrofon/i,
  ton: /\bton\b|audio|video/i,
  zoom: /zoom/i,
  rein: /reinig/i,
}

/**
 * Kanonischer Dienstschlüssel (saal/ord/…) → tatsächlicher `services.key` der
 * Versammlung. Bevorzugt den festen Schlüssel; sonst über den Namen (App-Dienste
 * mit `svc-<uuid>`). Ein Dienst wird höchstens einmal vergeben. Reine Funktion.
 */
export function dienstZuordnung(services) {
  const map = {}
  const belegt = new Set()
  for (const kanon of Object.keys(DIENST_MUSTER)) {
    let s = services.find((x) => x.key === kanon)
    if (!s) s = services.find((x) => !belegt.has(x.key) && DIENST_MUSTER[kanon].test(x.name ?? ''))
    if (s) { map[kanon] = s.key; belegt.add(s.key) }
  }
  return map
}

/* ============================= Datum ====================================== */

/** Anzeigename wie in der App (`_shared/planung.ts`). */
export function personDisplayName(fn, ln, dn) {
  return (dn && dn.trim()) || `${fn ?? ''} ${ln ?? ''}`.trim()
}

/** Montag (ISO) der Woche, in der `iso` liegt. NWS-Wochenende (Sa) → dieser Montag. */
export function mondayOf(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  const shift = (d.getUTCDay() + 6) % 7 // Mo=0 … So=6
  d.setUTCDate(d.getUTCDate() - shift)
  return d.toISOString().slice(0, 10)
}

/* ===================== NWS-Wochen einsammeln ============================== */

const lebend = (arr) => arr.filter((x) => !x.Deleted)

/**
 * Rohzuteilungen je Programmwoche aus den entschlüsselten NWS-Tabellen.
 * `nwsNameOf(ref)` löst eine Personen-Referenz (mid **oder** volle ID) zum
 * NWS-Anzeigenamen auf. Ergebnis: Map Montag → { mid, we }; jeder Platz ist ein
 * Name (String) oder `null` (keine Zuteilung). Reine Funktion.
 */
export function sammleNwsWochen(t, nwsNameOf, groupNameOf = () => null) {
  const wochen = new Map()
  const holen = (montag) => {
    let w = wochen.get(montag)
    if (!w) {
      w = {
        mid: {
          chairman: null, openingPrayer: null, closingPrayer: null, auxCounselor: null,
          treasuresTalk: null, spiritualGems: null, bibleReading: null,
          apply: [], living: [], cbs: null, cbsReader: null, helpers: {}, cleaning: null,
        },
        we: {
          chairman: null, watchtowerReader: null, speaker: null,
          openingSong: null, closingSong: null, helpers: {}, cleaning: null,
        },
      }
      wochen.set(montag, w)
    }
    return w
  }

  // --- Zusammenkunft unter der Woche (CLMAssignments, datiert auf Montag) ---
  for (const a of lebend(t.clmAssignments ?? [])) {
    const montag = mondayOf(a.a)
    const w = holen(montag).mid
    const name = nwsNameOf(a.b)
    if (a.e) continue // e = Schulungsraum (Zusätzliche Klasse) → Hauptsaal unberührt lassen
    switch (a.c ?? PART.Chairman) {
      case PART.Chairman: w.chairman = name; break
      case PART.OpeningPrayer: w.openingPrayer = name; break
      case PART.ClosingPrayer: w.closingPrayer = name; break
      case PART.AuxCounselor: w.auxCounselor = name; break
      case PART.TreasuresTalk: w.treasuresTalk = name; break
      case PART.SpiritualGems: w.spiritualGems = name; break
      case PART.BibleReading: w.bibleReading = name; break
      case PART.CBS: w.cbs = name; break
      case PART.CBSReader: w.cbsReader = name; break
      case PART.Apply1: setPaar(w.apply, 0, 'student', name); break
      case PART.Apply2: setPaar(w.apply, 1, 'student', name); break
      case PART.Apply3: setPaar(w.apply, 2, 'student', name); break
      case PART.Apply4: setPaar(w.apply, 3, 'student', name); break
      case PART.Apply1Assistant: setPaar(w.apply, 0, 'assistant', name); break
      case PART.Apply2Assistant: setPaar(w.apply, 1, 'assistant', name); break
      case PART.Apply3Assistant: setPaar(w.apply, 2, 'assistant', name); break
      case PART.Apply4Assistant: setPaar(w.apply, 3, 'assistant', name); break
      case PART.Living1: w.living[0] = name; break
      case PART.Living2: w.living[1] = name; break
      case PART.Living3: w.living[2] = name; break
      default: break
    }
  }

  // --- Wochenende: Lieder aus WeekendMeetingSchedules (datiert auf Samstag) ---
  for (const s of lebend(t.weekendSchedules ?? [])) {
    const w = holen(mondayOf(s.d)).we
    if (s.i != null) w.openingSong = s.i
    if (s.f != null) w.closingSong = s.f
  }
  // --- Wochenende: Zuteilungen (Assignments, datiert auf Samstag) ---
  for (const a of lebend(t.assignments ?? [])) {
    if (!a.dt) continue
    const w = holen(mondayOf(a.dt)).we
    switch (a.a ?? ASG.LocalPublicTalk) {
      case ASG.Chairman: w.chairman = a.e || nwsNameOf(a.b); break
      case ASG.WatchtowerReader: w.watchtowerReader = a.e || nwsNameOf(a.b); break
      case ASG.LocalPublicTalk:
        w.speaker = {
          name: a.e || nwsNameOf(a.b), external: Boolean(a.e),
          herkunft: a.d || null, theme: a.g || null, number: a.f || null,
        }
        break
      default: break
    }
  }

  // --- Hilfsdienste (Duties): Mo → Mitte, Sa → Wochenende, je Position -------
  for (const du of lebend(t.duties ?? [])) {
    const mk = meetingOfDuty(du.a)
    if (!mk) continue
    const slot = dutySlot(du.c ?? -1)
    if (du.d === 1) {
      // Gruppenzuteilung: nur die Reinigung geht als Gruppen-Rotation in `rein`.
      // (13/14/15/16 = Zwischen-/Wöchentliche Reinigung; tragen dieselbe Gruppe.)
      if (slot.skip === 'reinigung') holen(mondayOf(du.a))[mk].cleaning = groupNameOf(du.b)
      continue
    }
    if (slot.skip) continue
    const helpers = holen(mondayOf(du.a))[mk].helpers
    const arr = (helpers[slot.key] ??= [])
    arr[slot.pos - 1] = nwsNameOf(du.b)
  }

  return wochen
}

function setPaar(arr, i, feld, name) {
  if (!arr[i]) arr[i] = { student: null, assistant: null }
  arr[i][feld] = name
}

/* ===================== Namen → App-Personen auflösen ====================== */

/**
 * Aus den NWS-Rohnamen (String|null) werden aufgelöste Plätze
 * `{ name, pid? }|null`. `bind(name)` liefert `{ name, pid }` für eine bekannte
 * Person, sonst `{ name }` (externer Redner) — und `null` bleibt `null`.
 */
export function loeseWoche(w, bind) {
  const b = (n) => (n == null ? null : bind(n))
  return {
    mid: {
      chairman: b(w.mid.chairman), openingPrayer: b(w.mid.openingPrayer),
      closingPrayer: b(w.mid.closingPrayer), auxCounselor: b(w.mid.auxCounselor),
      treasuresTalk: b(w.mid.treasuresTalk), spiritualGems: b(w.mid.spiritualGems),
      bibleReading: b(w.mid.bibleReading), cbs: b(w.mid.cbs), cbsReader: b(w.mid.cbsReader),
      apply: w.mid.apply.map((p) => ({ student: b(p?.student), assistant: b(p?.assistant) })),
      living: w.mid.living.map(b),
      helpers: loeseHelpers(w.mid.helpers, b, w.mid.cleaning),
    },
    we: {
      chairman: b(w.we.chairman), watchtowerReader: b(w.we.watchtowerReader),
      speaker: w.we.speaker ? { ...bindSpeaker(w.we.speaker, bind) } : null,
      openingSong: w.we.openingSong, closingSong: w.we.closingSong,
      helpers: loeseHelpers(w.we.helpers, b, w.we.cleaning),
    },
  }
}

/**
 * Hilfsdienst-Namen (String|null) → aufgelöste Plätze `{name,pid?}|null`. Die
 * Reinigung (`cleaning`) ist eine Gruppen-Rotation: der Gruppenname steht ohne
 * pid im `rein`-Slot — nicht über `bind`, denn er meint keine Person.
 */
function loeseHelpers(helpers, b, cleaning) {
  const out = {}
  for (const [key, arr] of Object.entries(helpers)) {
    out[key] = arr.map((n) => (n == null ? null : b(n)))
  }
  if (cleaning) out.rein = [{ name: cleaning }]
  return out
}

function bindSpeaker(sp, bind) {
  // Extern (Freitext) oder ohne auflösbaren Namen → nicht binden; sonst Person.
  const gebunden = sp.external || !sp.name ? { name: sp.name ?? '' } : bind(sp.name)
  return { ...gebunden, herkunft: sp.herkunft, theme: sp.theme, number: sp.number }
}

/* ===================== Slots einer Woche füllen =========================== */

/** Programmpunkte eines Abschnitts (ohne Lied-Zeilen). */
export function partItems(section) {
  return (section?.items ?? []).filter((it) => Array.isArray(it.names))
}
const byFarbe = (m, farbe) => m.sections.find((s) => s.farbe === farbe)

/** Schlusslied-Nummer in einen Titel setzen („… · Lied · …" → „… · Lied 151 · …"). */
export function mitLiedNummer(title, nr) {
  if (nr == null) return title
  const atoms = title.split(' · ')
  const i = atoms.findIndex((a) => a === 'Lied' || a.startsWith('Lied '))
  if (i < 0) return title
  atoms[i] = `Lied ${nr}`
  return atoms.join(' · ')
}

/**
 * Einen Platz setzen. `val` = `{ name, pid? }` oder `null`. Liefert, ob gesetzt
 * wurde (für den Bericht). `nurLeere` lässt bereits besetzte Plätze in Ruhe.
 * Rolle/Bereich/Geschlecht des Slots bleiben unangetastet.
 */
export function setSlot(names, idx, val, zaehler, nurLeere) {
  if (!val || !val.name) return false
  const slot = names?.[idx]
  if (!slot) { zaehler.fehlplatz++; return false }
  return setSlotObj(slot, val, zaehler, nurLeere)
}

/**
 * Dasselbe auf einem Platz-**Objekt**. Der Ratgeber der Zusätzlichen Klasse
 * steht als einziger Platz nicht in einer Namensliste, sondern direkt in
 * `meeting.auxRatgeber` — er soll aber denselben Regeln folgen: `nurLeere`
 * achten und eine alte `pid` löschen, wenn NWS keine mitbringt (sonst trüge der
 * neue Name die Id der vorigen Person, und `gehoertZu` zählte die Aufgabe der
 * falschen Person zu).
 */
export function setSlotObj(slot, val, zaehler, nurLeere) {
  if (!val || !val.name) return false
  if (nurLeere && slot.name) return false
  slot.name = val.name
  if (val.pid != null) slot.pid = val.pid
  else delete slot.pid
  zaehler.gesetzt++
  if (val.pid == null) zaehler.ohnePid++
  return true
}

/**
 * Hilfsdienst-Plätze in `meeting.helpers` eintragen — kanonisch wie der Reducer
 * (`assignSlot`): Array mit `{name:''}` bis zur Position auffüllen, dann setzen.
 *
 * `keyMap` bildet den kanonischen Dienstschlüssel (saal/ord/…) auf den echten
 * `services.key` der Versammlung ab (siehe `dienstZuordnung`). Fehlt die
 * Abbildung, gibt es keinen App-Dienst für diesen NWS-Dienst — die Plätze werden
 * dann NICHT geschrieben (die App würde sie ohnehin nicht anzeigen) und gezählt.
 * Ohne `keyMap` (Tests) gilt der Schlüssel unverändert.
 */
export function verteileHelpers(meeting, helpers, zaehler, nurLeere, keyMap) {
  meeting.helpers ??= {}
  for (const [key, arr] of Object.entries(helpers)) {
    const zielKey = keyMap ? keyMap[key] : key
    if (!zielKey) {
      const offen = arr.filter((v) => v && v.name).length
      if (offen) zaehler.helferOhneDienst = (zaehler.helferOhneDienst ?? 0) + offen
      continue
    }
    let ziel = meeting.helpers[zielKey]
    arr.forEach((val, pos) => {
      if (!val || !val.name) return
      if (!ziel) ziel = meeting.helpers[zielKey] = []
      while (ziel.length <= pos) ziel.push({ name: '' })
      if (nurLeere && ziel[pos].name) return
      ziel[pos] = val.pid != null ? { name: val.name, pid: val.pid } : { name: val.name }
      zaehler.helfer++
      if (val.pid == null) zaehler.helferOhnePid++
    })
  }
}

/** Zuteilungen der Zusammenkunft unter der Woche in `meeting` eintragen. */
export function verteileMitte(meeting, mid, zaehler, nurLeere, keyMap) {
  const s = meeting.sections
  const eroeffnung = s[0]
  const abschluss = s[s.length - 1]
  const openNames = partItems(eroeffnung)[0]?.names
  setSlot(openNames, 0, mid.chairman, zaehler, nurLeere)
  setSlot(openNames, 1, mid.openingPrayer, zaehler, nurLeere)
  setSlot(partItems(abschluss)[0]?.names, 0, mid.closingPrayer, zaehler, nurLeere)

  const schaetze = partItems(byFarbe(meeting, 'petrol') ?? {})
  if (schaetze.length) {
    setSlot(schaetze[0].names, 0, mid.treasuresTalk, zaehler, nurLeere)
    const letzte = schaetze[schaetze.length - 1]
    setSlot(letzte.names, 0, mid.bibleReading, zaehler, nurLeere)
    const gems = schaetze.find((p, i) => i > 0 && p !== letzte)
    if (gems) setSlot(gems.names, 0, mid.spiritualGems, zaehler, nurLeere)
  }

  const dienst = partItems(byFarbe(meeting, 'gold') ?? {})
  dienst.forEach((p, i) => {
    const paar = mid.apply[i]
    if (!paar) return
    setSlot(p.names, 0, paar.student, zaehler, nurLeere)
    if (p.names.length > 1) setSlot(p.names, 1, paar.assistant, zaehler, nurLeere)
  })

  const leben = partItems(byFarbe(meeting, 'wein') ?? {})
  if (leben.length) {
    const vbs = leben[leben.length - 1]
    setSlot(vbs.names, 0, mid.cbs, zaehler, nurLeere)
    if (vbs.names.length > 1) setSlot(vbs.names, 1, mid.cbsReader, zaehler, nurLeere)
    leben.slice(0, -1).forEach((p, k) => setSlot(p.names, 0, mid.living[k], zaehler, nurLeere))
  }

  // Ratgeber nur eintragen, wenn die Woche eine Zusätzliche Klasse führt.
  if (mid.auxCounselor && meeting.auxRatgeber !== undefined) {
    setSlotObj(meeting.auxRatgeber, mid.auxCounselor, zaehler, nurLeere)
  }

  verteileHelpers(meeting, mid.helpers, zaehler, nurLeere, keyMap)
}

/** Zuteilungen des Wochenendes in `meeting` eintragen. */
export function verteileWochenende(meeting, we, zaehler, nurLeere, keyMap) {
  const s = meeting.sections
  const eroeffnung = s[0]
  const abschluss = s[s.length - 1]
  const openItem = partItems(eroeffnung)[0]
  setSlot(openItem?.names, 0, we.chairman, zaehler, nurLeere)
  // Liednummern sind keine Zuteilung, sondern Programmstruktur — sie folgen
  // deshalb auch bei `--nur-leere` immer NWS. (Die Flagge schützt Namen, die
  // der Planer gesetzt hat; ein Lied hat er nicht „vergeben".)
  if (openItem && we.openingSong != null) openItem.title = mitLiedNummer(openItem.title, we.openingSong)

  const vortrag = partItems(byFarbe(meeting, 'petrol') ?? {})[0]
  if (vortrag && we.speaker) {
    // Das Thema gehört zum Redner — es wird nur mitgeschrieben, wenn auch sein
    // Name gesetzt wurde. Sonst stünde bei `--nur-leere` das NWS-Thema über dem
    // Redner, den der Planer selbst eingetragen hat.
    if (setSlot(vortrag.names, 0, we.speaker, zaehler, nurLeere) && we.speaker.theme) {
      vortrag.title = we.speaker.theme
    }
  }

  const wt = partItems(byFarbe(meeting, 'wein') ?? {})
  if (wt.length) setSlot(wt[wt.length - 1].names, 1, we.watchtowerReader, zaehler, nurLeere)

  const schlussItem = partItems(abschluss)[0]
  if (schlussItem && we.closingSong != null) {
    schlussItem.title = mitLiedNummer(schlussItem.title, we.closingSong)
  }

  verteileHelpers(meeting, we.helpers, zaehler, nurLeere, keyMap)
}

/**
 * Eine ganze Woche (jsonb `data`) mit NWS-Zuteilungen füllen; liefert Bericht.
 *
 * **Eine gestrichene Zusammenkunft bleibt leer.** NWS kennt den Ausfall nicht
 * und teilt weiter zu; die Namen lägen unsichtbar in den Daten und träten
 * hervor, sobald der Planer den Strich zurücknimmt — der löscht nur
 * `cancelled`, nicht die Zuteilungen. Sonderwochen (Anlass) fängt schon
 * `main()` ab; hier geht es um einzeln gestrichene Zusammenkünfte, deren Grund
 * kein Anlass der Woche ist („Saal belegt").
 */
export function verteileWoche(data, gebunden, nurLeere, keyMap) {
  const zaehler = { gesetzt: 0, ohnePid: 0, fehlplatz: 0, helfer: 0, helferOhnePid: 0, helferOhneDienst: 0, gestrichen: 0 }
  const faelltAus = (tab) => {
    if (!data.dev?.[tab]?.cancelled) return false
    zaehler.gestrichen++
    return true
  }
  if (data.mid && !faelltAus('mid')) verteileMitte(data.mid, gebunden.mid, zaehler, nurLeere, keyMap)
  if (data.we && !faelltAus('we')) verteileWochenende(data.we, gebunden.we, zaehler, nurLeere, keyMap)
  return zaehler
}

/* ============================= Ausführung ================================= */

/** Argumente `--name Wert`; `--flagge` → true. */
export function argumente(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true
    else { out[a.slice(2)] = next; i++ }
  }
  return out
}

const TABELLEN = {
  persons: 'Persons_7.5.json',
  clmAssignments: 'CLMAssignments_7.5.json',
  weekendSchedules: 'WeekendMeetingSchedules_7.5.json',
  assignments: 'Assignments_7.5.json',
  duties: 'Duties_7.5.json',
  fieldServiceGroups: 'FieldServiceGroups_7.5.json',
}

function ladeTabellen(dir) {
  const t = {}
  for (const [key, datei] of Object.entries(TABELLEN)) {
    t[key] = JSON.parse(fs.readFileSync(path.join(dir, datei), 'utf8'))
  }
  return t
}

/**
 * NWS-Namensauflösung: mid **und** volle ID → Anzeigename.
 *
 * Ist `appById` (App-Person-`id` → Anzeigename) gegeben, wird die Person zuerst
 * über ihre **stabile id** gesucht (`uuid5("person:<NWS-ID>")`, wie sie der
 * Generator vergibt) und deren App-Anzeigename genommen. Das löst
 * Namensdubletten, die der bloße NWS-Name nicht eindeutig träfe: „Josef Mayer"
 * steht in der App als „Josef Mayer (2)" — über den Namen allein findet der
 * Import keinen Treffer, über die id schon. Ohne `appById` (Tests, kein
 * App-Kontext) bleibt der rohe NWS-Name.
 *
 * Getrimmt: NWS-Anzeigenamen tragen vereinzelt ein Leerzeichen am Ende, das
 * sonst den Abgleich mit der App-Person verfehlt („Charlette Born “).
 */
export function nwsNamensAufloeser(persons, appById = null) {
  const m = new Map()
  for (const p of persons) {
    const roh = (p.d || `${p.a ?? ''} ${p.b ?? ''}`).trim()
    const appName = appById && p.ID != null ? appById.get(uuid5(`person:${p.ID}`)) : undefined
    const name = appName ?? roh
    if (p.mid != null) m.set(p.mid, name)
    if (p.ID != null) m.set(p.ID, name)
  }
  return (ref) => m.get(ref) || null
}

/** Menge aller NWS-Anzeigenamen (lebende Personen) — für die Fehlmeldung. */
export function nwsPersonenNamen(persons) {
  return new Set(lebend(persons).map((p) => (p.d || `${p.a ?? ''} ${p.b ?? ''}`).trim()))
}

/**
 * NWS-Felddienstgruppe (ID) → App-Gruppenname „Gruppe N". Die NWS-Gruppen heißen
 * „PDG-N …" (z. B. „PDG-3 Matthias Thoma"); N ist die App-Gruppennummer (mit dem
 * Betreiber bestätigt: PDG-1…6 = Gruppe 1…6).
 */
export function gruppenNamensAufloeser(fieldServiceGroups) {
  const m = new Map()
  for (const g of lebend(fieldServiceGroups ?? [])) {
    const nr = /PDG-(\d+)/.exec(g.a ?? '')
    if (nr) m.set(g.ID, `Gruppe ${nr[1]}`)
  }
  return (id) => m.get(id) || null
}

async function main() {
  const arg = argumente(process.argv.slice(2))
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const datenDir = arg.daten || 'C:/DATA/Claude/nws-export/MyData-decrypted'
  const nurLeere = Boolean(arg['nur-leere'])
  const fehlt = []
  if (!url) fehlt.push('SUPABASE_URL')
  if (!key) fehlt.push('SUPABASE_SERVICE_ROLE_KEY')
  if (fehlt.length) {
    console.error(`Fehlt: ${fehlt.join(', ')}\n\nAufruf siehe Kopf dieser Datei.`)
    process.exit(2)
  }

  const rest = async (pfad, init = {}) => {
    const res = await fetch(`${url}/rest/v1/${pfad}`, {
      ...init,
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', ...(init.headers || {}),
      },
    })
    if (!res.ok) throw new Error(`${init.method || 'GET'} ${pfad} ${res.status}: ${await res.text()}`)
    // Leerer Body bei jedem Erfolgsstatus (PATCH/return=minimal → 204, aber auch
    // ein leeres 200/201 darf `res.json()` nicht zum Werfen bringen).
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }

  // 1) Versammlung + App-Personen ZUERST — die NWS→App-Namensauflösung braucht
  //    sie, um Dubletten über die stabile id aufzulösen (siehe unten).
  const tabellen = ladeTabellen(datenDir)
  const cong = arg.cong || (await rest('congregations?select=id&limit=1'))[0]?.id
  if (!cong) { console.error('Keine Versammlung gefunden.'); process.exit(1) }
  const personen = await rest(`persons?select=id,fn,ln,dn&congregation_id=eq.${cong}`)
  const nachName = new Map()
  const appById = new Map() // id → Anzeigename, für die id-basierte Auflösung
  for (const p of personen) {
    const n = personDisplayName(p.fn, p.ln, p.dn)
    if (!nachName.has(n)) nachName.set(n, [])
    nachName.get(n).push({ id: p.id, name: n })
    appById.set(p.id, n)
  }

  // 2) NWS-Zuteilungen einsammeln — Namen über die id an die App-Person gebunden.
  const nwsNameOf = nwsNamensAufloeser(tabellen.persons, appById)
  const groupNameOf = gruppenNamensAufloeser(tabellen.fieldServiceGroups)
  const nwsWochen = sammleNwsWochen(tabellen, nwsNameOf, groupNameOf)
  console.log(`NWS: ${nwsWochen.size} Programmwochen mit Zuteilungen.`)
  const nwsNamen = nwsPersonenNamen(tabellen.persons)
  const dubletten = new Set()
  const fehlendePersonen = new Set()
  const bind = (roh) => {
    const name = (roh ?? '').trim()
    if (!name) return { name: '' } // kein auflösbarer Name → offener Slot
    const treffer = nachName.get(name)
    if (!treffer || treffer.length === 0) {
      // Kein Treffer: entweder externer Redner (nicht in NWS) — das ist normal —
      // oder eine NWS-Person, die (noch) nicht in der App steht.
      if (nwsNamen.has(name)) fehlendePersonen.add(name)
      return { name }
    }
    if (treffer.length > 1) { dubletten.add(name); return { name } } // mehrdeutig → nur Name
    return { name: treffer[0].name, pid: treffer[0].id }
  }

  const wochen = await rest(`weeks?select=start,data&congregation_id=eq.${cong}`)
  const nachStart = new Map(wochen.map((w) => [w.start, w]))
  console.log(`App: ${personen.length} Personen, ${wochen.length} importierte Wochen.`)

  // Hilfsdienst-Zuordnung: NWS-Dienst → tatsächlicher App-Dienst. In der App
  // angelegte Dienste tragen `svc-<uuid>` statt fester Schlüssel — ohne diese
  // Zuordnung landeten ihre Zuteilungen in einem Schlüssel, den kein Dienst zeigt.
  const services = await rest(`services?select=key,name&congregation_id=eq.${cong}`)
  const keyMap = dienstZuordnung(services)
  console.log('\nHilfsdienst-Zuordnung (NWS → App):')
  for (const kanon of Object.keys(DIENST_ANZEIGE)) {
    const k = keyMap[kanon]
    const s = k ? services.find((x) => x.key === k) : null
    console.log(`  ${DIENST_ANZEIGE[kanon].padEnd(16)} → ${s ? `${s.name} [${k}]` : '— kein App-Dienst, Plätze bleiben ungeschrieben'}`)
  }

  // 3) Woche für Woche füllen
  let getroffen = 0, ohneWoche = 0, sonder = 0, gestrichen = 0
  let gesetzt = 0, ohnePid = 0, fehlplatz = 0, helfer = 0, helferOhnePid = 0, helferOhneDienst = 0
  const geschrieben = []
  for (const [montag, roh] of [...nwsWochen].sort((a, b) => a[0].localeCompare(b[0]))) {
    const zeile = nachStart.get(montag)
    if (!zeile) { ohneWoche++; continue }
    // Wochen mit Anlass bleiben dem Planer überlassen: Beim Kreisaufseher ist
    // das Programm umgebaut (Dienstvortrag statt VBS) — Plätze verschieben sich,
    // NWS trägt sie anders —, beim Gedächtnismahl entfällt eine Zusammenkunft,
    // beim Kongress die ganze Woche. Geprüft wird wie `anlassArt()` in der App:
    // das neue Feld, sonst die alten Flags. Alle drei Arten sind Aussagen über
    // die Woche, deshalb genügt „hat einen Anlass".
    const anlass = zeile.data.anlass?.art ?? (zeile.data.co ? 'co' : zeile.data.mem ? 'mem' : undefined)
    if (anlass) { sonder++; continue }
    getroffen++
    const gebunden = loeseWoche(roh, bind)
    const z = verteileWoche(zeile.data, gebunden, nurLeere, keyMap)
    gesetzt += z.gesetzt; ohnePid += z.ohnePid; fehlplatz += z.fehlplatz; gestrichen += z.gestrichen
    helfer += z.helfer; helferOhnePid += z.helferOhnePid; helferOhneDienst += z.helferOhneDienst
    if (z.gesetzt + z.helfer > 0) geschrieben.push({ montag, data: zeile.data, z })
  }

  // Übersprungene Dienste zählen (Dienst 7/Garten/…) — zur Einordnung. Die
  // Reinigung wird importiert und daher hier NICHT als übersprungen gezählt.
  const uebersprungen = {}
  for (const du of (tabellen.duties ?? []).filter((x) => !x.Deleted)) {
    const s = dutySlot(du.c ?? -1)
    if (du.d === 1) {
      if (s.skip && s.skip !== 'reinigung') uebersprungen[s.skip] = (uebersprungen[s.skip] ?? 0) + 1
    } else if (s.skip) {
      uebersprungen[s.skip] = (uebersprungen[s.skip] ?? 0) + 1
    }
  }

  console.log(`\nGetroffene Wochen: ${getroffen} · ohne jw.org-Import: ${ohneWoche} · Sonderwochen übersprungen: ${sonder}`)
  if (gestrichen) console.log(`Gestrichene Zusammenkünfte übersprungen: ${gestrichen}`)
  console.log(`Programmplätze gesetzt: ${gesetzt} (ohne pid/extern: ${ohnePid}) · Slots fehlten: ${fehlplatz}`)
  console.log(`Hilfsdienst-Plätze gesetzt: ${helfer} (ohne pid: ${helferOhnePid})`)
  if (helferOhneDienst) console.log(`  ! ${helferOhneDienst} Hilfsdienst-Plätze ohne passenden App-Dienst — nicht geschrieben (siehe Zuordnung oben).`)
  const skips = Object.entries(uebersprungen).map(([k, n]) => `${k}: ${n}`).join(' · ')
  if (skips) console.log(`Dienste ohne Import (nur gezählt): ${skips}`)
  if (dubletten.size) console.log(`Mehrdeutige Namen (nur Name, keine pid): ${[...dubletten].join(', ')}`)
  if (fehlendePersonen.size) {
    console.log(`\nNWS-Personen ohne App-Konto (nur Name gesetzt — Personen neu importieren?):`)
    console.log(`  ${[...fehlendePersonen].sort().join(', ')}`)
  }

  if (arg.trocken) {
    console.log('\n--trocken: nichts geschrieben.')
    for (const g of geschrieben.slice(0, 3)) {
      console.log(`  ${g.montag}: ${g.z.gesetzt} Programm- + ${g.z.helfer} Hilfsdienst-Plätze`)
    }
    return
  }

  // 4) Zurückschreiben (nur veränderte Wochen)
  for (const g of geschrieben) {
    await rest(`weeks?congregation_id=eq.${cong}&start=eq.${g.montag}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data: g.data }),
    })
  }
  console.log(`\nGeschrieben: ${geschrieben.length} Wochen aktualisiert.`)
}

// Nur ausführen, wenn direkt aufgerufen — beim Import aus dem Test nicht.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  })
}
