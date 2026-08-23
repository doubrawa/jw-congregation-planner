#!/usr/bin/env node
/**
 * Mutationsprobe (T67) — misst, ob die Tests die Regeln wirklich verteidigen.
 *
 * **Die Frage, die grüne Tests nicht beantworten.** 1782 Tests laufen durch.
 * Das belegt, dass der Code tut, was die Tests erwarten — nicht, dass die Tests
 * erwarten, was die Regeln fordern. Coverage sagt nur, welche Zeile *ausgeführt*
 * wurde; ausgeführt wird auch eine Zeile, deren Ergebnis niemand prüft.
 *
 * Die Probe dreht die Frage um: Sie **bricht eine Regel absichtlich** und sieht
 * nach, ob überhaupt etwas rot wird.
 *
 *   - Wird der Testlauf **rot** → die Regel ist bewacht. ✔
 *   - Bleibt er **grün** → die Regel steht ungeschützt da: Man könnte sie
 *     morgen versehentlich entfernen, und der ganze Testbestand schwiege. ✘
 *
 * **Warum jede Mutation den ganzen Testlauf bekommt** und nicht nur die
 * „zuständige" Datei: Welcher Test eine Regel deckt, ist genau die Frage. Wer
 * die Auswahl vorher trifft, bekommt die Antwort heraus, die er hineingesteckt
 * hat. `--bail=1` bricht beim ersten roten Test ab — bewachte Mutationen sind
 * deshalb schnell, ungewachte kosten den vollen Lauf.
 *
 * **Der Katalog ist die eigentliche Arbeit.** Jeder Eintrag benennt eine
 * fachliche Regel, keine Syntaxvariante: „niemand ist zur selben Zeit in zwei
 * Räumen", „eine ausgefallene Zusammenkunft zählt nicht zur Auslastung". Eine
 * Mutation, die keine Regel bricht (Umbenennen, Umsortieren), darf grün bleiben
 * und gehört nicht hierher.
 *
 * **Die Probe rostet laut.** Findet ein `suchen` seine Stelle nicht mehr —
 * gar nicht oder mehrfach —, bricht der Lauf ab, statt den Eintrag
 * stillschweigend zu überspringen. Sonst stünde eines Tages ein Katalog voller
 * Einträge da, die nichts mehr messen, und meldete lauter grüne Häkchen.
 *
 *     node scripts/mutationsprobe.mjs            # alle
 *     node scripts/mutationsprobe.mjs zuteilung  # nur passende Kennungen
 *     node scripts/mutationsprobe.mjs --liste     # nur auflisten, nichts laufen lassen
 *
 * Läuft **nicht** in der CI: ein Durchgang kostet je Eintrag bis zu einen
 * vollen Testlauf. Sie ist ein Messgerät, das man ansetzt — wie `npm run
 * contrast` —, keine Sperrklinke wie `check-index-access`.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const hier = dirname(fileURLToPath(import.meta.url))
const wurzel = join(hier, '..')

/**
 * Der Katalog.
 *
 * `regel` sagt, was gelten soll — in denselben Worten, in denen es im Quelltext
 * oder in `docs/analyse/todo.md` begründet ist. `suchen` muss **genau einmal**
 * in der Datei stehen; wo eine Zeile mehrfach vorkommt, steht die Nachbarzeile
 * mit dabei.
 */
