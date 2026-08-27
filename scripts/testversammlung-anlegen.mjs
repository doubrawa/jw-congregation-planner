#!/usr/bin/env node
/**
 * Eine **zweite** Versammlung als Testbestand anlegen — die Voraussetzung für
 * den Mandanten-Nachweis (T78).
 *
 * T78 steht offen, seit es die Trennung gibt: Die Richtlinien (`RLS` über
 * `my_congregation_id()`) sind formuliert, aber **nie an einem zweiten
 * Mandanten gemessen** worden. Ohne zweite Versammlung ist der Nachweis nicht
 * führbar — eine Abfrage, die nichts Fremdes zurückgibt, beweist nichts,
 * solange es nichts Fremdes gibt. Dieses Skript stellt genau das her.
 *
 * **Warum nicht `versammlung-anlegen.mjs`.** Das Skript legt bewusst *keine*
 * erfundenen Personen und Wochen an: Ein Planer könnte sie für seinen Bestand
 * halten. Hier ist erfundener Bestand der Zweck. Beides in einem Skript wäre
 * ein Schalter, der die Doktrin des anderen aufweicht — deshalb ein eigenes,
 * das im Namen sagt, was es tut, und mit `--entfernen` restlos zurücknehmbar
 * ist.
 *
 * Was entsteht:
 *
 *   * die Versammlung, drei Gruppen, 30 erfundene Personen (Aufseher und
 *     Gehilfen gesetzt, Ehepaare als Haushalt verknüpft),
 *   * die Standard-Hilfsdienste (aus `versammlung-anlegen.mjs`, eine Quelle),
 *   * zwei Konten über die Auth-Admin-API — ein Planer und ein einfaches
 *     Mitglied —, beide mit `members`-Zeile und Person verknüpft,
 *   * ein Treffpunkt-Grundplan (zwei Regeln); die Wochen materialisiert die
 *     App daraus selbst,
 *   * `--wochen N` **echte** Wochen von jw.org über die Edge Function
 *     `import-week` — kein erfundenes Programm,
 *   * Zuteilungen in diesen Wochen: Programmplätze und Hilfsdienste.
 *
 * **Die Zuteilungen füllt dieses Skript selbst, mit einer bewusst einfachen
 * Regel** (qualifiziert · Geschlecht · kein Hilfsdienst neben einem
 * Programmpunkt · reihum, und zwar der am wenigsten Belastete unter den am
 * wenigsten Vielseitigen). Das ist **nicht** die
 * Auto-Zuteilung der App (`autoAssignMeeting` in `src/data/planning.ts`): die
 * wägt Auslastung über Wochen, Abwesenheiten und Abstände ab, und sie ist
 * TypeScript, das Node hier nicht lädt. Für einen Testbestand genügt „plausibel
 * besetzt"; wer die echte Logik sehen will, drückt in der App „Automatisch".
 * Die Regel hier steht deshalb absichtlich klein und an einer Stelle.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/testversammlung-anlegen.mjs \
 *     [--name "Probeversammlung Talheim"] [--wochen 2] \
 *     [--mail-planer planer@probe.invalid] [--mail-mitglied schwester@probe.invalid] \
 *     [--trocken]
 *
 *   node scripts/testversammlung-anlegen.mjs --entfernen <id|name> --wirklich
 *
 * `--entfernen` nimmt die Id **oder** den Namen der Versammlung — nach einem
 * Abbruch hat man die Id nicht zur Hand, den Namen immer. Entfernt werden auch
 * Konten **ohne** `members`-Zeile, wie ein abgebrochener Lauf sie hinterlässt.
 *
 * `--trocken` zeigt nur, was geschähe, und schreibt nichts. **Immer zuerst so.**
 *
 * Die Konto-Adressen liegen auf `.invalid` (RFC 2606): nie zustellbar, nie
 * geroutet. Die Konten entstehen über die Admin-API mit `email_confirm`, es
 * geht also **keine** Mail hinaus. Die erfundenen Personen bekommen gar keine
 * Adresse — dann kann auch `send-invite` sie nie anschreiben.
 *
 * Der Service-Role-Key umgeht RLS und darf niemals in die App oder ins
 * Repository.
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { STANDARD_DIENSTE } from './versammlung-anlegen.mjs'
import { argumente, personDisplayName } from './gemeinsam.mjs'
export { argumente }
export { personDisplayName as displayName }

/* ===================== Der erfundene Bestand ============================== */

