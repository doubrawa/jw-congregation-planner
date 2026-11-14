#!/usr/bin/env node
/**
 * **Eine Versammlung auf den Stand einer Sicherung zurücksetzen** — die Konten
 * bleiben.
 *
 * Wofür (Betreiber, 8.11.2026): Die Tester der Beta probieren in der echten
 * Versammlung aus. Vorher legt der Betreiber eine Sicherung an
 * (`sicherung.mjs --ziel …\vor-der-beta`); zum Livegang geht die Versammlung
 * auf diesen Stand zurück, danach kommen nur die Monate ab dem Livegang aus
 * NWS. Was ausprobiert wurde — Zusagen, Absagen, Tausche, Abwesenheiten,
 * Glocken, geänderte Wochen —, ist danach fort; die Konten der Tester nicht.
 *
 * ---------------------------------------------- Warum ein eigenes Skript ----
 *
 *  - `zurueckspielen.mjs` schreibt nur in eine **leere** Datenbank: Alle
 *    Versammlungen und Konten müssten vorher weg, die Tester bräuchten neue
 *    Links.
 *  - `versammlung-zuruecksetzen.mjs` baut eine Versammlung aus NWS neu auf und
 *    nimmt dabei mit, was nur in der App steht.
 *
 * ------------------------------------------------------------ Was bleibt ----
 *
 * `BLEIBEN` unten, je mit Grund. Alle anderen Tabellen aus `schema.sql` gehen
 * auf die Sicherung zurück — abgeleitet, nicht aufgezählt. Eine neue Tabelle,
 * die am Konto hängt statt an der Planung, gehört deshalb in `BLEIBEN`; den
 * Stolperdraht dafür hält `versammlung-auf-sicherung.test.ts`.
 *
 * Eine Zeile, auf die eine bleibende zeigt, wird auch dann nicht gelöscht,
 * wenn die Sicherung sie nicht kennt (`geschuetzte`) — eine Person mit Konto
 * oder Anmelde-Link: Sonst stünde das Konto ohne Person da (`set null`), und
 * der Link ginge mit (`cascade`). Gezählt, nicht genannt.
 *
 * Trägt so eine Person denselben Namen wie eine aus der Sicherung, hält das
 * Skript **vor dem ersten Schreiben** an (`namensKonflikte`): Beide zugleich
 * nimmt `persons_name_eindeutig` nicht an, und ein Lauf, der erst beim
 * Einfügen scheitert, hinterließe eine halb zurückgesetzte Versammlung. Nur
 * hier nennt es Namen — der Betreiber muss die Person in der App finden.
 *
 * Von den Konten ändert es genau eines: eine **verlorene Verknüpfung** mit der
 * Person (`verknuepfungen`). Löscht jemand in der Beta eine Person mit Konto,
 * bleibt das Konto ohne Person; kommt die Person aus der Sicherung zurück,
 * bekommt das Konto sie wieder — Rechte bleiben, wie sie sind.
 *
 * ----------------------------------------------------------- Der Ablauf -----
 *
 * 1. Löschen, was die Sicherung nicht kennt — von hinten nach vorn, Kinder vor
 *    Eltern.
 * 2. Je Tabelle in der Reihenfolge von `schema.sql`, **frisch gelesen**: was
 *    fehlt, einfügen; was abweicht, ändern; was die Datenbank eben selbst
 *    angelegt hat und die Sicherung nicht kennt, löschen. Frisch, weil sie
 *    mitschreibt: Kaskaden und `set null` beim Löschen, `absage_vermerken`
 *    beim Einfügen einer Absage, `ersatzgesuch_beenden` beim Ändern einer
 *    Zusage. Der letzte räumt „Ersatz gesucht" zu einem Platz ab, an dem
 *    keine Absage mehr steht — auch ein Gesuch, das die Sicherung verwaist
 *    mitbringt und das `notifications` (in `schema.sql` vor `confirmations`)
 *    eben zurückgeschrieben hat. Die Gegenprobe nennt es dann, ein zweiter
 *    Lauf schreibt es zurück; fehlen darf es ebenso, es führte ins Leere.
 * 3. Die Verweise nachtragen, deren Ziel erst später kommt — der Ring
 *    `persons.grp ↔ groups` (`aufgeschobene` aus `zurueckspielen.mjs`).
 * 4. Konten wieder mit ihrer Person verknüpfen (siehe oben).
 * 5. Gegenprobe: jede Tabelle der Versammlung gegen die Sicherung.
 *
 * Ein zweiter Lauf ändert nichts mehr; bricht einer mittendrin ab, holt der
 * nächste den Rest nach.
 *
 * **Konten, die es seit der Sicherung nicht mehr gibt:** Ihre Zeilen kommen
 * so zurück, wie die Datenbank es beim Löschen des Kontos getan hätte —
 * `on delete cascade` lässt sie fort, `on delete set null` leert den Verweis.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/versammlung-auf-sicherung.mjs <sicherung.json> --cong <id> [--wirklich]
 *
 * **Ohne `--wirklich` rechnet es nur** und schreibt nichts (`--trocken` geht
 * ebenso): Ein Lauf ersetzt die ganze Planung einer Versammlung, eine falsche
 * Kennung beim Üben träfe die echte. Der Trockenlauf nennt die Versammlung
 * beim Namen und rechnet ohne die Kaskaden der Datenbank — seine Zahlen sind
 * die Untergrenze. **Das erste Mal an der Testversammlung.**
 *
 * **Während des Laufs benutzt niemand die App**: Was ein Gerät zwischen den
 * Schritten schreibt, landet halb oder gar nicht (die Gegenprobe meldet es,
 * ein zweiter Lauf räumt es ab). Zum Livegang also, bevor die neuen Links
 * hinausgehen.
 *
 * Das Projekt kommt aus `.env.local` wie bei allen Skripten. Ausgegeben werden
 * Zahlen, keine Namen (bis auf `namensKonflikte`).
 */