const KATALOG = [
  // ── Auto-Zuteilung ────────────────────────────────────────────────────────
  {
    id: 'zuteilung-ausfall',
    datei: 'src/data/planning.ts',
    regel: 'Eine ausgefallene Zusammenkunft wird nicht besetzt (T30).',
    suchen: 'if (!meeting || istAusgefallen(next[weekIndex], tab)) {',
    ersetzen: 'if (!meeting) {',
  },
  {
    id: 'zuteilung-beide-raeume',
    datei: 'src/data/planning.ts',
    regel: 'Niemand ist zur selben Zeit im Hauptsaal und in der Zusätzlichen Klasse.',
    suchen: 'for (const aux of raeume(meeting)) for (const slot of slotsOf(item, aux)) merken(slot)',
    ersetzen: 'for (const slot of item.names) merken(slot)',
  },
  {
    id: 'zuteilung-reinigungs-malus',
    datei: 'src/data/planning.ts',
    regel: 'Aufseher und Gehilfe der reinigenden Gruppe bekommen möglichst keinen Hilfsdienst.',
    suchen: "if (kind === 'helper' && cleaningLeaders.has(p.id)) e += HELPER_MALUS",
    ersetzen: "if (kind === 'helper' && cleaningLeaders.has(p.id)) e += 0",
  },
  {
    id: 'zuteilung-wt-leiter',
    datei: 'src/data/planning.ts',
    regel: 'Der feste WT-Studium-Leiter kommt vor dem Vertreter und beide vor der freien Auswahl.',
    suchen: "return designated('wtLeiter') ?? designated('wtVertreter') ?? pick('part', 'studium')",
    ersetzen: "return pick('part', 'studium')",
  },
  {
    id: 'zuteilung-wartezeit',
    datei: 'src/data/planning.ts',
    regel: 'Bei gleicher Last kommt zuerst, wer am längsten nicht dran war.',
    suchen: '        dist(b) - dist(a) ||\n',
    ersetzen: '',
  },
  {
    id: 'zuteilung-gruppen-rotation',
    datei: 'src/data/planning.ts',
    regel: 'Die Reinigung rotiert über die Gruppen, sie bleibt nicht bei der ersten.',
    suchen: 'const cleaningGroup = groups.length ? groups[weekIndex % groups.length] : null',
    ersetzen: 'const cleaningGroup = groups.length ? groups[0] : null',
  },
  {
    id: 'zuteilung-platzzahl',
    datei: 'src/data/planning.ts',
    regel: 'Ein Hilfsdienst wird über alle eingestellten Plätze besetzt, nicht nur den ersten.',
    suchen: '    for (let pos = 0; pos < svc.count; pos++) {\n      if (arr[pos]?.name) continue',
    ersetzen: '    for (let pos = 0; pos < 1; pos++) {\n      if (arr[pos]?.name) continue',
  },
  {
    id: 'zuteilung-partner-raum',
    datei: 'src/data/planning.ts',
    regel: 'Der Gesprächspartner richtet sich nach dem Führer DESSELBEN Raums (T18).',
    suchen: "const leadName = slotsOf(item, aux).find((n) => n.bereichsKey === 'schulung')?.name ?? ''",
    ersetzen: "const leadName = item.names.find((n) => n.bereichsKey === 'schulung')?.name ?? ''",
  },
  {
    id: 'zuteilung-partner-geschlecht',
    datei: 'src/data/planning.ts',
    regel: 'Der Gesprächspartner hat dasselbe Geschlecht wie der Führer (oder ist Familie).',
    suchen: 'extra: (p: Person) => partnerGenderOk(lead, p),',
    ersetzen: 'extra: (_p: Person) => true,',
  },
  {
    id: 'zuteilung-vorsitz-betet',
    datei: 'src/data/planning.ts',
    regel: 'Der Vorsitz spricht das Anfangsgebet (einzige erlaubte Doppel-Aufgabe).',
    suchen: 'if (vorsitz && gebet && !gebet.name) {',
    ersetzen: 'if (false && vorsitz && gebet && !gebet.name) {',
  },
  {
    id: 'zuteilung-abwesend',
    datei: 'src/data/planning.ts',
    regel: 'Wer abwesend gemeldet ist, wird nicht eingeteilt.',
    suchen:
      '        !istAbwesend(abwesend, p.id, weekIndex, tab) &&\n        (!opts.extra || opts.extra(p)) &&',
    ersetzen: '        (!opts.extra || opts.extra(p)) &&',
  },
  {
    id: 'zuteilung-gastredner',
    datei: 'src/data/planning.ts',
    regel: 'Gastredner und Kreisaufseher werden nicht automatisch besetzt (SKIP_ROLE).',
    suchen: "if (slot.name || SKIP_ROLE.test(slot.rolle ?? '')) continue",
    ersetzen: 'if (slot.name) continue',
  },

  // ── Auslastung ────────────────────────────────────────────────────────────
  {
    id: 'last-klasse-nur-wenn-vorhanden',
    datei: 'src/data/helpers.ts',
    regel: 'Die Zusätzliche Klasse zählt nur, solange sie besteht (T20).',
    suchen: 'if (mitKlasse) for (const slot of item.aux ?? []) if (gehoertZu(slot, person)) count++',
    ersetzen: 'for (const slot of item.aux ?? []) if (gehoertZu(slot, person)) count++',
  },
  {
    id: 'last-hilfsdienst-platzzahl',
    datei: 'src/data/helpers.ts',
    regel: 'Hilfsdienst-Last zählt nur bis zur eingestellten Platzzahl (T21).',
    suchen: 'const bis = grenze ? (grenze.get(key) ?? 0) : assigned.length',
    ersetzen: 'const bis = assigned.length',
  },
  {
    id: 'last-ausfall',
    datei: 'src/data/helpers.ts',
    regel: 'Eine ausgefallene Zusammenkunft erzeugt keine Auslastung (T30).',
    suchen: '      if (istAusgefallen(week, tab)) continue\n      const meeting = week[tab]\n      const mitKlasse',
    ersetzen: '      const meeting = week[tab]\n      const mitKlasse',
  },
  {
    id: 'last-fenster-nach-datum',
    datei: 'src/data/helpers.ts',
    regel: 'Das Auslastungs-Fenster misst in Wochen (Datum), nicht in Listenplätzen (T36).',
    suchen: 'return weeks.find((w) => w?.start === ziel)',
    ersetzen: 'return weeks[wi + versatz]',
  },
  {
    id: 'gast-ohne-namens-rueckfall',
    datei: 'src/data/helpers.ts',
    regel: 'Ein externer Redner zählt nie auf eine gleichnamige eigene Person (T29).',
    suchen: 'return !isGuestRole(zuteilung.rolle) && zuteilung.name === displayName(person)',
    ersetzen: 'return zuteilung.name === displayName(person)',
  },
  {
    id: 'partner-familie',
    datei: 'src/data/helpers.ts',
    regel: 'Familienangehörige dürfen geschlechtsübergreifend Gesprächspartner sein.',
    suchen: 'return Boolean(lead.fam) && lead.fam === cand.fam',
    ersetzen: 'return false',
  },

  // ── Datum ─────────────────────────────────────────────────────────────────
  {
    id: 'termin-rangfolge',
    datei: 'src/data/meeting-dates.ts',
    regel: 'Abweichung schlägt eigenen Termin schlägt Einstellungen (T30).',
    suchen: 'return verlegt ?? meetingDateParts(week[tab].date).offset ?? meetingDayOffsets(meetings)[tab]',
    ersetzen: 'return meetingDateParts(week[tab].date).offset ?? verlegt ?? meetingDayOffsets(meetings)[tab]',
  },
  {
    id: 'uhrzeit-rangfolge',
    datei: 'src/data/meeting-dates.ts',
    regel: 'Dieselbe Rangfolge gilt für die Uhrzeit wie für den Tag.',
    suchen: '    abweichung(week, tab)?.time ??\n    meetingDateParts(week[tab].date).zeit ??',
    ersetzen: '    meetingDateParts(week[tab].date).zeit ??\n    abweichung(week, tab)?.time ??',
  },

  // ── Bestätigungen und Ersatz ──────────────────────────────────────────────
  {
    id: 'bestaetigt-gewinnt',
    datei: 'src/lib/data.ts',
    regel: 'Hat jemand bestätigt, ist der Platz besetzt — gleich wer vorher absagte (T84).',
    suchen: "    if (out[row.task_key] === 'bestätigt') continue\n",
    ersetzen: '',
  },
  {
    id: 'vorlage-beim-oeffnen',
    datei: 'src/app/reducer.ts',
    regel: 'Beim Öffnen wird vorgelegt, was offen ist — Bestätigung ODER Ersatzgesuch (T69).',
    suchen: "return myTasks.some((t) => t.status === 'offen') || substituteReqs.length > 0",
    ersetzen: "return myTasks.some((t) => t.status === 'offen')",
  },

  // ── Programm bearbeiten ───────────────────────────────────────────────────
  {
    id: 'lac-einfuegestelle',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Ein eigener Punkt reiht sich vor dem Bibelstudium ein — strukturell, nicht per Titel (T61).',
    suchen: "(x) => !isSong(x) && x.names.some((n) => n.bereichsKey === 'leser'),",
    ersetzen: "(x) => !isSong(x) && x.title.startsWith('Versammlungsbibelstudium'),",
  },
  {
    id: 'minuten-aus-feld',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Die Dauer kommt aus dem Feld, nicht aus dem Anzeigetext (T32).',
    suchen: "  if (typeof item.mins === 'number') return item.mins\n  return ersteZahl(item.meta ?? '')",
    ersetzen: "  return ersteZahl(item.meta ?? '')",
  },

  // ── Abwesenheiten ─────────────────────────────────────────────────────────
  {
    id: 'abwesenheit-gehoert-der-person',
    datei: 'src/aufgaben/AufgabenScreen.tsx',
    regel: '„Deine Einträge" hängen an der Person, nicht am Ersteller.',
    suchen: 'a.personId != null ? a.personId === state.personId : a.userId === state.userId,',
    ersetzen: 'a.userId === state.userId || a.personId === state.personId,',
  },
  {
    id: 'abwesenheit-person-aus-datensatz',
    datei: 'src/app/persist.ts',
    regel: 'Gespeichert wird die Person der Abwesenheit — nicht die des Angemeldeten.',
    suchen: 'saveAbsence(congId, action.absence)',
    ersetzen: 'saveAbsence(congId, { ...action.absence, personId: next.personId })',
  },

  // ── Treffpunkte ───────────────────────────────────────────────────────────
  {
    id: 'fs-gruppe-zuerst',
    datei: 'src/data/fs.ts',
    regel: 'Den Gruppentreffpunkt leitet jemand aus der Gruppe — vor dem Lastvergleich (F8).',
    suchen: '        gruppenRang(a.p) - gruppenRang(b.p) ||\n',
    ersetzen: '',
  },
  {
    id: 'fs-wochendeckel',
    datei: 'src/data/fs.ts',
    regel: 'Höchstens eine Leitung je Person und Woche, solange genug Kandidaten da sind.',
    suchen: 'const frei = alle.filter((k) => !inDerWoche.has(k.p.id))',
    ersetzen: 'const frei = alle',
  },
  {
    id: 'fs-kennung-ohne-wochennummer',
    datei: 'src/data/fs.ts',
    regel: 'Die Kennung eines Treffpunkts trägt keine Wochennummer (T87).',
    suchen: 'function instanzId(rule: FsRule): string {\n  return rule.id\n}',
    ersetzen: 'function instanzId(rule: FsRule): string {\n  return `1|${rule.id}`\n}',
  },
  {
    id: 'fs-kennung-altbestand',
    datei: 'src/data/fs.ts',
    regel: 'Gespeicherte Treffpunkte werden beim Laden auf die stabile Kennung gehoben.',
    suchen: "      const treffer = ALT.exec(inst.id)\n      if (!treffer?.[1]) return inst",
    ersetzen: '      return inst\n',
  },
  {
    id: 'fs-schluessel-altbestand',
    datei: 'src/lib/data.ts',
    regel: 'Die Bestätigung eines Treffpunkts wandert auf den stabilen Schlüssel mit.',
    suchen: '    if (treffer) renames.push([key, `fs|${treffer[1]}|${treffer[2]}`])',
    ersetzen: '    if (false && treffer) renames.push([key, key])',
  },
  {
    id: 'fs-tagessperre',
    datei: 'src/data/fs.ts',
    regel: 'Wer an einem Wochentag schon leitet, leitet dort nicht ein zweites Mal.',
    suchen: '      .filter((k) => !used.has(k.p.id))',
    ersetzen: '      .filter(() => true)',
  },

  {
    id: 'fs-fremde-gruppe',
    datei: 'src/data/fs.ts',
    regel: 'Einen Gruppentreffpunkt sieht nur, wer zu der Gruppe gehört oder sie leitet.',
    suchen: "  return insts.filter((inst) => inst.grp === '' || meine.has(inst.grp))",
    ersetzen: '  return [...insts]',
  },
  {
    id: 'fs-anzeige-fragt-sichtbarkeit',
    datei: 'src/programm/FsProgram.tsx',
    regel: 'Die Treffpunkt-Anzeige liest gefiltert aus der Woche, nicht roh (der Aufrufer).',
    suchen: '  const insts = fsVisible(',
    ersetzen: '  const insts = ((roh: FsInstance[]) => roh)(',
  },

  {
    id: 'fs-kandidaten-wochentag',
    datei: 'src/planen/kandidaten.ts',
    regel: '„Schon heute" meint den Wochentag DIESES Treffpunkts, nicht die ganze Woche.',
    suchen: 'if (o.id === sel.instId || o.wd !== inst.wd || o.lext || o.leader !== name) continue',
    ersetzen: 'if (o.id === sel.instId || o.lext || o.leader !== name) continue',
  },

  // ── Zwischenablage ────────────────────────────────────────────────────────
  {
    id: 'kopieren-geste-zuerst',
    datei: 'src/lib/clipboard.ts',
    regel: 'Der gestensichere Weg kommt zuerst, die moderne API nur als Rückfall.',
    suchen:
      '  if (legacyCopy(text)) return true\n' +
      '  try {\n' +
      '    if (navigator.clipboard?.writeText) {\n' +
      '      await navigator.clipboard.writeText(text)\n' +
      '      return true\n' +
      '    }\n' +
      '  } catch {\n' +
      '    // beide Wege gescheitert\n' +
      '  }\n' +
      '  return false',
    ersetzen:
      '  try {\n' +
      '    if (navigator.clipboard?.writeText) {\n' +
      '      await navigator.clipboard.writeText(text)\n' +
      '      return true\n' +
      '    }\n' +
      '  } catch {\n' +
      '    // beide Wege gescheitert\n' +
      '  }\n' +
      '  return legacyCopy(text)',
  },

  // ── Übersetzung ───────────────────────────────────────────────────────────
  {
    id: 'monat-beide-tabellen',
    datei: 'src/i18n/translate.ts',
    regel: 'Monatsnamen werden in Lang- UND Kurztabelle nachgeschlagen (T1).',
    suchen: 'const monatIndex = (name: string): number | undefined => MON[name] ?? MONA[name]',
    ersetzen: 'const monatIndex = (name: string): number | undefined => MON[name]',
  },

  // ── Edge Functions ────────────────────────────────────────────────────────
  {
    id: 'erinnerung-ausfall',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Für eine ausgefallene Zusammenkunft wird nicht erinnert (T30).',
    suchen: 'if (istAusgefallenFuer(week.dev, tab)) continue',
    ersetzen: 'if (false) continue',
  },
  {
    id: 'erinnerung-fs-kennung',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Der Versand greift nach der stabilen Treffpunkt-Kennung, auch im Altbestand (T87).',
    suchen: 'if (conf.has(`fs|${woche}|${stabileKennung(inst.id)}`)) continue',
    ersetzen: 'if (conf.has(`fs|${woche}|${inst.id}`)) continue',
  },
  {
    id: 'ersatz-nur-qualifizierte',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Übernehmen darf nur, wer für den Dienst freigegeben ist.',
    suchen: "if (!callerPerson || !callerPerson.priv?.[qualKey]) return json({ error: 'not-qualified' }, 403)",
    ersetzen: 'if (!callerPerson) return json({ error: \'not-qualified\' }, 403)',
  },
  {
    id: 'einladung-nur-planer',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Einladungen verschicken darf nur ein Planer.',
    suchen: "if (!member?.planner) return json({ error: 'forbidden' }, 403)",
    ersetzen: "if (!member) return json({ error: 'forbidden' }, 403)",
  },
  {
    id: 'einladung-eigene-versammlung',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Empfänger kommen aus der eigenen Versammlung — kein offenes Mail-Relay.',
    suchen: '`persons?select=id,fn,mail&congregation_id=eq.${member.congregation_id}`',
    ersetzen: "'persons?select=id,fn,mail'",
  },
  {
    id: 'einladung-ohne-absender',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Ohne verifizierten Absender wird nicht gesendet, sondern abgewunken.',
    suchen: "    if (!INVITE_FROM) return json({ error: 'not-configured' })\n",
    ersetzen: '',
  },
  {
    id: 'ersatz-texte-vollstaendig',
    datei: 'supabase/functions/substitute/texte.ts',
    regel: 'Jede App-Sprache hat ihren eigenen Ersatz-Text — kein stiller Rückfall auf Deutsch.',
    suchen: "  it: { gesucht: 'Cercasi sostituto', gefunden: 'Sostituto trovato' },\n",
    ersetzen: '',
  },
  {
    id: 'import-bibellesung',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Der letzte Schätze-Punkt ist die Bibellesung — über die Position, nicht den Text.',
    suchen: "if (color === 'teal' && rec === lastOf.teal) {",
    ersetzen: "if (color === 'teal' && rec === recs[0]) {",
  },
]