export const TEST_GRUPPEN = ['Gruppe 1', 'Gruppe 2', 'Gruppe 3']

/**
 * Bereiche nach Stellung. Zusammengefasst statt je Person ausgeschrieben: Die
 * Aussage ist „ein Ältester darf das Feste", nicht eine Liste von 18 Zufällen.
 * Wer einen Sonderfall braucht, hängt ihn in `plus` an.
 */
const AELTESTER = ['vorsitzMid', 'vorsitzWe', 'vortrag', 'gebet', 'studium', 'leser', 'bibellesung', 'schulung', 'schulungPartner', 'treffpunkt', 'ratgeber']
const GEHILFE = ['gebet', 'leser', 'bibellesung', 'schulung', 'schulungPartner', 'treffpunkt', 'ratgeber']
const BRUDER = ['bibellesung', 'schulung', 'schulungPartner']
const SCHWESTER = ['schulung', 'schulungPartner']

/**
 * 30 erfundene Personen — 18 Brüder, 12 Schwestern. Die Namen sind frei
 * erfunden und bewusst **nicht** aus dem echten Bestand entlehnt: Wer die
 * Datenbank ansieht, soll die beiden Versammlungen nicht verwechseln können.
 *
 * **Die Zahl ist nicht beliebig.** Eine Zusammenkunft unter der Woche braucht
 * rund zehn Brüder im Programm und sieben weitere für die Hilfsdienste — und
 * die dürfen sich nicht überschneiden (siehe `fuelleZuteilungen`). Mit dem
 * ersten Entwurf aus 13 Brüdern blieben an einer echten Woche vier
 * Programmplätze und vier Dienste leer.
 *
 * `g` = Gruppenindex · `w` = Schwester · `av` = Aufseher / `ag` = Gehilfe seiner
 * Gruppe · `haus` = Haushalt (Ehepaare; steuert die Partner-Regel im
 * Schülerteil) · `d` = Hilfsdienste, für die die Person freigegeben ist.
 */
export const TEST_PERSONEN = [
  { fn: 'Martin', ln: 'Aichinger', rolle: 'aeltester', g: 0, av: true, haus: 'aichinger', plus: ['wtLeiter'], d: [] },
  { fn: 'Thomas', ln: 'Ebersbach', rolle: 'aeltester', g: 1, av: true, haus: 'ebersbach', plus: ['wtVertreter'], d: [] },
  { fn: 'Wolfgang', ln: 'Nusser', rolle: 'aeltester', g: 2, av: true, haus: 'nusser', d: [] },
  { fn: 'Andreas', ln: 'Rothacker', rolle: 'aeltester', g: 0, d: ['ton'] },
  { fn: 'Peter', ln: 'Ostermann', rolle: 'aeltester', g: 1, d: ['zoom'] },
  { fn: 'Reinhold', ln: 'Vollmer', rolle: 'aeltester', g: 2, d: ['ord'] },
  { fn: 'Gerhard', ln: 'Steinlein', rolle: 'aeltester', g: 1, haus: 'steinlein', d: [] },
  { fn: 'Stefan', ln: 'Gutmann', rolle: 'dienstamtgehilfe', g: 0, ag: true, d: ['ton', 'mik'] },
  { fn: 'Daniel', ln: 'Küpper', rolle: 'dienstamtgehilfe', g: 1, ag: true, d: ['mik', 'saal'] },
  { fn: 'Matthias', ln: 'Lindenau', rolle: 'dienstamtgehilfe', g: 2, ag: true, d: ['zoom', 'rund'] },
  { fn: 'Christoph', ln: 'Weidemann', rolle: 'dienstamtgehilfe', g: 0, haus: 'weidemann', d: ['ord', 'saal'] },
  { fn: 'Bernhard', ln: 'Trautwein', rolle: 'dienstamtgehilfe', g: 1, d: ['ton', 'zoom'] },
  { fn: 'Simon', ln: 'Haberkorn', rolle: 'dienstamtgehilfe', g: 2, haus: 'haberkorn', d: ['mik', 'rund'] },
  { fn: 'Jonathan', ln: 'Pfeiffer', rolle: 'verkuendiger', g: 1, d: ['mik', 'rund'] },
  { fn: 'Lukas', ln: 'Sandmann', rolle: 'verkuendiger', g: 2, haus: 'sandmann', d: ['ton', 'saal'] },
  { fn: 'Tobias', ln: 'Reinhardt', rolle: 'verkuendiger', g: 0, d: ['ord', 'rund'] },
  { fn: 'Philipp', ln: 'Marquardt', rolle: 'verkuendiger', g: 2, d: ['saal', 'zoom'] },
  { fn: 'Fabian', ln: 'Ziegler', rolle: 'verkuendiger', g: 0, haus: 'ziegler', d: ['mik', 'ord'] },
  { fn: 'Elena', ln: 'Aichinger', rolle: 'verkuendiger', w: true, g: 0, haus: 'aichinger', d: [] },
  { fn: 'Sabine', ln: 'Ebersbach', rolle: 'verkuendiger', w: true, g: 1, haus: 'ebersbach', d: [] },
  { fn: 'Miriam', ln: 'Nusser', rolle: 'verkuendiger', w: true, g: 2, haus: 'nusser', d: [] },
  { fn: 'Hanna', ln: 'Weidemann', rolle: 'verkuendiger', w: true, g: 0, haus: 'weidemann', d: [] },
  { fn: 'Julia', ln: 'Sandmann', rolle: 'verkuendiger', w: true, g: 2, haus: 'sandmann', d: [] },
  { fn: 'Rebekka', ln: 'Steinlein', rolle: 'verkuendiger', w: true, g: 1, haus: 'steinlein', d: [] },
  { fn: 'Lea', ln: 'Haberkorn', rolle: 'verkuendiger', w: true, g: 2, haus: 'haberkorn', d: [] },
  { fn: 'Carina', ln: 'Ziegler', rolle: 'verkuendiger', w: true, g: 0, haus: 'ziegler', d: [] },
  { fn: 'Annika', ln: 'Bergmiller', rolle: 'verkuendiger', w: true, g: 1, d: [] },
  { fn: 'Susanne', ln: 'Hollstein', rolle: 'verkuendiger', w: true, g: 2, d: [] },
  { fn: 'Theresa', ln: 'Kaltenbach', rolle: 'verkuendiger', w: true, g: 0, d: [] },
  { fn: 'Doris', ln: 'Wenzlaff', rolle: 'verkuendiger', w: true, g: 1, d: [] },
]