import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { alleZeilen, alsSkript, argumente, personDisplayName, restKlient, zugangsdaten } from './gemeinsam.mjs'
import { AUSGENOMMEN, konten, REPO, schemaFingerabdruck, tabellenAusSchema } from './sicherung.mjs'
import { aufHeutigeSpalten, aufgeschobene, fremdschluessel, pkFilter, spaltenAbgleich, zeileTeilen } from './zurueckspielen.mjs'

/**
 * Tabellen, die so bleiben, wie sie sind — je mit Grund. Sie gehören zum
 * Konto oder zum Betrieb, nicht zur Planung.
 */
export const BLEIBEN = {
  members:
    'die Konten der Versammlung samt Rechten und Verknüpfung mit der Person. Eine gelöschte Zeile nähme ' +
    'das Konto mit (`members_konto_loeschen`), die Tester bräuchten neue Links; die Rechte stellt der ' +
    'Betreiber zum Livegang ohnehin neu ein. Nur eine verlorene Verknüpfung kommt zurück (`verknuepfungen`).',
  push_subscriptions: 'die Geräte, die Mitteilungen bekommen — sie hängen am Konto; gelöscht müsste jeder Push neu einschalten.',
  anmelde_links: 'Link und Zettel-Code jeder Person — mit ihnen kommt ein Gerät wieder hinein; zurückgesetzt gälten die der Tester nicht mehr.',
  anmelde_einmalcodes: 'Einmal-Codes fürs nächste Gerät — sie hängen am Konto und verfallen von selbst.',
  geraete_fehler: 'Fehlermeldungen der Geräte — Befunde aus dem Betrieb, keine Planung; gerade die aus der Beta braucht die Fehlersuche.',
}

/**
 * Spalten, die die Datenbank beim Schreiben selbst setzt — `updated_at` in
 * Wochen, Treffpunkt-Wochen und Anwesenheit (`touch_updated_at`,
 * `anwesenheit_vermerken`). Ein Unterschied dort ist keiner im Inhalt; wer
 * danach geändert wird, bekommt ohnehin einen neuen Stand.
 */
export const VON_DER_DATENBANK = ['updated_at']