// ── Lauf ────────────────────────────────────────────────────────────────────

const argumente = process.argv.slice(2)
const nurListe = argumente.includes('--liste')
const filter = argumente.filter((a) => !a.startsWith('--'))
const auswahl = filter.length
  ? KATALOG.filter((m) => filter.some((f) => m.id.includes(f) || m.datei.includes(f)))
  : KATALOG

if (auswahl.length === 0) {
  console.error(`Keine Mutation passt auf ${filter.join(' ')}.`)
  process.exit(2)
}

/** Doppelte Kennungen fielen sonst als „schon gemessen" durch. */
const kennungen = new Set()
for (const m of KATALOG) {
  if (kennungen.has(m.id)) {
    console.error(`Doppelte Kennung im Katalog: ${m.id}`)
    process.exit(2)
  }
  kennungen.add(m.id)
}

/**
 * Vorprüfung über den GANZEN Katalog, nicht nur die Auswahl: Ein Eintrag, der
 * seine Stelle verloren hat, soll auch dann auffallen, wenn gerade ein anderer
 * gemessen wird.
 */
for (const m of KATALOG) {
  const quelle = readFileSync(join(wurzel, m.datei), 'utf8')
  const treffer = quelle.split(m.suchen).length - 1
  if (treffer !== 1) {
    console.error(
      `\n${m.id}: „suchen" steht ${treffer}× in ${m.datei} — erwartet genau 1×.\n` +
        `Die Stelle hat sich verschoben. Eintrag nachziehen (oder streichen, wenn die\n` +
        `Regel weggefallen ist) — nicht stillschweigend überspringen.\n`,
    )
    process.exit(2)
  }
}