/** Bereichsprofil einer Testperson: Stellung + Sonderfälle + Hilfsdienste. */
export function bereiche(p) {
  const fest = p.w ? SCHWESTER : p.rolle === 'aeltester' ? AELTESTER : p.rolle === 'dienstamtgehilfe' ? GEHILFE : BRUDER
  const keys = [...fest, ...(p.plus ?? []), ...(p.d ?? []).map((k) => `svc:${k}`)]
  return Object.fromEntries(keys.map((k) => [k, true]))
}

/**
 * Treffpunkt-Grundplan. Nur die **Regeln** werden geschrieben; die Wochen
 * (`fs_weeks`) baut die App beim Laden daraus (`regenFsWeeks`) — sie hier
 * vorzuberechnen hieße, dieselbe Ableitung ein zweites Mal zu führen.
 */
export const TEST_FS_REGELN = [
  { grp: '', wd: 6, time: '09:30', place: 'Königreichssaal', monthly: 0, skipCong: false },
  { grp: '', wd: 2, time: '18:00', place: 'Marktplatz', monthly: 0, skipCong: false },
]

/**
 * Auswärtige Redner für die Wochenend-Vorträge. Sie stehen als **Freitext** im
 * Platz, ohne `pid` — genau wie in der App, wenn der Planer einen Gastredner
 * einträgt. Die Herkunftsversammlung hängt an der Rolle, sie hat kein eigenes
 * Feld (siehe `helpers.ts` → „Basis-Rolle ohne angehängte Herkunft").
 */
export const TEST_GASTREDNER = [
  { name: 'H. Brügger', herkunft: 'Vers. Ringheim' },
  { name: 'F. Sailer', herkunft: 'Vers. Oberau' },
  { name: 'K. Deppisch', herkunft: 'Vers. Ringheim' },
]

/* ===================== Reine Regeln (prüfbar) ============================= */

/**
 * Plätze, die **nicht** an eine Person der Versammlung gehen: Gastredner und
 * Kreisaufseher kommen von außen. Dieselbe Regel wie `SKIP_ROLE` in
 * `planning.ts` und `helpers.ts` — dort hängt daran, dass es für sie keinen
 * Bestätigungs-Flow, keine Erinnerung und keine Ersatzsuche gibt.
 *
 * Ein solcher Platz mit `pid` wäre ein Zustand, den die App nie erzeugt; die
 * Auto-Zuteilung lässt ihn deshalb ebenfalls stehen. Hier bekommt er Freitext.
 */