/** So viele Zeilen je Aufruf — ein `in.(…)` aus Kennungen bleibt damit unter der Längengrenze einer Adresse. */
const BUENDEL = 100

/** Die Tabellen, die zurückgehen — in der Reihenfolge von schema.sql. */
export function zuruecksetzbare(tabellen) {
  return tabellen.filter((t) => !(t.name in BLEIBEN) && !(t.name in AUSGENOMMEN))
}

/** Gehört die Zeile zur Versammlung? `congregations` über die eigene Kennung. */
export const zurVersammlung = (t, cong) => (z) => (t.name === 'congregations' ? z.id === cong : z.congregation_id === cong)

/** Der Primärschlüssel einer Zeile als Text — zum Wiederfinden. */
export const schluessel = (zeile, pk) => JSON.stringify(pk.map((c) => zeile[c] ?? null))

/** Gleich im Inhalt — Objekte (jsonb) unabhängig von der Reihenfolge ihrer Schlüssel, sonst genau. */
export const gleich = isDeepStrictEqual

/**
 * Was an einer Zeile abweicht: die Spalten der Sicherung, deren Wert in der
 * Datenbank ein anderer ist — ohne `ohne` und ohne `VON_DER_DATENBANK`.
 * Spalten, die die Sicherung nicht trägt (seither angelegt), bleiben, wie sie
 * sind — bis auf die, die mit gesicherten eine Einheit bilden: Die gibt
 * `aufHeutigeSpalten` der Sicherung vorher mit (`SEITHER`, die Wechsel der
 * Zusammenkunftszeit).
 */
export function abweichend(soll, ist, ohne = []) {
  const out = {}
  for (const [k, v] of Object.entries(soll)) {
    if (ohne.includes(k) || VON_DER_DATENBANK.includes(k)) continue
    if (!gleich(v, ist[k] ?? null)) out[k] = v
  }
  return out
}

/**
 * Zeilen der Sicherung, deren Konto es nicht mehr gibt — so, wie die Datenbank
 * es beim Löschen des Kontos getan hätte: `set null` leert den Verweis,
 * `cascade` lässt die Zeile fort. Jede andere Regel hätte das Löschen
 * verhindert; auch dann bleibt die Zeile fort, statt am Einfügen zu scheitern.
 */
export function ohneFehlendeKonten(zeilen, kontoVerweise, kontenDa) {
  const out = []
  let fort = 0
  for (const z of zeilen) {
    let neu = z
    let weg = false
    for (const fk of kontoVerweise) {
      const [spalte] = fk.spalten
      if (neu[spalte] == null || kontenDa.has(neu[spalte])) continue
      if (fk.beimLoeschen === 'set null') neu = { ...neu, [spalte]: null }
      else weg = true
    }
    if (weg) fort++
    else out.push(neu)
  }
  return { zeilen: out, fort }
}

/**
 * **Was nicht gelöscht werden darf**, obwohl die Sicherung es nicht kennt: Zeilen,
 * auf die eine Zeile aus `BLEIBEN` zeigt — eine Person mit Konto oder
 * Anmelde-Link. Abgeleitet aus den Fremdschlüsseln, nicht aufgezählt.
 *
 * @param bleibende Tabelle aus `BLEIBEN` → ihre Zeilen in der Versammlung
 * @returns {Map<string, Set<string>>} Tabelle → Schlüssel (`schluessel`)
 */
export function geschuetzte(fks, tabellenNachName, bleibende) {
  const out = new Map()
  for (const fk of fks) {
    if (fk.schema !== 'public' || !(fk.tabelle in BLEIBEN) || fk.ziel in BLEIBEN) continue
    const ziel = tabellenNachName.get(fk.ziel)
    if (!ziel) continue
    if (!ziel.pk.every((c) => fk.zielSpalten.includes(c))) {
      throw new Error(
        `${fk.tabelle}.(${fk.spalten.join(', ')}) zeigt auf ${fk.ziel}, aber nicht auf dessen Primärschlüssel — ` +
          'welche Zeile dort zu schützen ist, lässt sich so nicht sagen.',
      )
    }
    const set = out.get(fk.ziel) ?? new Set()
    for (const z of bleibende[fk.tabelle] ?? []) {
      if (fk.spalten.some((c) => z[c] == null)) continue
      set.add(schluessel(Object.fromEntries(fk.zielSpalten.map((c, i) => [c, z[fk.spalten[i]]])), ziel.pk))
    }
    out.set(fk.ziel, set)
  }
  return out
}