if (nurListe) {
  for (const m of auswahl) console.log(`${m.id.padEnd(32)} ${m.regel}`)
  console.log(`\n${auswahl.length} Einträge.`)
  process.exit(0)
}

const vitest = join(wurzel, 'node_modules', 'vitest', 'vitest.mjs')

/** Einen vollen Testlauf machen. Rückgabe: `{ rot, ausgabe }`. */
function testlauf() {
  const lauf = spawnSync(process.execPath, [vitest, 'run', '--reporter=dot', '--bail=1'], {
    cwd: wurzel,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    maxBuffer: 64 * 1024 * 1024,
  })
  if (lauf.error) {
    console.error(`vitest konnte nicht gestartet werden: ${lauf.error.message}`)
    process.exit(2)
  }
  return { rot: lauf.status !== 0, ausgabe: `${lauf.stdout ?? ''}${lauf.stderr ?? ''}` }
}

/** Aus der Ausgabe die erste rote Testdatei ziehen — als Beleg, WER bewacht. */
function ersterWaechter(ausgabe) {
  const treffer = /(?:FAIL|❯|×)\s+([\w./-]+\.test\.tsx?)/.exec(ausgabe)
  return treffer?.[1] ?? 'unbekannt'
}

const ergebnisse = []
let laufendeDatei = null
let laufenderInhalt = null