export const EXTERNE_ROLLE = /Gastredner|Kreisaufseher/

/**
 * Kennwort für ein Testkonto — aus `crypto`, nicht aus `Math.random()`. Es
 * schützt zwar nur erfundene Daten, liegt aber in derselben Auth-Tabelle wie
 * die echten Konten.
 */
export function passwort(bytes = randomBytes) {
  return bytes(18).toString('base64url')
}

/** Wie viele Bereiche jemand abdeckt — je weniger, desto schwerer ersetzbar. */
export function vielseitigkeit(p) {
  return Object.values(p.priv ?? {}).filter(Boolean).length
}

/**
 * Wer passt auf diesen Platz? Reine Funktion — die ganze Auswahlregel steht
 * hier und nirgends sonst.
 *
 * `gesperrt` sind die Personen, die in **dieser** Zusammenkunft nicht (mehr) in
 * Frage kommen. Wer das ist, entscheidet der Aufrufer, denn die App zieht die
 * Grenze nicht dort, wo man sie vermutet (`weekConflicts` in planning.ts): Zwei
 * **Programmpunkte** in einer Zusammenkunft sind ausdrücklich **kein** Konflikt
 * (Vorsitz + Anfangsgebet ist der Normalfall). Gemeldet werden nur
 * *Hilfsdienst + Programmpunkt* am selben Tag und *mehrere Hilfsdienste*.
 *
 * Ausgewählt wird nach zwei Zahlen, in dieser Reihenfolge:
 *
 *  1. **Wer bisher am wenigsten hatte** (`zaehler`) — verteilt die Last.
 *  2. **Wer am wenigsten kann** — ein Ältester deckt elf Bereiche ab, eine
 *     Schwester zwei. Verbraucht man die Vielseitigen an den Plätzen, die auch
 *     andere könnten, bleiben am Ende der Zusammenkunft Leiter, Leser und
 *     Schlussgebet leer, weil nur noch Unqualifizierte übrig sind. Genau das
 *     ist beim ersten Lauf an einer echten Woche passiert.
 *
 * Bei Gleichstand gewinnt der Erste der Liste — damit ist der Lauf
 * **wiederholbar** und nicht zufällig.
 */
export function waehle(personen, slot, gesperrt, zaehler, fuehrend = null) {
  const key = slot.bereichsKey
  if (!key) return null
  const lead = fuehrend?.pid ? personen.find((x) => x.id === fuehrend.pid) : null
  const passt = (p) => {
    if (gesperrt.has(p.id)) return false
    if (slot.male && p.female) return false
    const q = p.priv ?? {}
    // Ein Gesprächsführer darf auch als Partner einspringen — wie `isQualified`.
    const ok = key === 'schulungPartner' ? q.schulungPartner || q.schulung : q[key]
    if (!ok) return false
    // Partner: gleiches Geschlecht oder derselbe Haushalt (`partnerGenderOk`).
    if (lead && lead.female !== p.female && !(lead.fam && lead.fam === p.fam)) return false
    return true
  }
  const rang = (p) => [zaehler.get(p.id) ?? 0, vielseitigkeit(p)]
  const kandidaten = personen.filter(passt)
  if (kandidaten.length === 0) return null
  return kandidaten.reduce((a, b) => {
    const [za, va] = rang(a)
    const [zb, vb] = rang(b)
    return zb < za || (zb === za && vb < va) ? b : a
  })
}

/**
 * Eine Woche besetzen — beide Zusammenkünfte, Programmplätze und Hilfsdienste.
 * Ändert `week` an Ort und Stelle und liefert die Zahl der gesetzten Plätze.
 *
 * `stand` trägt über die Wochen hinweg: der Zähler (damit nicht immer dieselben
 * drei arbeiten) und die Gruppen-Rotation der Reinigung.
 */