/** Der Name einer Person, wie `persons_name_eindeutig` ihn vergleicht: Vor- und Nachname, Leerraum zusammengezogen, klein. */
export function namensSchluessel(p) {
  return `${p.fn ?? ''} ${p.ln ?? ''}`.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * **Personen, die nicht zugleich gehen**: eine, die bleibt, obwohl die
 * Sicherung sie nicht kennt (`geschuetzte`), mit dem Namen einer Person aus der
 * Sicherung. `persons_name_eindeutig` nähme beide nicht an — geprüft wird vor
 * dem ersten Schreiben, nicht erst beim Einfügen.
 *
 * @returns {{ bleibt: object, sicherung: object }[]}
 */
export function namensKonflikte(bleibendePersonen, sollPersonen) {
  const nachName = new Map()
  for (const p of sollPersonen) if (namensSchluessel(p)) nachName.set(namensSchluessel(p), p)
  const out = []
  for (const p of bleibendePersonen) {
    const gegen = nachName.get(namensSchluessel(p))
    if (gegen && gegen.id !== p.id) out.push({ bleibt: p, sicherung: gegen })
  }
  return out
}

/**
 * **Verlorene Verknüpfungen** zwischen Konto und Person: ein Konto, das heute
 * ohne Person dasteht, in der Sicherung aber eine hatte, die nach dem
 * Zurücksetzen wieder da ist. So kommt es durch eine in der Beta gelöschte
 * Person — die App setzt `members.person_id` dann leer. Nicht, wenn ein
 * anderes Konto die Person inzwischen trägt.
 *
 * @returns {Map<string, string>} Konto → Person
 */
export function verknuepfungen(mitglieder, mitgliederVorher, personenNachher) {
  const vorher = new Map(mitgliederVorher.map((m) => [m.user_id, m.person_id]))
  const vergeben = new Set(mitglieder.map((m) => m.person_id).filter(Boolean))
  const out = new Map()
  for (const m of mitglieder) {
    const p = vorher.get(m.user_id)
    if (m.person_id || !p || !personenNachher.has(p) || vergeben.has(p)) continue
    out.set(m.user_id, p)
    vergeben.add(p)
  }
  return out
}

/**
 * **Die Versammlung `cong` auf die Sicherung zurücksetzen** — über `zugriff`,
 * damit derselbe Ablauf im Betrieb über PostgREST (`restZugriff`) und in der
 * Probe gegen PGlite läuft.
 *
 * `zugriff`: `lesen(t, cong)` → Zeilen der Versammlung; `loeschen(t, cong,
 * zeilen)`; `einfuegen(t, zeilen)`; `aendern(t, cong, zeile, werte)`;
 * `konten()` → Kennungen der Konten, die es gibt.
 *
 * @typedef {{ geloescht: number, eingefuegt: number, geaendert: number, bleibt: number, ohneKonto: number, nachgetragen: number }} Zaehler
 * @typedef {{ tabelle: string, fehlt: number, anders: number, zuviel: number }} Abweichung
 * @returns {Promise<{ bericht: Map<string, Zaehler>, abweichungen: Abweichung[], mitglieder: { gleich: number, dazu: number, anders: number, fort: number }, verknuepft: number, hinweise: string[] }>}
 */
export async function zuruecksetzen({ zugriff, schema, sicherung, cong, trocken = false }) {
  const alle = tabellenAusSchema(schema)
  const nachName = new Map(alle.map((t) => [t.name, t]))
  const fks = fremdschluessel(schema)
  const tabellen = zuruecksetzbare(alle)

  const fehlen = tabellen.filter((t) => !Array.isArray(sicherung.tabellen?.[t.name])).map((t) => t.name)
  if (fehlen.length) {
    throw new Error(`Die Sicherung kennt ${fehlen.join(', ')} nicht — sie ist älter als diese Tabellen. Zurückgesetzt hieße dort: geleert.`)
  }
  const warten = aufgeschobene(tabellen, fks)
  const { auslassen, hinweise, gefuellt } = spaltenAbgleich(tabellen, sicherung)
  if (gefuellt.length) {
    throw new Error(`Spalten, die schema.sql nicht kennt, tragen in der Sicherung etwas: ${gefuellt.join(', ')}. Nichts geschrieben.`)
  }
  const congregations = nachName.get('congregations')
  if (!sicherung.tabellen.congregations.some(zurVersammlung(congregations, cong))) {
    throw new Error(`Die Versammlung ${cong} steht nicht in der Sicherung.`)
  }
  if (!(await zugriff.lesen(congregations, cong)).length) {
    throw new Error(`Die Versammlung ${cong} gibt es in der Datenbank nicht — angelegt wird hier nichts, nur zurückgesetzt.`)
  }

  // Das Soll je Tabelle: die Zeilen der Versammlung aus der Sicherung, ohne die
  // Konten, die es nicht mehr gibt.
  const kontenDa = await zugriff.konten()
  const bericht = new Map(tabellen.map((t) => [t.name, { geloescht: 0, eingefuegt: 0, geaendert: 0, bleibt: 0, ohneKonto: 0, nachgetragen: 0 }]))
  const soll = new Map()
  for (const t of tabellen) {
    const kontoVerweise = fks.filter((f) => f.tabelle === t.name && f.schema === 'auth' && f.ziel === 'users')
    const { zeilen, fort } = ohneFehlendeKonten(sicherung.tabellen[t.name].filter(zurVersammlung(t, cong)), kontoVerweise, kontenDa)
    bericht.get(t.name).ohneKonto = fort
    soll.set(t.name, new Map(zeilen.map((z) => [schluessel(z, t.pk), z])))
  }

  const bleibende = {}
  for (const name of Object.keys(BLEIBEN)) if (nachName.has(name)) bleibende[name] = await zugriff.lesen(nachName.get(name), cong)
  const schutz = geschuetzte(fks, nachName, bleibende)
  const istZuviel = (t, z) => !soll.get(t.name).has(schluessel(z, t.pk)) && !schutz.get(t.name)?.has(schluessel(z, t.pk))

  // Vor dem ersten Schreiben: Was sich nicht auflösen lässt, hält hier an.
  const personen = nachName.get('persons')
  const sollPersonen = soll.has('persons') ? [...soll.get('persons').values()] : []
  if (personen && soll.has('persons')) {
    const bleibendePersonen = (await zugriff.lesen(personen, cong)).filter(
      (p) => !soll.get('persons').has(schluessel(p, personen.pk)) && schutz.get('persons')?.has(schluessel(p, personen.pk)),
    )
    const konflikte = namensKonflikte(bleibendePersonen, sollPersonen)
    if (konflikte.length) {
      throw new Error(
        `${konflikte.length} Person(en) mit Konto oder Anmelde-Link tragen den Namen einer Person aus der Sicherung — ` +
          'beide zugleich nimmt die Datenbank nicht an (persons_name_eindeutig):\n' +
          konflikte.map((k) => `  „${personDisplayName(k.bleibt.fn, k.bleibt.ln)}" (${k.bleibt.id} bleibt, ${k.sicherung.id} aus der Sicherung)`).join('\n') +
          '\nIn der App umbenennen oder Konto und Link der Person lösen, dann neu. Nichts geschrieben.',
      )
    }
  }

  // 1. Löschen, was die Sicherung nicht kennt — Kinder vor Eltern.
  for (const t of [...tabellen].reverse()) {
    if (t === congregations) continue
    const ist = await zugriff.lesen(t, cong)
    const fremd = ist.filter((z) => !soll.get(t.name).has(schluessel(z, t.pk)))
    const weg = fremd.filter((z) => istZuviel(t, z))
    bericht.get(t.name).bleibt = fremd.length - weg.length
    bericht.get(t.name).geloescht += weg.length
    if (!trocken && weg.length) await zugriff.loeschen(t, cong, weg)
  }

  // 2. Je Tabelle von vorn, frisch gelesen: einfügen, ändern — und löschen, was
  //    die Datenbank eben selbst angelegt hat.
  for (const t of tabellen) {
    const ist = await zugriff.lesen(t, cong)
    const istNach = new Map(ist.map((z) => [schluessel(z, t.pk), z]))
    const b = bericht.get(t.name)
    if (!trocken && t !== congregations) {
      const nachgekommen = ist.filter((z) => istZuviel(t, z))
      if (nachgekommen.length) {
        await zugriff.loeschen(t, cong, nachgekommen)
        b.geloescht += nachgekommen.length
      }
    }
    const ohne = [...(auslassen[t.name] ?? []), ...(warten[t.name] ?? [])]
    const neu = []
    const aenderungen = []
    for (const [k, z] of soll.get(t.name)) {
      const da = istNach.get(k)
      if (!da) neu.push(z)
      else {
        const werte = abweichend(z, da, ohne)
        if (Object.keys(werte).length) aenderungen.push({ zeile: z, werte })
      }
    }
    b.eingefuegt += neu.length
    b.geaendert += aenderungen.length
    if (trocken) continue
    if (neu.length) await zugriff.einfuegen(t, neu.map((z) => zeileTeilen(z, warten[t.name] ?? [], auslassen[t.name]).jetzt))
    for (const a of aenderungen) await zugriff.aendern(t, cong, a.zeile, a.werte)
  }

  // 3. Verweise, deren Ziel erst später kam.
  for (const t of tabellen) {
    const spalten = warten[t.name] ?? []
    if (!spalten.length) continue
    const istNach = new Map((await zugriff.lesen(t, cong)).map((z) => [schluessel(z, t.pk), z]))
    for (const [k, z] of soll.get(t.name)) {
      const werte = {}
      for (const c of spalten) if (c in z && !gleich(z[c], istNach.get(k)?.[c] ?? null)) werte[c] = z[c]
      if (!Object.keys(werte).length) continue
      bericht.get(t.name).nachgetragen++
      if (!trocken) await zugriff.aendern(t, cong, z, werte)
    }
  }

  // 4. Konten, die ihre Person verloren haben, bekommen sie wieder.
  const members = nachName.get('members')
  const mitgliederVorher = members ? (sicherung.tabellen.members ?? []).filter(zurVersammlung(members, cong)) : []
  const wieder = members ? verknuepfungen(bleibende.members ?? [], mitgliederVorher, new Set(sollPersonen.map((p) => p.id))) : new Map()
  if (!trocken) for (const [konto, person] of wieder) await zugriff.aendern(members, cong, { user_id: konto }, { person_id: person })

  // Sonst bleiben die Konten — aber was an ihnen seit der Sicherung anders ist,
  // soll der Betreiber wissen (Rechte, Verknüpfung mit der Person).
  const mitglieder = { gleich: 0, dazu: 0, anders: 0, fort: 0 }
  if (members) {
    const vorher = new Map(mitgliederVorher.map((z) => [schluessel(z, members.pk), z]))
    for (const heute of bleibende.members ?? []) {
      const z = wieder.has(heute.user_id) ? { ...heute, person_id: wieder.get(heute.user_id) } : heute
      const v = vorher.get(schluessel(z, members.pk))
      if (!v) mitglieder.dazu++
      else if (Object.keys(abweichend(v, z)).length) mitglieder.anders++
      else mitglieder.gleich++
      vorher.delete(schluessel(z, members.pk))
    }
    mitglieder.fort = vorher.size
  }

  // 5. Gegenprobe — gezählt wird am Ende, nicht geglaubt.
  const abweichungen = []
  if (!trocken) {
    for (const t of tabellen) {
      const ist = await zugriff.lesen(t, cong)
      const istNach = new Map(ist.map((z) => [schluessel(z, t.pk), z]))
      let fehlt = 0
      let anders = 0
      for (const [k, z] of soll.get(t.name)) {
        const da = istNach.get(k)
        if (!da) fehlt++
        else if (Object.keys(abweichend(z, da, auslassen[t.name] ?? [])).length) anders++
      }
      const zuviel = ist.filter((z) => istZuviel(t, z)).length
      if (fehlt || anders || zuviel) abweichungen.push({ tabelle: t.name, fehlt, anders, zuviel })
    }
  }
  return { bericht, abweichungen, mitglieder, verknuepft: wieder.size, hinweise }
}

/* ===================== Über PostgREST ===================================== */

/** Der Filter auf genau eine Zeile: der Primärschlüssel (`pkFilter`), dazu die Versammlung. */
function zeilenFilter(t, cong, zeile) {
  const filter = pkFilter(zeile, t.pk)
  return t.name === 'congregations' || t.pk.includes('congregation_id') ? filter : `congregation_id=eq.${cong}&${filter}`
}

/** Zeilen nach ihren Spalten gebündelt — PostgREST nimmt beim Einfügen mehrerer Zeilen nur gleiche Schlüssel an. */
function nachSpalten(zeilen) {
  const gruppen = new Map()
  for (const z of zeilen) {
    const art = Object.keys(z).sort().join(',')
    gruppen.set(art, [...(gruppen.get(art) ?? []), z])
  }
  return [...gruppen.values()]
}

/** Der Zugriff im Betrieb: PostgREST mit dem Secret-Schlüssel (an jeder Richtlinie vorbei), die Konten über Auth. */
export function restZugriff(rest, kontenLesen) {
  const minimal = { Prefer: 'return=minimal' }
  return {
    lesen: (t, cong) =>
      alleZeilen(rest, `${t.name}?select=*&${t.name === 'congregations' ? 'id' : 'congregation_id'}=eq.${cong}&order=${t.pk.join(',')}`),
    async loeschen(t, cong, zeilen) {
      if (t.pk.length > 1) {
        for (const z of zeilen) await rest(`${t.name}?${zeilenFilter(t, cong, z)}`, { method: 'DELETE', headers: minimal })
        return
      }
      const [c] = t.pk
      for (let i = 0; i < zeilen.length; i += BUENDEL) {
        const liste = zeilen.slice(i, i + BUENDEL).map((z) => encodeURIComponent(`"${String(z[c])}"`))
        await rest(`${t.name}?congregation_id=eq.${cong}&${c}=in.(${liste.join(',')})`, { method: 'DELETE', headers: minimal })
      }
    },
    async einfuegen(t, zeilen) {
      for (const gruppe of nachSpalten(zeilen)) {
        for (let i = 0; i < gruppe.length; i += BUENDEL) {
          await rest(t.name, { method: 'POST', headers: minimal, body: JSON.stringify(gruppe.slice(i, i + BUENDEL)) })
        }
      }
    },
    aendern: (t, cong, zeile, werte) =>
      rest(`${t.name}?${zeilenFilter(t, cong, zeile)}`, { method: 'PATCH', headers: minimal, body: JSON.stringify(werte) }),
    konten: async () => new Set((await kontenLesen()).map((k) => k.id)),
  }
}

/* ===================== Aufruf ============================================= */

const SPALTEN_BERICHT = [
  ['geloescht', 'gelöscht'],
  ['eingefuegt', 'eingefügt'],
  ['geaendert', 'geändert'],
  ['nachgetragen', 'Verweise'],
  ['bleibt', 'bleibt'],
  ['ohneKonto', 'ohne Konto'],
]

export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  const datei = argv.find((a) => !a.startsWith('--') && a.endsWith('.json'))
  const cong = typeof arg.cong === 'string' ? arg.cong : ''
  if (!datei || !fs.existsSync(datei) || !cong) {
    console.error('Aufruf: node scripts/versammlung-auf-sicherung.mjs <sicherung.json> --cong <id> [--wirklich]')
    process.exit(2)
  }
  const sicherung = aufHeutigeSpalten(JSON.parse(fs.readFileSync(datei, 'utf8')))
  const schema = fs.readFileSync(path.join(REPO, 'supabase', 'schema.sql'), 'utf8')
  if (sicherung.schema_sha256 && sicherung.schema_sha256 !== schemaFingerabdruck(schema)) {
    console.log('! Die Sicherung stammt von einem anderen Stand von schema.sql als dem hier.')
    console.log('  Geschrieben werden nur ihre Spalten; was seither dazukam, bleibt, wie es ist —')
    console.log('  außer den Wechseln der Zusammenkunftszeit: Sie gehen mit der Grundzeit zurück.\n')
  }

  const { url, key } = await zugangsdaten()
  const zugriff = restZugriff(restKlient(url, key), () => konten(url, key))
  // Geschrieben wird nur mit `--wirklich` — siehe Kopf.
  const trocken = Boolean(arg.trocken) || !arg.wirklich
  const [versammlung] = await zugriff.lesen({ name: 'congregations', pk: ['id'] }, cong)
  console.log(`Sicherung:   ${datei} (erstellt ${sicherung.erstellt})`)
  console.log(`Versammlung: ${versammlung ? `„${versammlung.name}" ` : ''}(${cong})`)
  console.log(
    trocken
      ? 'Es wird nur gerechnet, nichts geschrieben (geschrieben wird mit --wirklich).\n'
      : 'Mit --wirklich: Es wird geschrieben. Während des Laufs benutzt niemand die App.\n',
  )

  let erg
  try {
    erg = await zuruecksetzen({ zugriff, schema, sicherung, cong, trocken })
  } catch (e) {
    console.error(String(e?.message ?? e))
    process.exit(1)
  }

  console.log(`${'Tabelle'.padEnd(22)}${SPALTEN_BERICHT.map(([, titel]) => titel.padStart(11)).join('')}`)
  let summe = 0
  for (const [name, b] of erg.bericht) {
    const werte = SPALTEN_BERICHT.map(([k]) => b[k])
    if (werte.every((n) => n === 0)) continue
    summe += b.geloescht + b.eingefuegt + b.geaendert + b.nachgetragen
    console.log(`${name.padEnd(22)}${werte.map((n) => String(n || '').padStart(11)).join('')}`)
  }
  if (!summe) console.log('(nichts zu tun — die Versammlung steht schon auf der Sicherung)')
  for (const h of erg.hinweise) console.log(h)
  console.log('\n„bleibt": Zeilen, die die Sicherung nicht kennt, an denen aber ein Konto oder Anmelde-Link hängt.')
  console.log('„ohne Konto": Zeilen der Sicherung, deren Konto es nicht mehr gibt — so fort, wie beim Löschen des Kontos.')
  const m = erg.mitglieder
  if (erg.verknuepft) console.log(`\nKonten wieder mit ihrer Person verknüpft: ${erg.verknuepft} (die Person war in der Beta gelöscht worden).`)
  console.log(`\nKonten (bleiben sonst, wie sie sind): ${m.gleich} wie in der Sicherung, ${m.dazu} seither dazu, ${m.anders} mit anderen Rechten oder anderer Person, ${m.fort} nicht mehr da.`)
  for (const [t, grund] of Object.entries(BLEIBEN)) console.log(`unberührt: ${t} — ${grund}`)

  if (trocken) {
    console.log('\nNichts geschrieben — zum Schreiben derselbe Aufruf mit --wirklich. Kaskaden der Datenbank sind nicht mitgezählt.')
    return
  }
  if (erg.abweichungen.length) {
    console.log('\nGegenprobe — ABWEICHUNGEN:')
    for (const a of erg.abweichungen) console.log(`${a.tabelle.padEnd(22)} fehlt ${a.fehlt}, anders ${a.anders}, zu viel ${a.zuviel}`)
    console.log('Ein zweiter Lauf holt nach, was ein Trigger dazwischen geschrieben hat; bleibt es, nachsehen.')
    process.exitCode = 1
    return
  }
  console.log('\nGegenprobe: Jede Tabelle der Versammlung steht wie in der Sicherung.')
}

alsSkript(import.meta.url, main)