/** Die Datei zurückschreiben — auch bei Abbruch (Ctrl+C) oder Absturz. */
function zuruecksetzen() {
  if (laufendeDatei && laufenderInhalt !== null) {
    writeFileSync(laufendeDatei, laufenderInhalt)
    laufendeDatei = null
    laufenderInhalt = null
  }
}
process.on('SIGINT', () => {
  zuruecksetzen()
  console.error('\nAbgebrochen — Quelltext wiederhergestellt.')
  process.exit(130)
})
process.on('uncaughtException', (fehler) => {
  zuruecksetzen()
  throw fehler
})

console.log(`Mutationsprobe: ${auswahl.length} Regeln, je ein voller Testlauf.\n`)

for (const [i, m] of auswahl.entries()) {
  const pfad = join(wurzel, m.datei)
  const original = readFileSync(pfad, 'utf8')
  laufendeDatei = pfad
  laufenderInhalt = original

  process.stdout.write(`[${i + 1}/${auswahl.length}] ${m.id} … `)
  writeFileSync(pfad, original.replace(m.suchen, m.ersetzen))
  const start = Date.now()
  const { rot, ausgabe } = testlauf()
  zuruecksetzen()

  const sekunden = Math.round((Date.now() - start) / 1000)
  const waechter = rot ? ersterWaechter(ausgabe) : null
  ergebnisse.push({ ...m, rot, waechter })
  console.log(rot ? `bewacht (${waechter}, ${sekunden}s)` : `UNBEWACHT (${sekunden}s)`)
}

const offen = ergebnisse.filter((e) => !e.rot)
console.log(`\n${ergebnisse.length - offen.length}/${ergebnisse.length} Regeln bewacht.`)

if (offen.length > 0) {
  console.log('\nUnbewacht — diese Regeln kann man entfernen, ohne dass ein Test es merkt:\n')
  for (const e of offen) console.log(`  ${e.id.padEnd(32)} ${e.datei}\n${' '.repeat(36)}${e.regel}`)
  process.exit(1)
}