export function fuelleZuteilungen(week, personen, dienste, gruppen, stand = { zaehler: new Map(), rotation: 0 }) {
  let gesetzt = 0
  const nimm = (p, wohin) => {
    wohin.add(p.id)
    stand.zaehler.set(p.id, (stand.zaehler.get(p.id) ?? 0) + 1)
    gesetzt++
    return { name: personDisplayName(p.fn, p.ln, p.dn), pid: p.id }
  }

  for (const mk of ['mid', 'we']) {
    const meeting = week[mk]
    if (!meeting) continue
    // Zwei Mengen statt einer, weil die App zwei verschiedene Konflikte kennt
    // (siehe `waehle`): Wer einen **Hilfsdienst** hat, bekommt keinen
    // Programmpunkt mehr und keinen zweiten Dienst; ein zweiter Programmpunkt
    // ist dagegen erlaubt.
    const imProgramm = new Set()
    const imDienst = new Set()

    for (const sec of meeting.sections ?? []) {
      for (const item of sec.items ?? []) {
        if (!Array.isArray(item.names)) continue // Lied-Zeile: kein Platz
        item.names.forEach((slot, i) => {
          if (slot.name) {
            if (slot.pid) imProgramm.add(slot.pid)
            return
          }
          if (EXTERNE_ROLLE.test(slot.rolle ?? '')) {
            const g = TEST_GASTREDNER[(stand.gast = (stand.gast ?? 0) + 1) % TEST_GASTREDNER.length]
            slot.name = g.name
            slot.rolle = `${slot.rolle} · ${g.herkunft}`
            gesetzt++
            return
          }
          const fuehrend = slot.rolle === 'Gesprächspartner' ? item.names[i - 1] : null
          const p = waehle(personen, slot, imDienst, stand.zaehler, fuehrend)
          if (!p) return
          Object.assign(slot, nimm(p, imProgramm))
        })
      }
    }

    // Gruppen-Rotation zuerst: Sie kostet keine Person (Reinigung trägt den
    // Gruppennamen, nicht jemanden aus der Liste).
    for (const d of dienste) {
      const arr = (meeting.helpers[d.key] = meeting.helpers[d.key] ?? [])
      if (!d.groups) continue
      for (let i = 0; i < d.count; i++) {
        if (arr[i]?.name) continue
        arr[i] = { name: gruppen[stand.rotation++ % gruppen.length].name }
        gesetzt++
      }
    }

    /*
      Personen-Dienste: **immer der knappste offene Platz zuerst.** Der Reihe
      nach zu füllen ist die naheliegende, aber falsche Ordnung — der
      Rundgangsordner steht hinten und hat die wenigsten Freigegebenen; beim
      ersten Lauf an einer echten Woche blieb er leer, weil seine vier
      Kandidaten längst im Programm und in den vorderen Diensten standen.
      Gesucht wird deshalb vor jedem Platz neu, wo die Auswahl am kleinsten ist.
    */
    const personendienste = dienste.filter((d) => !d.groups)
    const versucht = new Set()
    for (;;) {
      const gesperrt = new Set([...imProgramm, ...imDienst])
      let knappster = null
      for (const d of personendienste) {
        const arr = meeting.helpers[d.key]
        for (let i = 0; i < d.count; i++) {
          if (arr[i]?.name || versucht.has(`${d.key}|${i}`)) continue
          const frei = personen.filter((p) => !gesperrt.has(p.id) && p.priv?.[`svc:${d.key}`]).length
          if (!knappster || frei < knappster.frei) knappster = { d, pos: i, frei }
          break // je Dienst genügt der erste offene Platz
        }
      }
      if (!knappster) break
      const { d, pos } = knappster
      versucht.add(`${d.key}|${pos}`) // auch ein erfolgloser Platz ist erledigt
      const p = waehle(personen, { bereichsKey: `svc:${d.key}` }, gesperrt, stand.zaehler)
      meeting.helpers[d.key][pos] = p ? nimm(p, imDienst) : { name: '' }
    }
  }
  return gesetzt
}

/* ===================== Ausführung ========================================= */

function zugang() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const fehlt = []
  if (!url) fehlt.push('SUPABASE_URL')
  if (!key) fehlt.push('SUPABASE_SERVICE_ROLE_KEY')
  if (fehlt.length) {
    console.error(`Fehlt: ${fehlt.join(', ')}\n\nAufruf siehe Kopf dieser Datei.`)
    process.exit(2)
  }
  const kopf = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

  /** PostgREST. `body` weglassen = GET. */
  const rest = async (pfad, method = 'GET', body, prefer = 'return=representation') => {
    const res = await fetch(`${url}/rest/v1/${pfad}`, {
      method,
      headers: { ...kopf, Prefer: prefer },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${method} ${pfad} ${res.status}: ${await res.text()}`)
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }

  /** Auth-Admin-API (Konten anlegen/löschen). */
  const auth = async (pfad, method = 'POST', body) => {
    const res = await fetch(`${url}/auth/v1/admin/${pfad}`, {
      method,
      headers: kopf,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${method} auth/${pfad} ${res.status}: ${await res.text()}`)
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }

  /** Edge Function. Der Service-Role-Key ist ein gültiges JWT — `verify_jwt` lässt ihn durch. */
  const fn = async (name, body) => {
    const res = await fetch(`${url}/functions/v1/${name}`, { method: 'POST', headers: kopf, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`POST ${name} ${res.status}: ${await res.text()}`)
    return res.json()
  }

  return { rest, auth, fn }
}

/** Alle Auth-Konten (das Projekt hat eine Handvoll — eine Seite genügt). */
async function alleKonten(auth) {
  const antwort = await auth('users?page=1&per_page=1000', 'GET')
  return antwort?.users ?? []
}

/**
 * Konto anlegen — oder das vorhandene übernehmen und ihm ein neues Kennwort
 * geben. Ohne diesen zweiten Weg wäre eine einmal angelegte Adresse für alle
 * weiteren Läufe gesperrt: Der Abbruch hinterlässt ein Konto ohne
 * `members`-Zeile, das weder anmeldbar noch (über `members`) auffindbar ist.
 */
export async function kontoAnlegenOderUebernehmen(auth, mail, pw) {
  try {
    return await auth('users', 'POST', { email: mail, password: pw, email_confirm: true })
  } catch (err) {
    const text = String(err instanceof Error ? err.message : err)
    // GoTrue meldet die belegte Adresse je nach Fassung als 422 oder 400.
    if (!/\b(400|409|422)\b/.test(text)) throw err
    const treffer = (await alleKonten(auth)).find((u) => (u.email ?? '').toLowerCase() === mail.toLowerCase())
    if (!treffer) throw err
    await auth(`users/${treffer.id}`, 'PUT', { password: pw, email_confirm: true })
    return { ...treffer, uebernommen: true }
  }
}

/** Sieht der Wert aus wie eine UUID? Sonst ist er als Versammlungsname gemeint. */
export function istUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s))
}

/**
 * Den Testbestand wieder entfernen. Die Versammlung zu löschen genügt für alle
 * Tabellen (`on delete cascade`); die **Konten** hängen nicht daran und werden
 * einzeln gelöscht — sonst blieben Karteileichen in `auth.users` stehen.
 *
 * Gesucht werden sie auf **zwei** Wegen: über `members` (die verknüpften) und
 * über die Adressen (die verwaisten). Ein Lauf, der zwischen „Konto angelegt"
 * und „members-Zeile geschrieben" abbricht, hinterlässt genau die zweite Sorte;
 * über `members` allein bliebe sie unauffindbar stehen.
 *
 * `--wirklich` ist Absicht: Eine vertippte Id löscht sonst die echte
 * Versammlung, und da hilft kein Zurück.
 */
async function entfernen(arg) {
  const wert = arg.entfernen
  if (wert === true) {
    console.error('--entfernen braucht die Id oder den Namen der Versammlung.')
    process.exit(2)
  }
  const { rest, auth } = zugang()
  const treffer = istUuid(wert)
    ? await rest(`congregations?id=eq.${wert}&select=id,name`)
    : await rest(`congregations?name=eq.${encodeURIComponent(wert)}&select=id,name`)
  if (treffer.length === 0) {
    console.error(`Keine Versammlung zu „${wert}".`)
    process.exit(1)
  }
  if (treffer.length > 1) {
    console.error(`Mehrere Versammlungen heißen „${wert}" — bitte die Id angeben:`)
    for (const c of treffer) console.error(`  ${c.id}`)
    process.exit(1)
  }
  const cong = treffer[0]
  const id = cong.id

  const members = await rest(`members?congregation_id=eq.${id}&select=user_id,email`)
  const personen = await rest(`persons?congregation_id=eq.${id}&select=id`)
  const wochen = await rest(`weeks?congregation_id=eq.${id}&select=start`)

  // Verwaiste Konten: die beiden Adressen dieses Skripts ohne `members`-Zeile.
  const adressen = [arg['mail-planer'] || 'planer@probe.invalid', arg['mail-mitglied'] || 'mitglied@probe.invalid']
  const verknuepft = new Set(members.map((m) => m.user_id))
  const verwaist = (await alleKonten(auth)).filter(
    (u) => adressen.includes((u.email ?? '').toLowerCase()) && !verknuepft.has(u.id),
  )

  console.log(`Löschen:   Versammlung „${cong.name}" (${id})`)
  console.log(`Dabei:     ${personen.length} Personen, ${wochen.length} Wochen und alles daran Hängende`)
  console.log(`Konten:    ${members.length}${members.length ? ` — ${members.map((m) => m.email).join(', ')}` : ''}`)
  if (verwaist.length) console.log(`Verwaist:  ${verwaist.map((u) => u.email).join(', ')} (ohne members-Zeile)`)

  if (!arg.wirklich) {
    console.log('\nNichts gelöscht. Zum Ausführen dieselbe Zeile mit --wirklich.')
    return
  }
  for (const m of members) await auth(`users/${m.user_id}`, 'DELETE')
  for (const u of verwaist) await auth(`users/${u.id}`, 'DELETE')
  await rest(`congregations?id=eq.${id}`, 'DELETE', undefined, 'return=minimal')
  console.log('\nEntfernt.')
}

async function main() {
  const arg = argumente(process.argv.slice(2))
  if (arg.entfernen) return entfernen(arg)

  const name = arg.name || 'Probeversammlung Talheim'
  const wochenAnzahl = Number(arg.wochen ?? 2)
  const mailPlaner = arg['mail-planer'] || 'planer@probe.invalid'
  const mailMitglied = arg['mail-mitglied'] || 'mitglied@probe.invalid'

  // Zugang zuerst, auch für den Trockenlauf: Ein fehlender Schlüssel soll
  // auffallen, bevor man die Übersicht liest und „passt" denkt.
  const { rest, auth, fn } = zugang()

  console.log(`Versammlung:  ${name}`)
  console.log(`Personen:     ${TEST_PERSONEN.length} (erfunden), ${TEST_GRUPPEN.length} Gruppen`)
  console.log(`Dienste:      ${STANDARD_DIENSTE.map((d) => d.name).join(', ')}`)
  console.log(`Treffpunkte:  ${TEST_FS_REGELN.length} Regeln (Wochen baut die App daraus)`)
  console.log(`Wochen:       ${wochenAnzahl} — echt von jw.org über import-week`)
  console.log(`Konten:       ${mailPlaner} (Planer), ${mailMitglied} (Mitglied)`)

  if (arg.trocken) {
    console.log('\n--trocken: nichts geschrieben.')
    return
  }

  // 1) Versammlung, Gruppen, Personen. Reihenfolge zählt: Gruppen brauchen die
  //    Versammlung, Personen die Gruppe (`grp`), und die Gruppe ihren Aufseher
  //    erst danach — der Kreis wird per PATCH geschlossen.
  const [cong] = await rest('congregations', 'POST', {
    name,
    hall: 'Talheimer Str. 4',
    meeting_times: 'Mi 19:00 · So 10:00',
    settings: { congLang: 'Deutsch' },
  })
  // Ab hier steht etwas in der Datenbank. Jeder Schritt meldet sich, damit ein
  // Abbruch sagt, wie weit er kam — und was `--entfernen` wegzuräumen hat.
  console.log(`\n  Versammlung ${cong.id}`)
  const gruppen = await rest(
    'groups',
    'POST',
    TEST_GRUPPEN.map((n, i) => ({ congregation_id: cong.id, name: n, position: i })),
  )

  const haushalte = new Map()
  const personen = await rest(
    'persons',
    'POST',
    TEST_PERSONEN.map((p) => {
      if (p.haus && !haushalte.has(p.haus)) haushalte.set(p.haus, randomUUID())
      return {
        congregation_id: cong.id,
        fn: p.fn,
        ln: p.ln,
        role: p.rolle,
        female: Boolean(p.w),
        priv: bereiche(p),
        grp: gruppen[p.g].id,
        fam: p.haus ? haushalte.get(p.haus) : null,
        // Kein `mail`: eine erfundene Person darf nie anschreibbar sein.
      }
    }),
  )
  // Über den Namen zurückfinden, nicht über die Reihenfolge der Antwort: dass
  // PostgREST in Einfügereihenfolge zurückgibt, ist nirgends zugesichert — und
  // ein verschobener Index verteilte hier stillschweigend fremde Bereiche.
  const nachName = new Map(personen.map((p) => [`${p.fn} ${p.ln}`, p]))
  const finde = (fn, ln) => {
    const p = nachName.get(`${fn} ${ln}`)
    if (!p) throw new Error(`Person ${fn} ${ln} kam nicht zurück — Anlegen abgebrochen.`)
    return p
  }

  for (const p of TEST_PERSONEN) {
    if (!p.av && !p.ag) continue
    const feld = p.av ? 'overseer_id' : 'assistant_id'
    await rest(`groups?id=eq.${gruppen[p.g].id}`, 'PATCH', { [feld]: finde(p.fn, p.ln).id }, 'return=minimal')
  }

  console.log(`  ${personen.length} Personen, ${gruppen.length} Gruppen`)

  // 2) Dienste und Treffpunkt-Regeln.
  await rest(
    'services',
    'POST',
    STANDARD_DIENSTE.map((d, i) => ({
      congregation_id: cong.id,
      key: d.key,
      name: d.name,
      count: d.count,
      groups: d.groups,
      position: i,
    })),
    'return=minimal',
  )

  // 3) Wochen holen und besetzen. `after` hangelt sich weiter: erst die
  //    kommende, dann die danach — dieselbe Kette wie „Nächste Woche
  //    importieren" in der App.
  const stand = { zaehler: new Map(), rotation: 0 }
  const wochen = []
  let after
  for (let i = 0; i < wochenAnzahl; i++) {
    const antwort = await fn('import-week', { after, lang: 'de' })
    const week = antwort?.week
    if (!week) {
      console.error(`Woche ${i + 1} kam nicht: ${antwort?.error ?? 'unbekannt'}`)
      break
    }
    const gesetzt = fuelleZuteilungen(week, personen, STANDARD_DIENSTE, gruppen, stand)
    await rest('weeks', 'POST', { congregation_id: cong.id, start: week.start, data: week }, 'return=minimal')
    wochen.push({ start: week.start, range: week.range, gesetzt })
    console.log(`  Woche ${week.start} (${week.range}) — ${gesetzt} Plätze besetzt`)
    after = week.start
  }

  if (wochen.length) {
    await rest(
      'fs_rules',
      'POST',
      {
        congregation_id: cong.id,
        base: wochen[0].start,
        rules: TEST_FS_REGELN.map((r) => ({ id: randomUUID(), ...r })),
      },
      'return=minimal',
    )
  }

  // 4) Konten. `email_confirm` setzt die Adresse als bestätigt — dadurch
  //    verschickt Supabase keine Bestätigungsmail an eine Adresse, die es
  //    nicht gibt.
  //
  //    **Ein vorhandenes Konto wird übernommen, nicht abgelehnt.** Bricht ein
  //    Lauf zwischen „Konto angelegt" und „members-Zeile geschrieben" ab,
  //    bliebe die Adresse sonst für immer belegt und jeder weitere Versuch
  //    scheiterte an derselben Stelle. Genau das ist beim ersten scharfen Lauf
  //    passiert.
  const konten = []
  for (const [mail, planer, person] of [
    [mailPlaner, true, finde('Martin', 'Aichinger')],
    [mailMitglied, false, finde('Elena', 'Aichinger')],
  ]) {
    const pw = passwort()
    const user = await kontoAnlegenOderUebernehmen(auth, mail, pw)
    await rest(
      'members',
      'POST',
      { user_id: user.id, congregation_id: cong.id, person_id: person.id, planner: planer, email: mail },
      'return=minimal',
    )
    if (planer) await rest(`persons?id=eq.${person.id}`, 'PATCH', { planner: true }, 'return=minimal')
    konten.push({ mail, pw, person: personDisplayName(person.fn, person.ln, person.dn), planer })
    console.log(`  Konto ${mail}${user.uebernommen ? ' (vorhandenes übernommen, Kennwort neu gesetzt)' : ''}`)
  }

  console.log(`\nAngelegt. Versammlung ${cong.id}`)
  for (const w of wochen) console.log(`  Woche ${w.start} (${w.range}) — ${w.gesetzt} Plätze besetzt`)
  console.log('\nKonten — die Kennwörter stehen nur hier, sie sind nirgends abrufbar:')
  for (const k of konten) console.log(`  ${k.mail}  ${k.pw}   ${k.planer ? 'Planer' : 'Mitglied'} · ${k.person}`)
  console.log(`\nWieder weg mit:\n  node scripts/testversammlung-anlegen.mjs --entfernen ${cong.id} --wirklich`)
}

// Nur ausführen, wenn direkt aufgerufen. Genau verglichen statt über den
// Dateinamen: `testversammlung-anlegen.mjs` endet auf `versammlung-anlegen.mjs`
// — die lose Prüfung der Nachbarskripte würde hier danebengreifen.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  })
}
