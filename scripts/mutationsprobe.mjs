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
 * **Gewertet wird nur ein Lauf, der getestet hat.** Findet Node vitest nicht,
 * stirbt der Lauf oder endet er ohne ein einziges Testergebnis, bricht die
 * Probe mit Rückgabewert 2 ab, statt der Regel ein Häkchen zu geben
 * (`testlaufBefund`). Bis zum 26.9.2026 zählte jeder Rückgabewert ≠ 0 als
 * „bewacht" — in einem Worktree bekam so jede Regel eines.
 *
 * **Und nur ein Rot, das ohne die Mutation nicht da ist.** Gemeldet wird die
 * Datei, die zuerst rot wird; ist eine schon ohne Mutation rot, ist sie es bei
 * jeder. Deshalb läuft jeder gemeldete Wächter einmal je Durchgang ohne
 * Mutation (`waechterBefund`); ist er dann rot, bricht die Probe mit 2 ab.
 * Bis zum 3.10.2026 hieß ein roter Ausgangsstand „alle Regeln bewacht".
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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { auszug, werkzeugPfad } from './gemeinsam.mjs'

const hier = dirname(fileURLToPath(import.meta.url))
const wurzel = join(hier, '..')

/**
 * Quelltext mit **einheitlichen Zeilenenden** lesen.
 *
 * `.gitattributes` legt LF fest, aber `core.autocrlf` checkt unter Windows CRLF
 * aus — und dort wird dieses Projekt entwickelt. Die Muster im Katalog stehen
 * in JavaScript-Zeichenketten und tragen deshalb `\n`. Von den 126 Einträgen
 * sind 115 mehrzeilig: Sie konnten auf einem Windows-Arbeitsbaum **nie**
 * treffen, und die Probe brach beim ersten von ihnen mit „Stelle hat sich
 * verschoben" ab. Das Messgerät meldete Rost, wo keiner war.
 *
 * Gesucht und mutiert wird deshalb auf der LF-Fassung. Zurückgeschrieben wird
 * am Ende der **rohe** Inhalt (siehe `zuruecksetzen`) — die Datei kommt Byte für
 * Byte so zurück, wie sie war.
 */
function lies(pfad) {
  return readFileSync(pfad, 'utf8').replace(/\r\n/g, '\n')
}

/**
 * Der Katalog.
 *
 * `regel` sagt, was gelten soll — in denselben Worten, in denen es im Quelltext
 * oder in `docs/analyse/todo.md` begründet ist. `suchen` muss **genau einmal**
 * in der Datei stehen; wo eine Zeile mehrfach vorkommt, steht die Nachbarzeile
 * mit dabei.
 */
export const KATALOG = [
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
    /*
      Die Stelle ist seit 5b9e724 („Vierzehn Funktionen zählten die vier
      Platzsorten je für sich auf", 19.9.2026) ein Aufruf von `allePlaetze` —
      davor `programmPlaetze` (244e1a0), und bis 21.9. suchte dieser Eintrag
      noch die alte Zeile: Die ganze Probe brach deshalb ab, ohne eine Regel zu
      prüfen. Die Mutation nimmt dem Durchlauf die Plätze der Zusätzlichen
      Klasse wieder weg und lässt nur den Hauptsaal übrig — genau die Fassung,
      mit der der Fehler entstanden ist.
    */
    suchen: 'for (const platz of allePlaetze(meeting)) merken(platz.slot)',
    ersetzen: "for (const platz of allePlaetze(meeting)) if (platz.art !== 'programm' || !platz.aux) merken(platz.slot)",
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
    suchen: "const fest = designated('wtLeiter') ?? designated('wtVertreter')",
    ersetzen: 'const fest: Person | undefined = undefined',
  },
  {
    id: 'zuteilen-vorschlag-schuelerteil',
    datei: 'src/data/planning.ts',
    regel: 'Der Vorschlag im Zuteilen-Blatt folgt denselben Schülerteil-Regeln wie die Automatik (Partner passt zum Führer).',
    suchen: "return w.rangfolge('part', slot.bereichsKey, schuelerteilOpts(item, slot, sel.aux === true, persons))",
    ersetzen: "return w.rangfolge('part', slot.bereichsKey)",
  },
  {
    id: 'zuteilen-vorschlag-leiter',
    datei: 'src/data/planning.ts',
    regel: 'Am Leiter-Platz des Wachtturm-Studiums schlägt das Blatt den festen Leiter vor — wie die Automatik.',
    suchen: "  if (istArt(section, 'wtStudium') && slot.rolle === 'Leiter') return w.rangfolgeLeiter()\n",
    ersetzen: '',
  },
  {
    id: 'zuteilen-zuletzt-nur-davor',
    datei: 'src/data/planning.ts',
    regel: '„zuletzt vor … Wochen" zählt nur, was vor der geplanten Woche liegt.',
    suchen: '    if (!(Date.parse(week.start) < zielMs)) continue\n',
    ersetzen: '',
  },
  {
    id: 'zuteilen-reihenfolge',
    datei: 'src/planen/kandidaten.ts',
    regel: 'Oben steht der Vorschlag, darunter folgt die Liste der Rangfolge der Automatik.',
    suchen: '.sort((a, b) => stufe(a) - stufe(b) || (rang.get(a.key) ?? 0) - (rang.get(b.key) ?? 0))',
    ersetzen: '.sort((a, b) => Number(a.absent) - Number(b.absent))',
  },
  {
    id: 'zuteilen-abwesend-zeitraum',
    datei: 'src/planen/useAktuellerPlatz.ts',
    regel: 'Ist die eingeteilte Person abwesend, nennt das Blatt den Zeitraum, nicht nur „abwesend".',
    suchen: "      konflikt?.kind === 'absent'\n",
    ersetzen: '      false\n',
  },
  {
    id: 'zuteilen-spalte-ohne-blatt',
    datei: 'src/app/AppShell.tsx',
    regel: 'Am Desktop teilt die Spalte neben dem Plan zu — kein Blatt legt sich darüber.',
    suchen: 'const zuteilenBlatt = state.slotSel && !zuteilenInSpalte(state, desktop) ? state.slotSel : null',
    ersetzen: 'const zuteilenBlatt = state.slotSel',
  },
  {
    id: 'zuteilen-spalte-nur-sichtbare-woche',
    datei: 'src/planen/planen-raster.ts',
    regel: 'Die Spalte zeigt nur einen Platz der Woche, die der Plan gerade zeigt.',
    suchen: '  if (!sel || sel.wi !== state.week) return false\n',
    ersetzen: '  if (!sel) return false\n',
  },
  {
    id: 'zuteilen-spalte-fokus-suche',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'In der Spalte geht der Fokus nach dem Klick auf einen Platz gleich in die Suche.',
    suchen: '      <ZuteilenInhalt sel={sel} onClose={onClose} fokusAufSuche />',
    ersetzen: '      <ZuteilenInhalt sel={sel} onClose={onClose} />',
  },
  {
    id: 'zuteilen-blatt-ohne-fokus',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Im Blatt springt der Fokus nicht von selbst in die Suche — am Handy käme die Tastatur.',
    suchen: '  fokusAufSuche = false,',
    ersetzen: '  fokusAufSuche = true,',
  },
  {
    id: 'zuteilen-platz-markiert',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Am Desktop hebt der Plan den Platz hervor, den die Spalte gerade zuteilt.',
    suchen: "                        gewaehlt={istGewaehlt(state.slotSel, { kind: 'part', wi: state.week, tab, si, ii, ni, aux })}\n",
    ersetzen: '',
  },
  {
    id: 'suche-ohne-zeichen',
    datei: 'src/components/suche.ts',
    regel: 'Die Suche nach Namen findet „kruger" auch ohne Umlaut und „krueger" in Umschrift.',
    suchen: 'return text.includes(gesucht) || ohneZeichen(text).includes(ohne) || umschrift(text).includes(ohne)',
    ersetzen: 'return text.includes(gesucht)',
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
    suchen: 'const cleaningGroup = groups.length ? (groups[woche % groups.length] ?? null) : null',
    ersetzen: 'const cleaningGroup = groups.length ? (groups[0] ?? null) : null',
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
    suchen: "const leadPlatz = slotsOf(item, aux).find((n) => n.bereichsKey === 'schulung')",
    ersetzen: "const leadPlatz = item.names.find((n) => n.bereichsKey === 'schulung')",
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
    // Die Kopplung steht inzwischen in `gebetAnVorsitz`; die Mutation lässt
    // die Funktion sofort zurückkehren — das Gebet bleibt offen wie vorher.
    suchen: '  if (!vorsitzSlot?.name || !gebet || gebet.name) return',
    ersetzen: '  return',
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
    // Gefragt wird inzwischen über `isGuestRole` statt direkt über den
    // Ausdruck — eine Abschrift weniger (siehe planning.ts, Kopfkommentar).
    suchen: 'if (slot.name || isGuestRole(slot.rolle)) continue',
    ersetzen: 'if (slot.name) continue',
  },

  // ── Auslastung ────────────────────────────────────────────────────────────
  {
    id: 'last-klasse-nur-wenn-vorhanden',
    datei: 'src/data/helpers.ts',
    regel: 'Die Zusätzliche Klasse zählt nur, solange sie besteht (T20).',
    /*
      Die Grenze steht seit dem gemeinsamen Durchlauf (244e1a0) in `raeume()`
      statt in jeder Zählschleife einzeln — beim Abschalten der Klasse bleiben
      die Namen bewusst stehen, damit ein Wiedereinschalten sie hat. Die
      Mutation gibt beide Räume bedingungslos zurück; die Auslastung schleppte
      dann eine Last mit, die es gar nicht mehr gibt.
    */
    suchen: 'return hatAuxKlasse(meeting) ? [false, true] : [false]',
    ersetzen: 'return [false, true]',
  },
  {
    id: 'last-hilfsdienst-platzzahl',
    // Die Auslastungs-Rechnung ist aus `helpers.ts` in eine eigene Datei
    // gezogen; die Regeln selbst stehen unverändert da.
    datei: 'src/data/auslastung.ts',
    regel: 'Hilfsdienst-Last zählt nur bis zur eingestellten Platzzahl (T21).',
    suchen: 'const bis = grenze ? (grenze.get(key) ?? 0) : assigned.length',
    ersetzen: 'const bis = assigned.length',
  },
  {
    id: 'last-ausfall',
    datei: 'src/data/auslastung.ts',
    regel: 'Eine ausgefallene Zusammenkunft erzeugt keine Auslastung (T30).',
    // Die Zeile steht in `partWorkload` **und** in `helperWorkload`. Eindeutig
    // wird sie durch das, was NICHT dahinter steht: in `helperWorkload` trägt
    // sie einen Zeilenkommentar, hier folgt gleich die nächste Zeile.
    suchen: '      if (istAusgefallen(week, tab)) continue\n      const meeting = week[tab]',
    ersetzen: '      const meeting = week[tab]',
  },
  {
    id: 'last-fenster-nach-datum',
    datei: 'src/data/auslastung.ts',
    regel: 'Das Auslastungs-Fenster misst in Wochen (Datum), nicht in Listenplätzen (T36).',
    suchen: 'return weeks.find((w) => w?.start === ziel)',
    ersetzen: 'return weeks[wi + versatz]',
  },
  {
    id: 'gast-ohne-namens-rueckfall',
    datei: 'src/data/helpers.ts',
    regel: 'Ein externer Redner zählt nie auf eine gleichnamige eigene Person (T29).',
    // Seit dem 25.9.2026 steht die Regel in `gehoertZuKennung`; `gehoertZu`
    // reicht nur noch Id und Anzeigenamen der Person durch.
    suchen: 'return !isGuestRole(zuteilung.rolle) && zuteilung.name === personName',
    ersetzen: 'return zuteilung.name === personName',
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
    regel: 'Eine Abweichung schlägt den Rhythmus der Versammlung (T30).',
    suchen: 'return versatzAbMontag(abweichung(week, tab)?.wd ?? zeiten[tab].wd)',
    ersetzen: 'return versatzAbMontag(zeiten[tab].wd)',
  },
  {
    id: 'termin-sonntag-ist-null',
    datei: 'src/data/meeting-dates.ts',
    regel: 'Der Sonntag ist die 0 — eine auf ihn verlegte Zusammenkunft gilt trotzdem.',
    suchen: 'return versatzAbMontag(abweichung(week, tab)?.wd ?? zeiten[tab].wd)',
    ersetzen: 'return versatzAbMontag(abweichung(week, tab)?.wd || zeiten[tab].wd)',
  },
  {
    id: 'uhrzeit-rangfolge',
    datei: 'src/data/meeting-dates.ts',
    regel: 'Dieselbe Rangfolge gilt für die Uhrzeit wie für den Tag.',
    suchen: 'return abweichung(week, tab)?.time ?? zeiten[tab].time',
    ersetzen: 'return zeiten[tab].time',
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
    // Der Rückfall auf die erste Zahl der Meta-Zeile ist weg — die Regel kann
    // hier nicht mehr verletzt werden. Gemessen wird deshalb, dass die Dauer
    // überhaupt ankommt: Ohne sie zeigt der Planen-Screen keine Minuten-Knöpfe.
    regel: 'Die Dauer kommt aus dem Feld `mins` (T32).',
    suchen: "  return typeof item.mins === 'number' ? item.mins : null",
    ersetzen: '  return null',
  },
  {
    id: 'ziffern-jeder-satz',
    datei: 'src/data/ziffern.ts',
    regel: 'Der Wert einer Ziffer stimmt in JEDEM Satz — auch in einem, der direkt an den nächsten grenzt.',
    suchen: '  return ziffernTabelle().get(c) ?? ziffernWertGezaehlt(c)',
    ersetzen: '  return ziffernWertGezaehlt(c)',
  },
  {
    id: 'ziffern-parser-jeder-satz',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Auch der Import liest jeden Ziffernsatz richtig — die Zweitschrift darf nicht zurückfallen.',
    suchen: '  const bekannt = ziffernTabelle().get(c)\n  if (bekannt !== undefined) return bekannt',
    ersetzen: '',
  },

  // ── Nicht besetzbar (Engpass) ─────────────────────────────────────────────
  {
    id: 'engpass-nur-wenn-sicher',
    datei: 'src/data/bedarf.ts',
    regel: 'Gewarnt wird erst, wenn WENIGER Leute da sind als Plätze — nicht schon bei gleich vielen.',
    suchen: 'if (verfuegbar >= benoetigt) continue',
    ersetzen: 'if (verfuegbar > benoetigt) continue',
  },
  {
    id: 'engpass-zaehlt-abwesende-mit',
    datei: 'src/data/bedarf.ts',
    regel: 'Verfügbar ist, wer qualifiziert UND an diesem Tag da ist.',
    suchen: 'const verfuegbar = qualifizierte.filter((p) => !istAbwesend(abwesend, p.id, wi, tab)).length',
    ersetzen: 'const verfuegbar = qualifizierte.length',
  },

  // ── Abwesenheiten ─────────────────────────────────────────────────────────
  {
    id: 'abwesenheit-gehoert-der-person',
    datei: 'src/components/abwesenheiten.ts',
    regel: 'Die eigenen Abwesenheiten (Profil) hängen an der Person, nicht am Ersteller.',
    suchen: '    ? absences.filter((a) => (a.personId != null ? a.personId === wer.personId : a.userId === wer.userId))',
    ersetzen: '    ? absences.filter((a) => a.userId === wer.userId || a.personId === wer.personId)',
  },
  {
    id: 'admin-schalter-zeigt-wirksames-recht',
    datei: 'src/data/rechte.ts',
    regel: 'Der Admin-Schalter (und die Marke in der Liste) zeigt das Recht des Kontos, nicht die Vormerkung an der Person.',
    suchen: '  return { admin: konten.some((m) => m.planner), planer: konten.some((m) => m.zuteiler) }',
    ersetzen: '  return { admin: Boolean(person.plannerVorgemerkt), planer: konten.some((m) => m.zuteiler) }',
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
    /*
     * Hier stand `fs-kennung-altbestand`: „Gespeicherte Treffpunkte werden beim
     * Laden auf die stabile Kennung gehoben." Die Hebung ist mit der
     * Altlasten-Räumung (T104) weggefallen — es gibt keinen Altbestand mehr, den
     * sie heben müsste. Der Eintrag zeigte danach ins Leere und fiel erst am
     * 18. September 2026 auf: Diese Probe läuft nicht in der CI (siehe Kopf).
     */
    id: 'fs-gruppe-null-ist-versammlung',
    datei: 'src/data/fs.ts',
    regel: 'Ein Treffpunkt ohne Gruppe gehört der Versammlung — und den sieht jeder.',
    suchen: '  return insts.filter((inst) => inst.grp == null || meine.has(inst.grp))',
    ersetzen: '  return insts.filter((inst) => meine.has(inst.grp ?? ""))',
  },
  {
    /*
     * Hier stand `fs-schluessel-altbestand`: „Die Bestätigung eines Treffpunkts
     * wandert auf den stabilen Schlüssel mit." Auch diese Umbenennung ist mit
     * T104 weggefallen — es gibt nur noch eine Form des Schlüssels. Aufgefallen
     * am 18. September 2026, aus demselben Grund wie der Eintrag darüber.
     */
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
    suchen: '  return insts.filter((inst) => inst.grp == null || meine.has(inst.grp))',
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
  {
    id: 'fs-zusage-verfaellt-mit-leiter',
    datei: 'src/app/reducer.ts',
    regel: 'Leitet jemand anderes den Treffpunkt, erbt er die Zusage des Vorgängers nicht.',
    suchen: 'const next = ohneEntzogene(state, ohneVerwaisteTreffpunktZusagen(state, baseReducer(state, action)))',
    ersetzen: 'const next = ohneEntzogene(state, baseReducer(state, action))',
  },
  {
    id: 'fs-zusage-person-nicht-name',
    datei: 'src/data/fs.ts',
    regel: 'Wer als Treffpunkt-Leiter umbenannt wird, behält seine Zusage — die Person-Id entscheidet.',
    suchen: 'return dieselbePerson({ name: a.leader, pid: a.lpid }, { name: b.leader, pid: b.lpid })',
    ersetzen: 'return a.leader === b.leader',
  },
  {
    id: 'fs-zusage-freitext',
    datei: 'src/data/fs.ts',
    regel: 'Ein Freitext-Leiter übernimmt keine Zusage, auch nicht unter demselben Namen.',
    suchen: 'if (!b.leader || Boolean(a.lext) !== Boolean(b.lext)) return false',
    ersetzen: 'if (!b.leader) return false',
  },
  {
    id: 'fs-zusage-datenbank',
    datei: 'src/app/persist.ts',
    regel: 'Die verfallene Treffpunkt-Zusage verschwindet auch aus der Datenbank, nicht nur aus dem Zustand.',
    suchen: '    if (keys?.size) deleteConfirmationRows(congId, [...keys])\n',
    ersetzen: '    void keys\n',
  },
  {
    id: 'fs-zusage-erst-mit-schreiben',
    datei: 'src/app/persist.ts',
    regel: 'Bei gebündeltem Schreiben wartet das Löschen der Zusage auf die Woche — sonst fehlt sie nach einem Abbruch.',
    suchen: '  fsZusagenVormerken(week.start, verwaist)\n  fsWeekSaves.schedule(',
    ersetzen: '  const sofortWeg = verwaist.get(week.start)\n  if (sofortWeg) deleteConfirmationRows(congId, sofortWeg)\n  fsWeekSaves.schedule(',
  },
  {
    id: 'fs-zusage-laden-zustand',
    datei: 'src/app/reducer.ts',
    regel: 'Das Laden räumt keine Zusagen ab — die eines anderswo eingeteilten Leiters kommt mit und bleibt.',
    suchen: "if (action.type === 'hydrate') return withDerivedTasks(baseReducer(state, action), true)",
    ersetzen:
      "if (action.type === 'hydrate') return withDerivedTasks(ohneVerwaisteTreffpunktZusagen(state, baseReducer(state, action)), true)",
  },
  {
    id: 'fs-regen-freitext',
    datei: 'src/data/fs.ts',
    regel: 'Der Freitext-Leiter bleibt Freitext, wenn der Grundplan die Woche neu erzeugt — beim Laden wie beim Ändern.',
    suchen: '    ...(inst.lext ? { lext: true } : {}),\n',
    ersetzen: '',
  },
  {
    id: 'fs-regen-person',
    datei: 'src/data/fs.ts',
    regel: 'Der Treffpunkt-Leiter behält beim Neuerzeugen aus dem Grundplan seine Person-Id.',
    suchen: '    ...(inst.lpid ? { lpid: inst.lpid } : {}),\n',
    ersetzen: '',
  },
  {
    id: 'zuteilung-namensvetter',
    datei: 'src/data/planning.ts',
    regel: 'Wird ein Platz an einen Namensvetter umgeteilt, verfällt die Zusage — die Person-Id entscheidet, nicht der Name.',
    suchen: '  return dieselbePerson(vorher, nachher)\n',
    ersetzen: '  return vorher.name === nachher.name\n',
  },

  // ── Ampel-Punkt im Planen ─────────────────────────────────────────────────
  {
    id: 'ampel-je-platz-woche',
    datei: 'src/planen/useZusage.ts',
    regel: 'Der Ampel-Punkt sucht die Zusage unter der Wochen-Kennung, nicht unter der Position.',
    suchen: "const woche = week?.start ?? ''",
    ersetzen: 'const woche = String(state.week)',
  },
  {
    id: 'ampel-treffpunkt-woche',
    datei: 'src/planen/useZusage.ts',
    regel: 'Auch am Treffpunkt: Zusage unter dem Montag der Woche, nicht unter der Position.',
    suchen: 'stand(fsTaskKey(woche, inst.id)),',
    ersetzen: 'stand(fsTaskKey(String(state.week), inst.id)),',
  },
  {
    id: 'ampel-ausgefallen',
    datei: 'src/planen/useZusage.ts',
    regel: 'Eine ausgefallene Zusammenkunft trägt keine Ampel-Punkte — es gibt dort nichts zu bestätigen.',
    suchen: 'moeglich: (tab: MeetingKey): boolean => !istAusgefallen(week, tab),',
    ersetzen: 'moeglich: (_tab: MeetingKey): boolean => true,',
  },
  {
    id: 'ampel-absage-rot',
    datei: 'src/data/planning.ts',
    regel: 'Eine Absage ist rot — nicht gelb wie eine ausstehende Antwort.',
    suchen: "return confirmations[key] ?? 'offen'",
    ersetzen: "return confirmations[key] === 'bestätigt' ? 'bestätigt' : 'offen'",
  },
  // Hier standen drei Einträge zu `SlotChip` (Stufe, Vorlesen, geschütztes
  // Leerzeichen). Seit T121 Phase 5e ist jeder Platz eine `PlatzZeile` — die
  // Stufe bewachen dort `plan-platz-*`.

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
    datei: 'supabase/functions/_shared/i18n/translate.ts',
    regel: 'Monatsnamen werden in Lang- UND Kurztabelle nachgeschlagen (T1).',
    suchen: 'const monatIndex = (name: string): number | undefined => MON[name] ?? MONA[name]',
    ersetzen: 'const monatIndex = (name: string): number | undefined => MON[name]',
  },
  {
    id: 'mitteilungstitel-schluessel',
    datei: 'src/i18n/ui.ts',
    regel: 'Jeder erzeugte Mitteilungs-Titel hat seinen Wörterbuch-Schlüssel — sonst steht er in 33 Sprachen deutsch in der Glocke.',
    suchen: "  'Programm importiert': 'notifProgImportiert',\n",
    ersetzen: '',
  },
  {
    id: 'datum-gregorianisch',
    datei: 'supabase/functions/_shared/i18n/locales.ts',
    regel: 'Datumsangaben stehen in jeder Sprache im gregorianischen Kalender — auch auf Persisch.',
    suchen: "fa: 'fa-IR-u-ca-gregory'",
    ersetzen: "fa: 'fa-IR'",
  },
  {
    id: 'sprache-am-html',
    datei: 'src/app/store.tsx',
    regel: 'Die Schreibrichtung folgt der Sprache — RTL für Arabisch, Hebräisch, Farsi, Urdu.',
    suchen: "document.documentElement.dir = isRTL(state.lang) ? 'rtl' : 'ltr'",
    ersetzen: "document.documentElement.dir = 'ltr'",
  },
  {
    id: 'toast-in-der-lesersprache',
    datei: 'src/app/reducer.ts',
    regel: 'Die Meldungen des Reducers stehen in der Sprache des Nutzers, nicht auf Deutsch.',
    suchen: 'return nextToast(state, fill(dict(state.lang)[key], params ?? {}))',
    ersetzen: "return nextToast(state, fill(dict('de')[key], params ?? {}))",
  },
  {
    id: 's89-bibellesung-am-bereich',
    datei: 'supabase/functions/_shared/freie-plaetze.ts',
    regel: 'Die Bibellesung wird am Bereich erkannt, nicht am deutschen Titel — sonst fehlt der S-89-Zettel in jeder anderen Sprache.',
    // Der Titel-Rückfall (`item.title.startsWith('Bibellesung')`) ist am
    // 25.9.2026 entfallen — er stand nur für Bestandswochen ohne Bereich, die
    // es seit dem Neuaufbau (T105) nicht mehr gibt. Seit dem 4.10.2026 fragen
    // S-89 und Zusätzliche Klasse dieselbe Menge (`istSchuelerBereich`); sie
    // steht seither im geteilten Edge-Ordner, weil auch „Freie Plätze" (Client
    // und Server) sie fragt.
    suchen: "  'bibellesung',\n  'schulung',\n",
    ersetzen: "  'schulung',\n",
  },
  {
    id: 's89-schuelervortrag',
    datei: 'supabase/functions/_shared/freie-plaetze.ts',
    regel: 'Der Vortrag eines Schülers bleibt Schülerteil, obwohl er einen eigenen Bereich hat — Zusätzliche Klasse und S-89-Zettel.',
    suchen: "  'schulungVortrag',\n])",
    ersetzen: '])',
  },
  {
    id: 's89-rahmen-an-der-form',
    datei: 'src/data/planning.ts',
    regel: 'Der Rahmen eines Schülerteils ist das Meta-Stück ohne Ziffer — keine deutsche Wortliste.',
    suchen: "const setting = metaFrags.find((f) => f !== '' && ersteZahl(f) === null) ?? ''",
    ersetzen: "const setting = metaFrags.find((f) => f === 'Von Haus zu Haus') ?? ''",
  },
  {
    id: 's89-quelle-hinter-der-dauer',
    datei: 'src/data/planning.ts',
    regel: 'Der Schulungspunkt ist das Meta-Stück hinter der Dauer — nicht das mit „th"/„lmd" davor (die Kürzel werden mitübersetzt).',
    suchen: "const point = (zeitIdx >= 0 ? metaFrags[zeitIdx + 1] : undefined) ?? ''",
    ersetzen: "const point = metaFrags.find((f) => /^(th|lmd) /.test(f)) ?? ''",
  },
  {
    id: 'programm-block-an-der-art',
    datei: 'src/programm/programm-zeilen.ts',
    regel: 'Eröffnung und Abschluss werden an der Abschnitts-Art erkannt, nicht am Namen.',
    suchen: 'const sammeltitel = rawSection ? istBlockSektion(rawSection) : false',
    ersetzen: 'const sammeltitel = false',
  },
  {
    id: 'wischen-leserichtung',
    datei: 'src/components/useSwipeWeek.ts',
    regel: 'Der Wochenwisch folgt der Leserichtung — in RTL liegt die vorige Woche rechts.',
    suchen: "      document.documentElement.dir === 'rtl' ? -1 : 1",
    ersetzen: '      1',
  },
  {
    id: 'pfeil-leserichtung',
    datei: 'src/bausteine/bausteine.css',
    regel: 'Die Pfeile (Wochen, Monate, Zurück) kippen in RTL — sonst zeigt „vorige Woche" nach vorn.',
    suchen: "[dir='rtl'] .zeichen.is-richtung {\n  transform: scaleX(-1);\n}",
    ersetzen: "[dir='rtl'] .zeichen.is-richtung {\n  transform: none;\n}",
  },
  {
    id: 'streifen-leserichtung',
    datei: 'src/components/week-strip.css',
    regel: 'Die Nachbarwochen liegen in Leserichtung — logisch angegeben, nicht physisch.',
    suchen: '  inset-inline-end: 100%;',
    ersetzen: '  right: 100%;',
  },
  {
    id: 'bidi-eigene-texte',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: 'Personenfelder tragen ihre eigene Schreibrichtung — eine Telefonnummer dreht sich sonst in einer RTL-Oberfläche um.',
    suchen: '            type="tel"\n            dir="auto"\n',
    ersetzen: '            type="tel"\n',
  },
  {
    id: 'datumswaehler-montag',
    datei: 'src/components/kalender.ts',
    regel: 'Der Kalender beginnt in jeder Sprache am Montag — wie die Programmwoche selbst.',
    suchen: '  const start = Date.UTC(y, m, 1 - versatzAbMontag(erster.getUTCDay()))',
    ersetzen: '  const start = Date.UTC(y, m, 1 - erster.getUTCDay())',
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
    /*
     * Hier stand `erinnerung-fs-kennung`: „Der Versand greift nach der stabilen
     * Treffpunkt-Kennung, **auch im Altbestand**." Das Heben aus dem Altbestand
     * (`stabileKennung`) ist mit T104 weggefallen; der Schlüssel hat nur noch
     * eine Form. Gemessen wird stattdessen, dass ein Freitext-Leiter keine
     * Erinnerung bekommt — die Regel, die an derselben Aufzählung hängt (T63).
     */
    id: 'erinnerung-fs-freitext-leiter',
    // Seit T99 in `_shared/zuteilungen.ts`: `send-plan` zählt dieselben Plätze
    // auf wie `send-reminders`, und zwei Fassungen einer solchen Aufzählung
    // waren hier schon die Ursache eines Fehlers (B8/T40).
    datei: 'supabase/functions/_shared/zuteilungen.ts',
    regel: 'Ein auswärtiger Leiter (Freitext) bekommt keine Erinnerung (T63).',
    suchen: '    if (!inst?.leader || inst.lext) continue',
    ersetzen: '    if (!inst?.leader) continue',
  },
  {
    id: 'erinnerung-letzte-ist-letzte',
    datei: 'supabase/functions/_shared/erinnerung.ts',
    regel: 'Die Wiederholung deckt die Tage zwischen erster und letzter Erinnerung ab — nicht die danach.',
    suchen: '  return days > frueh && days < spaet ? \'repeat\' : null',
    ersetzen: '  return days < spaet ? \'repeat\' : null',
  },
  {
    id: 'ersatz-nur-qualifizierte',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Übernehmen darf nur, wer für den Dienst freigegeben ist.',
    suchen: "if (!callerPerson || !callerPerson.priv?.[qualKey]) return json({ error: 'not-qualified' }, 403)",
    ersetzen: 'if (!callerPerson) return json({ error: \'not-qualified\' }, 403)',
  },
  {
    id: 'ersatz-suchen-id-vor-name',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Trägt der Platz eine Id, entscheidet sie — der Namensvetter löst keine fremde Ersatzsuche aus.',
    suchen: '(slot.pid ? slot.pid === callerPerson.id : slot.name === displayName(callerPerson))',
    ersetzen: '(slot.pid === callerPerson.id || slot.name === displayName(callerPerson))',
  },
  {
    id: 'ersatz-doch-bestaetigen-zieht-zurueck',
    datei: 'src/app/persist.ts',
    regel: '„Doch bestätigen" nach der Absage eines Hilfsdienstes nimmt das Ersatzgesuch zurück — sonst steht es bei allen Angepingten weiter (T118).',
    suchen: "      if (helperKeyParts(action.id) && prev.confirmations[action.id] === 'verhindert') {\n        substituteWithdraw(action.id)\n      }\n",
    ersetzen: '',
  },
  {
    id: 'ersatz-zurueckziehen-raeumt-glocken',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Das Zurückziehen entfernt die Zeilen „Ersatz gesucht" aus allen Glocken — nicht nur die Antwort ok (T118).',
    suchen: '      await gesuchZeilenLoeschen()\n      return json({ ok: true, withdrawn: true })',
    ersetzen: '      return json({ ok: true, withdrawn: true })',
  },
  {
    id: 'person-loeschen-nimmt-abwesenheiten-mit',
    datei: 'src/app/reducer.ts',
    regel: 'Mit der Person gehen ihre Abwesenheiten — sonst stehen sie mit toter Id im Zustand (T118).',
    suchen: '    absences: state.absences.filter((a) => a.personId !== id),\n',
    ersetzen: '',
  },
  {
    id: 'person-loeschen-abwesenheiten-datenbank',
    datei: 'src/app/persist.ts',
    regel: 'Die Abwesenheiten einer gelöschten Person verschwinden auch aus der Datenbank — die nullt nur die Person (T118).',
    suchen: '  for (const a of prev.absences) if (a.personId === id) deleteAbsenceRow(a.id)\n',
    ersetzen: '',
  },
  {
    id: 'einladung-nur-planer',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Anmelde-Links stellt nur der Admin aus.',
    suchen: "if (!member?.planner) return json({ error: 'forbidden' }, 403)",
    ersetzen: "if (!member) return json({ error: 'forbidden' }, 403)",
  },
  {
    id: 'einladung-eigene-versammlung',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Links und Mails nur für Personen der eigenen Versammlung — kein offenes Mail-Relay.',
    suchen: '        `persons?select=id,fn,mail&congregation_id=eq.${wert(cong)}&id=in.(${ids.map(wert).join(\',\')})`,',
    ersetzen: '        `persons?select=id,fn,mail&id=in.(${ids.map(wert).join(\',\')})`,',
  },
  {
    id: 'einladung-ohne-absender',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Ohne verifizierten Absender geht keine Mail hinaus — Links gibt es trotzdem.',
    suchen: '    const bereit = mailBereit(MAIL)\n',
    ersetzen: '    const bereit = true\n',
  },
  {
    id: 'erinnerung-rumpf-uebersetzt',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Der Rumpf einer Push-Erinnerung steht in der Sprache des Geräts — nicht nur ihr Titel.',
    suchen: 'body: entries.map((e) => uebersetzt(e, tr)).join(\' · \'),',
    ersetzen: "body: entries.map(kanonisch).join(' · '),",
  },
  {
    id: 'erinnerung-schriftstelle',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Auch der Buchname einer Schriftstelle wird übersetzt — die Tabellen werden vor dem Bauen geholt.',
    suchen: '    await bibelbuecherLaden()',
    ersetzen: '',
  },
  {
    id: 'einladung-sprache',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Die Mail mit dem Link spricht die Sprache der Versammlung, nicht immer Deutsch.',
    suchen: '        const mail = linkMail(lang, {',
    ersetzen: "        const mail = linkMail('de', {",
  },
  {
    id: 'einladung-texte-vollstaendig',
    datei: 'supabase/functions/_shared/anmelde-texte.ts',
    regel: 'Jede App-Sprache hat ihren eigenen Text der Link-Mail — kein stiller Rückfall auf Deutsch.',
    suchen: '  it: {\n',
    ersetzen: '  itX: {\n',
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
  {
    id: 'import-besprechung-kein-schuelerteil',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Eine Besprechung unter „Uns im Dienst verbessern" ist keine Schulungsaufgabe — sie bekommt den Platz eines Bruders.',
    suchen: '  if (BESPRECHUNG_RE.test(form)) return besprechungsPlatz()\n',
    ersetzen: '',
  },
  {
    id: 'import-szene-mit-partner',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Eine gespielte Szene bekommt Schüler und Partner — sie ist kein Vortrag nur für Brüder.',
    suchen: '  if (SZENE_RE.test(form)) return convo\n',
    ersetzen: '',
  },
  {
    id: 'import-vortrag-nur-brueder',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Einen Vortrag hält ein Bruder — die Form gilt vor dem Titel.',
    suchen: '  if (VORTRAG_RE.test(form)) return [talk]\n',
    ersetzen: '',
  },
  // Die Trennung vom 4.10.2026: Vortrag, Besprechung und Vortrag eines Schülers
  // sind drei Bereiche. Fiele einer zurück, stünde wieder jeder, der einen davon
  // kann, für alle drei zur Wahl.
  {
    id: 'import-schaetze-erster-ist-vortrag',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Der erste Schätze-Punkt ist der Vortrag, die übrigen sind Besprechungen — über die Position, nicht den Text.',
    suchen: "else if (color === 'teal' && rec === firstOf.teal) part.names = vortragsPlatz()",
    ersetzen: "else if (color === 'teal' && rec === lastOf.teal) part.names = vortragsPlatz()",
  },
  {
    id: 'import-besprechung-eigener-bereich',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Graben, Besprechungen und „Unser Leben als Christ" tragen „Besprechungen leiten", nicht den Bereich des Vortrags.',
    suchen: "  return [{ name: '', bereichsKey: 'besprechung' }]\n",
    ersetzen: "  return [{ name: '', bereichsKey: 'vortrag' }]\n",
  },
  {
    id: 'import-schuelervortrag-eigener-bereich',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Der Vortrag eines Schülers hat seinen eigenen Bereich — wer Gespräche führt, hält nicht zwingend Vorträge.',
    suchen: "const talk = { name: '', bereichsKey: 'schulungVortrag', male: true }",
    ersetzen: "const talk = { name: '', bereichsKey: 'schulung', male: true }",
  },
  {
    id: 'lac-eigener-punkt-besprechung',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Ein eigener Punkt unter „Unser Leben als Christ" bekommt denselben Bereich wie die importierten dort.',
    suchen: "names: [{ name: '', bereichsKey: 'besprechung' }] }",
    ersetzen: "names: [{ name: '', bereichsKey: 'studium' }] }",
  },
  {
    id: 'redner-nach-stellung',
    datei: 'src/planen/kandidaten.ts',
    regel: 'Am Redner-Platz stehen alle Ältesten und Dienstamtgehilfen zur Wahl — nach Stellung, nicht nach Bereich.',
    suchen: "    sel.kind === 'part' && sel.guest\n",
    ersetzen: '    false\n',
  },
  {
    id: 'engpass-ohne-eigenen-redner',
    datei: 'src/data/bedarf.ts',
    regel: 'Auch der eigene Redner ist kein Engpass — er braucht keinen Bereich mehr.',
    suchen: '    if (isSpeakerRole(platz.slot.rolle)) continue\n',
    ersetzen: "    if (isSpeakerRole(platz.slot.rolle) && platz.slot.rolle !== 'Redner') continue\n",
  },

  // ── Rechte und Bedienung ──────────────────────────────────────────────────
  // Die Rechteprüfung steht an zwei Stellen: der Wächter im Reducer weist eine
  // gesperrte Ansicht ab, die Navigationsliste entscheidet, welcher Eintrag
  // überhaupt dasteht. Der Wächter war bewacht, die Liste bis dahin nicht.
  {
    id: 'nav-gruppenaufseher-ohne-personen',
    // Wer welchen Bildschirm betreten darf, entscheidet inzwischen
    // `erlaubteScreens` in `data/rechte.ts` — der Shell blieb nur das Zeichnen.
    datei: 'src/data/rechte.ts',
    // Seit dem 4.10.2026 dieselbe Zeile für Planer und Gruppenaufseher.
    regel: 'Planer und Gruppenaufseher sehen Planen, aber nicht Personen.',
    // Die Mutation nimmt den Abzug weg und gibt ihnen die Personen mit dazu.
    suchen: "  const ohneVerwaltung = ALLE.filter((s) => s !== 'personen' && s !== 'einstellungen')",
    ersetzen: "  const ohneVerwaltung = ALLE.filter((s) => s !== 'einstellungen')",
  },
  {
    id: 'nav-gruppenaufseher-ohne-einstellungen',
    datei: 'src/data/rechte.ts',
    // Bis T120 bekam er sie für den Grundplan seiner Gruppe; der steht seitdem
    // im Predigtdienst. Ein Rest-Eintrag führte in eine leere Seite.
    regel: 'Planer und Gruppenaufseher sehen keine Einstellungen — die gehören dem Admin.',
    suchen: "  const ohneVerwaltung = ALLE.filter((s) => s !== 'personen' && s !== 'einstellungen')",
    ersetzen: "  const ohneVerwaltung = ALLE.filter((s) => s !== 'personen')",
  },
  {
    id: 'nav-wochen-nur-wer-zuteilt',
    datei: 'src/data/rechte.ts',
    // T121, Phase 10: Die Seite aller Wochen gilt den Zusammenkünften.
    regel: 'Die Seite aller Wochen sieht nur, wer zuteilt — der Gruppenaufseher plant allein Treffpunkte.',
    suchen: "  if (r.gruppe !== null) return ohneVerwaltung.filter((s) => s !== 'planung')",
    ersetzen: '  if (r.gruppe !== null) return ohneVerwaltung',
  },
  // ── Rechte-Stufe „Planer" (4.10.2026) ──────────────────────────────────────
  // Zuteilen und Plan ändern sind dieselbe Zeile. Die Grenze zieht der Server:
  // die Edge Function `zuteilen` für die Wochen, die Datenbank für Treffpunkte,
  // Weitere Pläne und Gruppenbesuche.
  {
    id: 'rechte-admin-hat-planer-schalter-an',
    datei: 'src/personen/PrivToggle.tsx',
    regel: 'Beim Admin steht der Planer-Schalter an — er hat das Recht ohnehin.',
    suchen: '        an={admin || planer}\n',
    ersetzen: '        an={planer}\n',
  },
  {
    id: 'ersatz-gefunden-auch-an-planer',
    datei: 'supabase/functions/substitute/index.ts',
    regel: '„Ersatz gefunden" erreicht Admins und Planer — wer zuteilt, sucht den Ersatz.',
    suchen: '      ...members.filter((m) => m.planner || m.zuteiler).map((m) => m.user_id),',
    ersetzen: '      ...members.filter((m) => m.planner).map((m) => m.user_id),',
  },
  {
    id: 'unerreichbar-auch-an-planer',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Wer nicht erreichbar ist, nennt die Erinnerung auch dem Planer.',
    suchen: '          if (!m.planner && !m.zuteiler) continue',
    ersetzen: '          if (!m.planner) continue',
  },
  {
    id: 'schema-wochen-admin-und-planer',
    datei: 'supabase/schema.sql',
    regel: 'Wochen schreiben Admin und Planer — wer die Woche plant, holt und richtet sie ein.',
    suchen: '  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())\n  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());\n\n-- Abwesenheiten',
    ersetzen: '  using (congregation_id = public.my_congregation_id() and public.is_planner())\n  with check (congregation_id = public.my_congregation_id() and public.is_planner());\n\n-- Abwesenheiten',
  },
  {
    id: 'schema-aufseher-fremde-leiter',
    datei: 'supabase/schema.sql',
    regel: 'Der Gruppenaufseher setzt keinen Leiter einer fremden Gruppe — nur die Person-Id einer Bindung zählt nicht.',
    suchen: '  select coalesce(jsonb_agg(e.i - \'lpid\' order by e.i ->> \'id\'), \'[]\'::jsonb)',
    ersetzen: '  select coalesce(jsonb_agg(e.i - \'lpid\' - \'leader\' order by e.i ->> \'id\'), \'[]\'::jsonb)',
  },
  {
    id: 'schema-grundplan-eigene-gruppe',
    datei: 'supabase/schema.sql',
    regel: 'Den Grundplan pflegt der Gruppenaufseher nur für seine Gruppe.',
    suchen: '  using (congregation_id = public.my_congregation_id() and (public.darf_zuteilen() or grp = any (public.eigene_gruppen())))',
    ersetzen: '  using (congregation_id = public.my_congregation_id() and (public.darf_zuteilen() or public.is_group_overseer()))',
  },
  {
    id: 'gb-planen-wer-plant',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Besuche legen Admin und Planer an.',
    suchen: '  const admin = rechteVon(state).zuteilen\n',
    ersetzen: '  const admin = state.planner\n',
  },
  {
    id: 'gb-verlegen-wer-plant',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Woche und Gruppe eines Besuchs verlegen und streichen Admin und Planer.',
    suchen: '  const verlegen = rechteVon(state).zuteilen\n',
    ersetzen: '  const verlegen = state.planner\n',
  },
  {
    id: 'wp-plan-aendern-wer-plant',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Name, Zeitraum, Takt, Veröffentlichen und Löschen eines Plans für Admin und Planer.',
    suchen: '  const admin = rechteVon(state).zuteilen\n',
    ersetzen: '  const admin = state.planner\n',
  },
  {
    id: 'wp-anlegen-wer-plant',
    datei: 'src/planen/WeiterePlaenePlan.tsx',
    regel: 'Einen Weiteren Plan legen Admin und Planer an.',
    suchen: '      {rechteVon(state).zuteilen && (\n        <button type="button" className="knopf-neu" onClick={anlegen}>',
    ersetzen: '      {state.planner && (\n        <button type="button" className="knopf-neu" onClick={anlegen}>',
  },
  {
    id: 'plan-senden-auch-beim-planer',
    datei: 'src/planen/wochen-versand.ts',
    regel: '„Plan senden" steht bei jedem, der zuteilt — auch beim Planer.',
    suchen: '  return rechteVon(state).zuteilen && !state.staleAt',
    ersetzen: '  return state.planner && !state.staleAt',
  },
  {
    id: 'rechte-planer-ist-kein-admin',
    datei: 'src/data/rechte.ts',
    // Die Stufe „Planer" (4.10.2026): zuteilen ja, den Plan ändern nein.
    regel: 'Das Planer-Recht macht niemanden zum Admin.',
    suchen: '    admin: s.planner,\n',
    ersetzen: '    admin: s.planner || s.zuteiler,\n',
  },
  {
    id: 'rechte-admin-teilt-zu',
    datei: 'src/data/rechte.ts',
    regel: 'Der Admin teilt zu, auch ohne das Planer-Recht eigens zu tragen.',
    suchen: '    zuteilen: s.planner || s.zuteiler,\n',
    ersetzen: '    zuteilen: s.zuteiler,\n',
  },
  // Die Mitgliedsrechte-Probe misst die Rechte-Stufen an der echten Datenbank
  // (4.10.2026). Misst sie daneben, meldet sie eine Grenze als gemessen, die
  // sie nie berührt hat — deshalb sind auch ihre eigenen Regeln bewacht.
  {
    id: 'probe-eigene-mitgliedszeile',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Die Probe liest die eigene Mitgliedszeile — einem Admin zeigt members alle Zeilen seiner Versammlung.',
    suchen: 'members?select=congregation_id,person_id,planner,zuteiler&user_id=eq.${user.id}`)',
    ersetzen: 'members?select=congregation_id,person_id,planner,zuteiler`)',
  },
  {
    id: 'probe-zuteilung-nur-besetzung',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Die Zuteilung der Probe ändert nur die Besetzung — sonst hieße (40) „zu streng", wo nichts zu streng ist.',
    suchen: "    platz.name = ''\n",
    ersetzen: "    platz.name = ''\n    platz.rolle = 'Probe'\n",
  },
  {
    id: 'probe-ohne-person-leitet-nichts',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Ein Konto ohne Person leitet keine Gruppe — auch keine ohne Aufseher.',
    suchen: '  const leitet = (g, pid) => Boolean(pid) && (g.overseer_id === pid || g.assistant_id === pid)\n',
    ersetzen: '  const leitet = (g, pid) => g.overseer_id === pid || g.assistant_id === pid\n',
  },
  {
    id: 'probe-tuer-dahinter-durchgelassen',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Antwortet eine Function erst hinter ihrer Rechteprüfung („keine Woche"), hat sie durchgelassen.',
    suchen: '  const durch = a.status < 400 || nachDerTuer.includes(fehler)\n',
    ersetzen: '  const durch = a.status < 400\n',
  },
  // „Schicht geändert" an der Tür von send-plan (5.10.2026): (62)–(64).
  {
    id: 'probe-stellt-zurueck',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Kam ein Änderungsversuch durch, stellt der Admin den vorigen Stand wieder her.',
    suchen: '  await k.aufraeumen(e, zurueck, ZURUECK)\n',
    ersetzen: '\n',
  },
  {
    id: 'probe-fremde-treffpunkt-woche-unberuehrt',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Eine Treffpunkt-Woche, die nicht von der Probe ist, wird nicht überschrieben.',
    suchen: "  } else if (Array.isArray(bestand) && bestand.some((i) => !String(i?.id ?? '').startsWith('PROBE-'))) {\n",
    ersetzen: '  } else if (false) {\n',
  },
  {
    id: 'probe-loescht-nur-eigene-treffpunkt-woche',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Gelöscht wird die Treffpunkt-Woche nur, wenn die Probe sie angelegt hat.',
    suchen: '    ...(merker.treffpunktWoche\n',
    ersetzen: '    ...(true\n',
  },
  {
    id: 'testversammlung-planer-stufe',
    datei: 'scripts/testversammlung-anlegen.mjs',
    regel: 'Das Planer-Konto der Testversammlung trägt seine Stufe in members — sonst misst die Probe sie nicht.',
    suchen: 'planner: k.planner, zuteiler: k.zuteiler, email: k.mail }',
    ersetzen: 'planner: k.planner, email: k.mail }',
  },
  {
    id: 'testversammlung-aufseher-leitet',
    datei: 'scripts/testversammlung-anlegen.mjs',
    regel: 'Der Gruppenaufseher der Testversammlung leitet eine Gruppe.',
    suchen: "person: ['Thomas', 'Ebersbach'] }",
    ersetzen: "person: ['Peter', 'Ostermann'] }",
  },
  // Die Kontendatei (5.10.2026): Kennwörter von Skript zu Skript, nicht über den Bildschirm.
  {
    id: 'testversammlung-schreibt-kontendatei',
    datei: 'scripts/testversammlung-anlegen.mjs',
    regel: 'Das Anlege-Skript schreibt Versammlung und Kennwörter in die Kontendatei.',
    suchen: '    fs.writeFileSync(probeDatei(), probeDateiText(cong.id, konten), { mode: 0o600 })\n',
    ersetzen: '    void probeDateiText\n',
  },
  {
    id: 'testversammlung-kennwoerter-nicht-auf-bildschirm',
    datei: 'scripts/testversammlung-anlegen.mjs',
    regel: 'Steht die Kontendatei, stehen die Kennwörter nicht auf dem Bildschirm.',
    suchen: '    for (const k of konten) console.log(`  ${k.mail}   ${k.stufe} · ${k.person}`)\n',
    ersetzen: '    for (const k of konten) console.log(`  ${k.mail}  ${k.pass}   ${k.stufe} · ${k.person}`)\n',
  },
  {
    id: 'testversammlung-kontendatei-nur-eigene',
    datei: 'scripts/testversammlung-anlegen.mjs',
    regel: '--entfernen löscht die Kontendatei nur mit ihrer eigenen Versammlung.',
    suchen: '  if (versammlungDerKontendatei() === id) {\n',
    ersetzen: '  if (true) {\n',
  },
  {
    id: 'probe-liest-kontendatei',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Die Probe nimmt Versammlung und Konten aus der Kontendatei des Anlege-Skripts.',
    suchen: '  return zugangAus(process.env, (name) => wertAusEnvDatei(name), (name) => wertAusEnvDatei(name, [probeDatei()]))\n',
    ersetzen: '  return zugangAus(process.env, (name) => wertAusEnvDatei(name))\n',
  },
  {
    id: 'nachladen-laesst-predigtdienst-stehen',
    datei: 'src/app/reducer.ts',
    // Seit T120 führt das Menü ohne Reiterwahl in den Predigtdienst; vorher
    // schützte die Wahl (`terminGewaehlt`) davor.
    regel: 'Ein stilles Nachladen wirft nicht aus dem Predigtdienst in die Zusammenkünfte.',
    // Seit dem 3.10.2026 positiv aufgezählt: Die Mutation lässt den Reiter springen.
    suchen: "const NACHLADEN_DARF_SPRINGEN: ReadonlySet<MeetingTab> = new Set<MeetingTab>(['mid', 'we', 'edit'])",
    ersetzen: "const NACHLADEN_DARF_SPRINGEN: ReadonlySet<MeetingTab> = new Set<MeetingTab>(['mid', 'we', 'edit', 'fs'])",
  },
  {
    id: 'nachladen-laesst-weitere-plaene-stehen',
    datei: 'src/app/reducer.ts',
    // Das Menü führt ohne Reiterwahl zu den Weiteren Plänen (T120, Phase 5).
    regel: 'Ein stilles Nachladen wirft nicht aus den Weiteren Plänen in eine Zusammenkunft.',
    suchen: "const NACHLADEN_DARF_SPRINGEN: ReadonlySet<MeetingTab> = new Set<MeetingTab>(['mid', 'we', 'edit'])",
    ersetzen: "const NACHLADEN_DARF_SPRINGEN: ReadonlySet<MeetingTab> = new Set<MeetingTab>(['mid', 'we', 'edit', 'wp'])",
  },
  // ── Gruppenbesuche des Dienstaufsehers (T120, Phase 2) ─────────────────────
  {
    id: 'besuch-ersetzt-nicht-ungefragt',
    datei: 'src/data/gruppenbesuche.ts',
    regel: 'Ein Besuch verdrängt keinen anderen Leiter ohne „Übernehmen" — dessen Zusage hinge sonst still daran.',
    suchen: '    if (inst.leader && !ersetzen) continue\n',
    ersetzen: '',
  },
  {
    id: 'import-traegt-besuch-ein',
    // Seit dem 5.10.2026 in der Einordnung, die App und Import-Skript teilen.
    datei: 'src/data/neue-woche.ts',
    regel: 'Ein vorgemerkter Besuch wird mit dem Import seiner Woche eingetragen.',
    suchen: '  const fsWeek = besucheInNeueWoche(genFsWeek(roh.start, k.fsRules), roh.start, k.gruppenbesuche, k.persons)\n',
    ersetzen: '  const fsWeek = genFsWeek(roh.start, k.fsRules)\n',
  },
  {
    id: 'ansicht-verspricht-nur-feststehendes',
    datei: 'src/programm/GruppenbesucheAnsicht.tsx',
    regel: 'Die Gruppe liest „… leitet dann euren Treffpunkt" nur, wenn es so eingetragen oder vorgemerkt ist.',
    suchen: "            const zugesagt = stand.art === 'eingetragen' || stand.art === 'vorgemerkt'",
    ersetzen: '            const zugesagt = true',
  },
  {
    id: 'planen-gruppenaufseher-nur-predigtdienst',
    datei: 'src/data/rechte.ts',
    regel: 'Der Gruppenaufseher plant nur den Predigtdienst — eine Zusammenkunft sieht er bloß an.',
    suchen: "  return r.zuteilen || (r.gruppe !== null && thema === 'predigtdienst')",
    ersetzen: '  return r.zuteilen || r.gruppe !== null',
  },
  {
    id: 'nav-deeplink-rechte',
    datei: 'src/app/AppShell.tsx',
    regel: 'Ein Push-Deep-Link führt nur in einen Bereich, den man betreten darf.',
    // Seit T109 trägt der vorgemerkte Sprung Screen und Bereich (`Sprung`).
    suchen: "const target = navScreens.includes(pendingNav.screen) ? pendingNav.screen : 'aufgaben'",
    ersetzen: 'const target = pendingNav.screen',
  },
  {
    id: 'start-termin-gerechnet',
    /*
      Der Start-Bildschirm hat seine Wochen-Karten am 19.9.2026 gegen die
      Zeitleiste getauscht und rechnet den Termin nicht mehr selbst — er zeigt
      `MyTask.date`. Die Regel ist damit nicht weg, sie ist einen Schritt nach
      hinten gewandert: in die Ableitung, die den Text erzeugt. Dort steht sie
      jetzt unter Beobachtung, und zwar für alle, die ihn lesen (Start,
      „Meine Aufgaben", Erinnerungen).
    */
    datei: 'src/data/planning.ts',
    regel: 'Der Termin einer Aufgabe wird gerechnet — importierte Wochen tragen im date-Feld nur die Wochenspanne.',
    suchen:
      "const gemeinsam = { id: key, date: meetingDateText(week, tab, zeiten), at, status: 'offen' as const }",
    ersetzen: "const gemeinsam = { id: key, date: week[tab].date, at, status: 'offen' as const }",
  },
  {
    id: 'zwei-tipp-bewaffnet-erst',
    datei: 'src/components/useZweiTipp.ts',
    regel: 'Ein zerstörender Knopf führt beim ersten Tipp nichts aus — er bewaffnet sich nur.',
    // Seit dem 25.9.2026 steht das Muster einmal im Hook; die drei Aufrufer
    // darunter prüfen, dass jeder Knopf ihn auch wirklich benutzt.
    suchen: '      if (!armed) {\n        setArmed(true)\n        return\n      }\n',
    ersetzen: '',
  },
  {
    // Bis Phase 10 an der alten Zeile `AutoAssignRow`, die seit Phase 5c
    // niemand mehr zeigte; dass erst der zweite Tipp leert, hält
    // `zwei-tipp-bewaffnet-erst` am Hook.
    id: 'leeren-fokus-weg',
    datei: 'src/planen/AutomatischBlatt.tsx',
    regel: 'Geht der Fokus von „Leeren" weg, nimmt es die Frage zurück — ein Tipp daneben leert nichts.',
    suchen: '          onClick={leeren.onClick}\n          onBlur={leeren.onBlur}\n',
    ersetzen: '          onClick={leeren.onClick}\n',
  },
  {
    id: 'person-loeschen-zwei-tipp',
    datei: 'src/personen/PersonDetail.tsx',
    regel: '„Person löschen" verlangt zwei Tipps — es löst Gruppen-, Konto- und Code-Bezüge.',
    suchen: '      <EntfernenKnopf\n        className="knopf-leise knopf-entfernen person-entfernen"\n',
    ersetzen:
      '      <button\n' +
      "        onClick={() => dispatch({ type: 'removePerson', id: person.id })}\n" +
      '        className="knopf-leise knopf-entfernen person-entfernen"\n',
  },
  {
    id: 'sheet-abwesende-gesperrt',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Ein Abwesender steht in der Liste, lässt sich aber nicht zuteilen.',
    suchen: "    if (cand.absent) {\n      dispatch({ type: 'showToast', text: fill(t.toastAbsentP, { name: cand.name }) })\n      return\n    }",
    ersetzen: '',
  },
  {
    id: 'sheet-redner-rueckweg',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Über einem eigenen Redner führt der Freitext zurück zum Gastredner (T29).',
    suchen: 'const guestBase = !rolleJetzt || eigenerRedner ? ROLE_GUEST_SPEAKER : rolleJetzt',
    ersetzen: 'const guestBase = rolleJetzt || ROLE_GUEST_SPEAKER',
  },
  {
    id: 'sheet-gruppe-ohne-pid',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Eine Gruppen-Rotation ist keine Person und bekommt keine Person-Id.',
    suchen: 'pid: sel.groups ? undefined : cand.key',
    ersetzen: 'pid: cand.key',
  },
  {
    id: 'chip-status-nur-mit-flow',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Eine Zusage hat nur, wer bestätigen kann — der Gastredner wartet nicht.',
    suchen: 'slot.name && !isGuestRole(slot.rolle) && zusage.moeglich(tab)',
    ersetzen: 'slot.name && zusage.moeglich(tab)',
  },
  {
    id: 'dialog-fokusfalle',
    datei: 'src/components/useDialogFocus.ts',
    regel: 'Der Fokus bleibt im modalen Dialog — Tab am Ende springt an den Anfang zurück.',
    suchen: '      if (e.shiftKey && document.activeElement === firstEl) {\n        e.preventDefault()\n        lastEl.focus()\n      } else if (!e.shiftKey && document.activeElement === lastEl) {\n        e.preventDefault()\n        firstEl.focus()\n      }',
    ersetzen: '      void firstEl\n      void lastEl',
  },
  {
    id: 'wischen-eine-frist',
    // Umgezogen: Die Frist lag in `useSwipeWeek`, der Zwilling `useSwipeDown`
    // hatte danebengestanden und seine eigene, ungesicherte. Jetzt teilen sich
    // beide diese eine Stelle.
    datei: 'src/components/einZeitgeber.ts',
    regel: 'Es gibt immer nur einen Zeitgeber — eine abgebrochene Bewegung räumt nicht in die nächste hinein.',
    suchen: '    spaeter: (fn, ms) => {\n      stoppen()',
    ersetzen: '    spaeter: (fn, ms) => {',
  },
  {
    id: 'push-nie-von-allein',
    datei: 'src/mitteilungen/PushKarte.tsx',
    regel: 'Die Karte für Benachrichtigungen bleibt weg, wenn Push auf diesem Gerät gar nicht erreichbar ist.',
    suchen: 'if (!supported && !needsInstall && !installAvail) return null',
    ersetzen: '',
  },
  {
    id: 'install-ereignis-verbraucht',
    datei: 'src/lib/install.ts',
    regel: 'Das Installations-Ereignis lässt sich nur einmal benutzen — danach kein Angebot mehr.',
    suchen: 'deferred = null // Event ist verbraucht und lässt sich nicht erneut nutzen',
    ersetzen: '',
  },
  {
    id: 'ref-vorlage-reicht-durch',
    datei: 'supabase/functions/_shared/i18n/translate-data.ts',
    regel: 'Eine Verweis-Vorlage gibt ihre Zahl weiter — „th Lektion 11" verliert die 11 nicht.',
    suchen: "    thLek: n => 'th study ' + n,",
    ersetzen: "    thLek: () => 'th study',",
  },

  // ── Import in fremden Sprachen ────────────────────────────────────────────
  {
    id: 'import-sprache-kein-rueckfall',
    datei: 'supabase/functions/import-week/index.ts',
    regel: 'Fehlt die Woche in der Versammlungssprache, ist das ein Fehler — kein stiller Rückfall auf Deutsch.',
    suchen:
      'if (!loc) return json({ error: `Diese Woche ist in der gewählten Sprache (${lang}) noch nicht verfügbar.` }, 404)',
    ersetzen: 'if (!loc) { /* deutsche Fassung behalten */ }',
  },
  {
    id: 'import-varianten-deckel',
    datei: 'supabase/functions/import-week/index.ts',
    regel: 'Höchstens vier Sprachvarianten je Woche — die Abrufe gegenüber jw.org bleiben überschaubar.',
    suchen: "const wanted = [...new Set(altLangs)].filter((c) => c && c !== lang).slice(0, 4)",
    ersetzen: "const wanted = [...new Set(altLangs)].filter((c) => c && c !== lang)",
  },
  {
    id: 'import-entity-numerisch',
    datei: 'supabase/functions/import-week/text.ts',
    regel: 'Numerische HTML-Entities werden dekodiert — sonst steht „Gespr&#228;che" im Programm.',
    suchen: "    if (kern[0] !== '#') return BENANNT[kern] ?? ganz\n",
    ersetzen: '    return BENANNT[kern] ?? ganz\n',
  },

  // ── Provider-Effekte ──────────────────────────────────────────────────────
  {
    id: 'schreibfehler-sperrfrist',
    datei: 'src/app/store.tsx',
    regel: 'Ein Bündel fehlgeschlagener Schreibvorgänge erzeugt EINEN Hinweis, nicht lauter sich überschreibende.',
    suchen: '      if (jetzt - zuletzt < 5000) return\n',
    ersetzen: '',
  },
  {
    id: 'konflikt-laedt-nach',
    datei: 'src/app/store.tsx',
    regel: 'Nach einem Schreibkonflikt wird der Stand der Datenbank nachgeladen (T39).',
    suchen: "      void loadAndHydrate(dispatch, uid, { silent: true }).finally(() => {\n        laeuft = false\n      })",
    ersetzen: '      laeuft = false',
  },

  // ── Bedienung, Fortsetzung ────────────────────────────────────────────────
  {
    id: 'planen-aufseher-ohne-bearbeiten',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'In die Bearbeiten-Ansicht der Woche (T64) kommt, wer plant — der Gruppenaufseher nicht.',
    suchen: 'const isEdit = state.tab === \'edit\' && rechte.zuteilen',
    ersetzen: 'const isEdit = state.tab === \'edit\'',
  },
  {
    id: 'planen-planer-mit-bearbeiten-reiter',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'Den Reiter „Woche einrichten" sehen Admin und Planer.',
    suchen: '          showEdit={rechte.zuteilen}',
    ersetzen: '          showEdit={rechte.admin}',
  },
  {
    id: 'navigate-bearbeiten-wer-plant',
    datei: 'src/app/reducer.ts',
    regel: 'Ein Sprung in „Woche einrichten" führt den Planer dorthin.',
    suchen: '        edit: screen === \'planen\' && rechte.zuteilen,',
    ersetzen: '        edit: screen === \'planen\' && rechte.admin,',
  },
  // Hier stand `planen-planer-ohne-umbau` (MeetingSection, `darfUmbauen`). Seit
  // T121 Phase 5b gibt es Minuten, Reihenfolge und eigene Punkte nur noch
  // unter „Woche einrichten" — und die zieht dieselbe Grenze, bewacht von
  // `planen-aufseher-ohne-bearbeiten` und `planen-planer-ohne-bearbeiten-reiter`.
  {
    id: 'fs-planer-aendert-alles',
    datei: 'src/planen/FsPlan.tsx',
    regel: 'Zeit, Ort und Entfernen eines Treffpunkts für Admin und Planer — und den Aufseher seiner Gruppe.',
    suchen: '    rechte.zuteilen || (rechte.gruppe !== null && inst.grp === rechte.gruppe)\n',
    ersetzen: '    rechte.admin || (rechte.gruppe !== null && inst.grp === rechte.gruppe)\n',
  },
  {
    id: 'fs-grundplan-beim-planer',
    datei: 'src/planen/fs-bereiche.ts',
    regel: 'Den Grundplan sehen beim Planen Admin, Planer und Gruppenaufseher.',
    suchen: '  const grundplan = planen && (rechte.zuteilen || rechte.gruppe !== null)\n',
    ersetzen: '  const grundplan = planen && (rechte.admin || rechte.gruppe !== null)\n',
  },
  {
    id: 'datumswaehler-untergrenze',
    datei: 'src/components/DatePicker.tsx',
    regel: '„Bis" lässt keinen Tag vor „Von" zu — sonst entsteht ein Zeitraum, den keine Prüfung trifft.',
    suchen: 'const disabled = (min != null && di < min) || (max != null && di > max)',
    ersetzen: 'const disabled = max != null && di > max',
  },

  // ── Sicherheitsgrenzen (T97) ──────────────────────────────────────────────
  // Die vier Regeln aus der Sicherheitsdurchsicht vom 24.8.2026. Sie haben
  // gemeinsam, dass ihr Bruch nicht auffällt: Die App verhält sich unverändert,
  // weil sie den Missbrauch gar nicht erst anbietet. Bemerkbar wird er nur,
  // wenn jemand die Function oder PostgREST direkt anspricht — deshalb stehen
  // sie hier und nicht im Vertrauen auf die Bedienoberfläche.
  {
    id: 'ersatz-versammlung-aus-dem-rumpf',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Die Versammlung kommt aus der eigenen Mitgliedszeile, nie aus dem Anfrage-Rumpf.',
    suchen: 'const caller = eigene[0]\n    if (!caller) return json({ error: \'forbidden\' }, 403)\n    const cong = caller.congregation_id',
    ersetzen: 'const caller = eigene[0]\n    if (!caller) return json({ error: \'forbidden\' }, 403)\n    const cong = payload?.congregationId ?? caller.congregation_id',
  },
  {
    id: 'rest-filterwert-kodiert',
    datei: 'supabase/functions/_shared/rest.ts',
    /*
      Stand bis T100 in `substitute/index.ts`. Seit die Hülle geteilt ist, deckt
      diese eine Regel **alle** Functions ab — vorher konnte eine von ihnen die
      Kodierung verlieren, ohne dass hier etwas anschlug. Genau so waren die
      vier Abschriften auch auseinandergelaufen.
    */
    regel: 'Jeder Wert in einem REST-Pfad wird kodiert — ein rohes # schneidet die folgenden Filter ab.',
    suchen: 'export const wert = (v: string | number): string => encodeURIComponent(String(v))',
    ersetzen: 'export const wert = (v: string | number): string => String(v)',
  },
  {
    id: 'ersatz-nur-mit-gesuch',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Einspringen setzt eine Absage zu genau dieser Aufgabe voraus — sonst verdrängt jeder Qualifizierte jeden.',
    suchen: "if (absagen.length === 0) return json({ error: 'not-sought' }, 409)",
    ersetzen: '',
  },
  {
    id: 'ersatz-ausfall',
    datei: 'src/data/planning.ts',
    regel: 'Für eine ausgefallene Zusammenkunft wird kein Ersatz gesucht (T30) — die App lädt sonst zu etwas ein, das sie selbst ablehnt.',
    suchen: 'if (istAusgefallen(week, parts.tab)) continue',
    ersetzen: '',
  },
  {
    id: 'programm-hilfsdienst-platzweise',
    datei: 'src/programm/programm-zeilen.ts',
    regel: 'Das Programmblatt zeigt Hilfsdienste platzweise bis zur eingestellten Zahl — kein Name rückt nach vorn oder über die Grenze.',
    suchen: '  return Array.from({ length: service.count }, (_unused, pos) => helpers[service.key]?.[pos])',
    ersetzen: '  return (helpers[service.key] ?? []).filter((slot) => slot.name).slice(0, service.count)',
  },
  {
    id: 'import-nur-jw-org',
    datei: 'supabase/functions/import-week/index.ts',
    regel: 'Geholt wird nur von jw.org und nur über https — sonst ist die Function ein Bote ins interne Netz.',
    suchen: "if (!istJwOrg(url)) throw new Error(`Adresse ausserhalb von jw.org: ${url}`)",
    ersetzen: '',
  },
  {
    id: 'mitteilungs-klick-bleibt-drinnen',
    datei: 'public/sw.js',
    regel: 'Ein Mitteilungs-Klick führt nur in den Geltungsbereich der App, nie zu einer fremden Adresse.',
    suchen: 'return ziel.href.startsWith(start.href) ? ziel.href : start.href',
    ersetzen: 'return ziel.href',
  },
  {
    id: 'linkmail-adresse-kodiert',
    datei: 'src/personen/link-mail.ts',
    regel: 'Die Empfängeradresse wird kodiert — ein ? darin hängt sonst eigene Kopfzeilen an den Entwurf.',
    suchen: "  const an = encodeURIComponent(person.mail.trim()).replace(/%40/g, '@')",
    ersetzen: '  const an = person.mail.trim()',
  },

  // ── Das Schema selbst (T97) ───────────────────────────────────────────────
  // `schema.sql` ist der Einstieg für Neuinstallationen. Am 23.8.2026 stand
  // dort monatelang eine Datei, die weder ausführbar war noch die
  // verschärften Richtlinien enthielt — und die Suite blieb grün, weil sie nur
  // Namen suchte. Die fünf Einträge brechen genau die Zusagen, die seitdem
  // dazugekommen sind.
  {
    id: 'schema-dollar-rumpf',
    datei: 'supabase/schema.sql',
    regel: 'Jede Funktion im Schema hat einen geschlossenen $$-Rumpf — sonst bricht die ganze Datei ab.',
    suchen: 'set search_path = public\nas $$\n  select btrim(p.fn',
    ersetzen: 'set search_path = public\nas $\n  select btrim(p.fn',
  },
  {
    id: 'schema-richtlinie-eindeutig',
    datei: 'supabase/schema.sql',
    regel: 'Jede Richtlinie steht genau einmal — beim Ausführen gewinnt sonst die letzte, ältere Fassung.',
    suchen: 'drop policy if exists confirmations_delete_planner on public.confirmations;',
    ersetzen:
      'drop policy if exists confirmations_write on public.confirmations;\n' +
      'create policy confirmations_write on public.confirmations\n' +
      '  for all\n' +
      '  using (congregation_id = public.my_congregation_id() and user_id = auth.uid())\n' +
      '  with check (congregation_id = public.my_congregation_id() and user_id = auth.uid());\n\n' +
      'drop policy if exists confirmations_delete_planner on public.confirmations;',
  },
  {
    id: 'schema-bestaetigen-eigene-aufgabe',
    datei: 'supabase/schema.sql',
    regel: 'Bestätigen darf nur, wem die Aufgabe gehört (S2/T89) — nicht nur, wem die Zeile gehört.',
    suchen: '\n    and public.task_gehoert_mir(task_key)',
    ersetzen: '',
  },
  {
    id: 'schema-abwesenheit-eigene-person',
    datei: 'supabase/schema.sql',
    regel: 'Eine Abwesenheit gilt nur der eigenen Person (S11) — die eigene Zeile allein genügt nicht.',
    suchen: '      (user_id = auth.uid() and (person_id is null or person_id = public.my_person_id()))',
    ersetzen: '      user_id = auth.uid()',
  },
  {
    id: 'schema-verhindert-nur-an-planer',
    datei: 'supabase/schema.sql',
    regel: 'Eine Verhinderungs-Meldung geht nur an Admins und Planer (S3) — nicht an jeden Empfänger der Versammlung.',
    // Seit dem 24.9.2026 in `notify_planners`, nicht mehr in der Richtlinie.
    suchen: '     and (m.planner or m.zuteiler);',
    ersetzen: '     and true;',
  },
  {
    id: 'schema-nur-verhinderung-fuer-jeden',
    datei: 'supabase/schema.sql',
    regel: 'Über notify_planners meldet ein Verkündiger nur eine Verhinderung — Import und „Plan gesendet" bleiben Admins und Planern.',
    suchen: "  if kind <> 'verhindert' and not public.darf_zuteilen() then",
    ersetzen: '  if false then',
  },

  // ── „Plan senden" (T99) ───────────────────────────────────────────────────
  {
    id: 'plan-bestaetigte-nicht-erneut',
    datei: 'src/data/plan-versand.ts',
    regel: 'Wer bestätigt oder abgesagt hat, weiß Bescheid — er steht nicht mehr auf der Sendeliste.',
    suchen: '  return Boolean(confirmations[key]) || Boolean(sentLog[sentKey(key, name)])',
    ersetzen: '  return Boolean(sentLog[sentKey(key, name)])',
  },
  {
    id: 'plan-tagebuch-traegt-den-namen',
    datei: 'src/data/planning.ts',
    /*
      Ohne den Namen im Schlüssel zählte ein umgeteilter Platz als gemeldet:
      Die alte Person hatte ihre Nachricht, die neue bekäme nie eine. Genau
      dieser Fall ist der Grund, warum das Tagebuch nicht nur den Platz führt.
    */
    regel: 'Das Versand-Tagebuch merkt sich Platz UND Name, nicht nur den Platz.',
    suchen: '  return `${taskKey} ${name}`',
    ersetzen: '  return taskKey',
  },
  {
    id: 'plan-entzug-nur-bestaetigte',
    datei: 'src/data/plan-versand.ts',
    regel: 'Zurückgezogen wird nur gemeldet, wem etwas genommen wurde — nicht, wer seinen Platz behält.',
    suchen: '    if (jetzt && dieselbePerson(war, jetzt)) continue // unverändert',
    ersetzen: '    if (false) continue',
  },
  {
    id: 'plan-entzug-person-per-id',
    datei: 'src/data/helpers.ts',
    regel:
      'Wer dieselbe Person ist, entscheidet die Person-Id — am Namen allein meldete eine berichtigte Schreibweise einen Entzug, und zwischen zwei Gleichnamigen umzuteilen meldete gar keinen.',
    suchen: '  return a.pid && b.pid ? a.pid === b.pid : a.name === b.name',
    ersetzen: '  return a.name === b.name',
  },
  {
    id: 'plan-entzug-nur-vorhandene-plaetze',
    datei: 'src/data/plan-versand.ts',
    regel:
      'Ein Platz, den es im neuen Stand gar nicht mehr gibt (ausgefallene Zusammenkunft, abgeschaltete Zusätzliche Klasse), ist kein Entzug — sonst meldete eine Kongress-Woche der halben Versammlung einen Verlust.',
    suchen: '    if (!platzNochDa(nachher, key, fsLeer)) continue',
    ersetzen: '    if (false) continue',
  },
  {
    id: 'plan-entzug-ausfall-schweigt',
    datei: 'src/data/plan-versand.ts',
    regel: 'Fällt die Zusammenkunft aus, ruhen ihre Zuteilungen — sie sind nicht verwaist (T30).',
    suchen: '  if (istAusgefallen(nachher, teile.tab)) return false',
    ersetzen: '  if (false) return false',
  },
  {
    id: 'plan-entzug-klasse-schweigt',
    datei: 'src/data/plan-versand.ts',
    regel:
      'Wird die Zusätzliche Klasse abgeschaltet, bleiben ihre Namen absichtlich stehen — der Raum ist abwesend, nicht geleert.',
    suchen: "  if (teile.art === 'aux' || teile.art === 'ratgeber') return hatAuxKlasse(nachher[teile.tab])",
    ersetzen: '  if (false) return false',
  },
  {
    id: 'plan-entzug-braucht-zusage',
    datei: 'src/data/plan-versand.ts',
    /*
      Seit T101 wird nur Bekanntes überhaupt aufgenommen, statt alles
      aufzunehmen und später zu verwerfen. Damit steht die Regel an zwei
      Stellen — je eine für die beiden Datenquellen —, und beide brauchen
      ihren eigenen Eintrag: Fiele nur eine weg, meldete die andere weiter,
      und ein Eintrag über beide zusammen bliebe grün. Seit dem 15.10.2026
      zählt als bekannt auch, was gemeldet wurde.
    */
    regel:
      'Was weder zugesagt noch gemeldet ist, ist Entwurf — Umsortieren meldet nichts (Zusammenkünfte).',
    suchen: '    if (!betroffen(key, slot.name)) return',
    ersetzen: '    if (false) return',
  },
  {
    id: 'plan-entzug-braucht-zusage-treffpunkt',
    datei: 'src/data/plan-versand.ts',
    regel:
      'Dieselbe Regel für die zweite Datenquelle: ein Treffpunkt-Leiter, der nichts davon wusste, bekommt beim Wechseln nichts.',
    suchen: '    if (!betroffen(key, inst.leader)) continue',
    ersetzen: '    if (false) continue',
  },
  {
    id: 'sonderwoche-grund-gebuendelt',
    datei: 'src/app/persist.ts',
    regel: 'Der Grund einer Sonderwoche geht gebündelt hinaus — einmal, nicht je Tastenanschlag.',
    suchen: "  'setAbweichung',\n",
    ersetzen: '',
  },
  {
    id: 'termin-titel-gebuendelt',
    datei: 'src/app/persist.ts',
    regel: 'Titel und Ort eines weiteren Termins gehen gebündelt hinaus — einmal, nicht je Tastenanschlag.',
    suchen: "  'terminUpdate',\n]",
    ersetzen: ']',
  },
  {
    id: 's89-bogen-nicht-bei-ausfall',
    datei: 'src/data/planning.ts',
    regel: 'Fällt die Zusammenkunft aus, bietet der S-89-Bogen keine Zettel an — gehalten wird keine Aufgabe.',
    suchen: "  if (!week || istAusgefallen(week, 'mid')) return []\n  const out: S89Payload[] = []",
    ersetzen: '  if (!week) return []\n  const out: S89Payload[] = []',
  },
  {
    id: 'entzug-auch-gemeldete',
    datei: 'src/data/plan-versand.ts',
    regel: 'Auch wem der Platz nur gemeldet wurde, erfährt einen Entzug (15.10.2026) — nicht erst nach seiner Zusage.',
    suchen: "    conf[key] !== 'verhindert' && weissBescheid(conf, gemeldet, key, name)",
    ersetzen: "    conf[key] === 'bestätigt'",
  },
  {
    id: 'entzug-nicht-an-absager',
    datei: 'src/data/plan-versand.ts',
    regel: 'Wer abgesagt hat, hat den Platz selbst abgegeben — er bekommt keinen Entzug.',
    suchen: "    conf[key] !== 'verhindert' && weissBescheid(conf, gemeldet, key, name)",
    ersetzen: '    weissBescheid(conf, gemeldet, key, name)',
  },
  {
    id: 'entzug-raeumt-tagebuch',
    datei: 'src/app/reducer.ts',
    regel: 'Was ein Entzug nimmt, verschwindet auch aus dem Versand-Tagebuch des Zustands — wie in der Datenbank.',
    suchen: '  for (const k of tagebuch) delete sentLog[k]\n',
    ersetzen: '',
  },
  {
    id: 'entzug-raeumt-zusage',
    datei: 'src/app/reducer.ts',
    regel: 'Was ein Entzug nimmt, verliert auch seine Zusage — an einer Stelle für alle Wege (auch den Anlass).',
    suchen: '    confirmations: dropConfirmations(nachher.confirmations, weg.map((z) => z.key)),\n',
    ersetzen: '',
  },
  {
    id: 'platzname-person-ohne-uebersetzer',
    datei: 'src/i18n/useT.ts',
    regel: 'Ein Personenname am Platz geht nie durch den Übersetzer — sonst wird aus „Markus 2 Weber" auf Englisch „Mark 2 Weber".',
    suchen: '  return gruppe ? i18n.tu(name) : name\n',
    ersetzen: '  return i18n.tu(name)\n',
  },
  {
    id: 'platzname-gruppe-uebersetzt',
    datei: 'src/i18n/useT.ts',
    regel: 'Der Name einer Gruppe (Reinigung) steht am Platz in der Sprache des Lesers.',
    suchen: '  return gruppe ? i18n.tu(name) : name\n',
    ersetzen: '  return name\n',
  },
  {
    id: 'platzname-programm-am-dienst',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Im Programm entscheidet der Dienst, ob am Platz eine Gruppe steht — nicht jeder Name wird übersetzt.',
    suchen: '    .map((slot) => platzName(slot.name, Boolean(service.groups), i18n))',
    ersetzen: '    .map((slot) => platzName(slot.name, true, i18n))',
  },
  {
    id: 'platzname-planen-am-dienst',
    datei: 'src/planen/HelpersPanel.tsx',
    regel: 'Beim Planen entscheidet der Dienst, ob am Platz eine Gruppe steht — nicht jeder Name wird übersetzt.',
    suchen: '                name={platzName(name, gruppe, { tu })}',
    ersetzen: '                name={platzName(name, true, { tu })}',
  },
  {
    id: 'platzname-zuteilen-am-platz',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Im Zuteilen-Blatt steht der aktuelle Name nur bei einer Gruppe übersetzt da.',
    suchen: '          gruppe={sel.groups}\n',
    ersetzen: '          gruppe\n',
  },
  // ── Anmelden per Link (T121, Phase 8) ─────────────────────────────────────
  {
    id: 'anmelden-link-abgelaufen',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Ein abgelaufener Link meldet niemanden an.',
    suchen: "  if (!link) return json({ error: 'ungueltig' }, 404)\n  if (abgelaufen(link, jetzt)) return json({ error: 'abgelaufen' }, 410)\n",
    ersetzen: "  if (!link) return json({ error: 'ungueltig' }, 404)\n",
  },
  {
    id: 'anmelden-code-abgelaufen',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Ein abgelaufener Code meldet niemanden an.',
    suchen: "  }\n  if (abgelaufen(link, jetzt)) return json({ error: 'abgelaufen' }, 410)\n  if (!pruefen)",
    ersetzen: '  }\n  if (!pruefen)',
  },
  {
    id: 'anmelden-raten-gebremst',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Nach zu vielen Fehlversuchen nimmt die Function keinen Code mehr an — auch keinen richtigen.',
    suchen: "  if (await gebremst(absender, jetzt)) return json({ error: 'zu-viele' }, 429)\n",
    ersetzen: '',
  },
  {
    id: 'anmelden-fehlversuch-gezaehlt',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Ein falscher Code zählt als Fehlversuch — sonst bremst die Bremse nie.',
    suchen: '    await fehlversuch(absender, jetzt)\n',
    ersetzen: '',
  },
  {
    id: 'anmelden-mail-genau-die-adresse',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: '„Link senden" schickt nur an Personen genau dieser Adresse — ein Unterstrich ist kein Platzhalter.',
    suchen: "  const muster = adresse.replace(/_/g, '\\\\_')\n",
    ersetzen: '  const muster = adresse\n',
  },
  {
    id: 'anmelden-mail-nur-hereingelassene',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: '„Link senden" schickt nur an Personen mit Konto oder Link — den ersten Zugang gibt der Admin.',
    suchen: '    if (!link && !mitKonto.has(person.id)) continue\n',
    ersetzen: '',
  },
  {
    id: 'anmelden-mail-pause',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Höchstens eine Mail in zehn Minuten je Person.',
    suchen: '    if (link?.gesendet_at && jetzt - new Date(link.gesendet_at).getTime() < MAIL_PAUSE) continue\n',
    ersetzen: '',
  },
  // `anmelden-mail-zettel-bleibt` gestrichen (T121, Phase 10b): „Link senden"
  // stellt jetzt einen neuen Code aus, die Mail trägt ihn (Betreiber, 15.10.2026).
  {
    id: 'anmelden-mail-traegt-code',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: '„Link senden" schickt den neuen Code mit — für die App vom Home-Bildschirm des iPhones.',
    suchen: '      code: codeAnzeige(neu.code),\n',
    ersetzen: "      code: '',\n",
  },
  {
    id: 'anmelden-rechte-aus-vormerkung',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Beim ersten Anmelden kommt das Admin-Recht aus der Vormerkung an der Person.',
    suchen: '    planner: Boolean(person.planner_vorgemerkt),\n',
    ersetzen: '    planner: false,\n',
  },
  {
    id: 'anmelden-einloesen-rueckweg',
    datei: 'supabase/functions/_shared/konto-admin.ts',
    regel: 'Lösen neuere Fassungen von Auth den Link nur als „email" ein, greift der Rückweg.',
    suchen: "      return (await einloesen(hash, 'magiclink')) ?? (await einloesen(hash, 'email'))",
    ersetzen: "      return await einloesen(hash, 'magiclink')",
  },
  {
    id: 'send-invite-erst-wer-fragt',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Ohne Anmeldung kein Link — und kein Wort über den Versand.',
    suchen: "    if (!userId) return json({ error: 'unauthorized' }, 401)\n",
    ersetzen: '',
  },
  {
    id: 'anmelde-code-alphabet',
    datei: 'supabase/functions/_shared/anmeldung.ts',
    regel: 'Ein getippter Code wird gelesen wie gespeichert: groß, ohne Strich.',
    suchen: '    .filter((z) => ALPHABET.includes(z))\n',
    ersetzen: '',
  },
  {
    id: 'anmelden-link-beim-oeffnen',
    datei: 'src/app/store.tsx',
    regel: 'Der Link aus der E-Mail meldet beim Öffnen der App an.',
    suchen: '      const token = anmeldeAdresse().token\n',
    ersetzen: '      const token = null\n',
  },
  {
    id: 'anmelden-link-grund-gesagt',
    datei: 'src/app/store.tsx',
    regel: 'Gilt der Link nicht mehr, steht der Grund da.',
    suchen: "        dispatch({ type: 'showToast', text: anmeldeFehlerText(fehler, dict(stateRef.current.lang), 'link') })\n",
    ersetzen: '',
  },
  {
    id: 'anmelden-link-laedt-einmal',
    datei: 'src/app/store.tsx',
    regel: 'Nach dem Link lädt die App über das Ereignis von Supabase — nicht noch einmal über die alte Sitzung.',
    suchen: "          dispatch({ type: 'login', welcome: true })\n          return\n",
    ersetzen: "          dispatch({ type: 'login', welcome: true })\n",
  },
  {
    id: 'anmelden-sitzung-uebernommen',
    datei: 'src/lib/anmelden.ts',
    regel: 'Angemeldet ist erst, wessen Sitzung Supabase übernommen hat.',
    suchen: '  const { error } = await supabase.auth.setSession({ access_token: sitzung.access_token, refresh_token: sitzung.refresh_token })\n',
    ersetzen: '  const error = null\n',
  },
  {
    id: 'anmelden-code-erst-pruefen',
    datei: 'src/lib/anmelden.ts',
    regel: 'Das Prüfen eines Codes sagt nur, wem er gehört — ohne Sitzung.',
    suchen: "  const r = await rufen({ aktion: 'code', code, pruefen: true })\n",
    ersetzen: "  const r = await rufen({ aktion: 'code', code })\n",
  },
  {
    id: 'anmelden-link-in-seitensprache',
    datei: 'src/login/LoginScreen.tsx',
    regel: '„Link senden" schickt die Mail in der Sprache der Anmeldeseite.',
    suchen: '    const ergebnis = await linkAnfordern(adresse, state.lang)\n',
    ersetzen: "    const ergebnis = await linkAnfordern(adresse, 'de')\n",
  },
  {
    id: 'anmelden-ohne-db-nachgestellt',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Ohne Datenbank meldet „Link senden" gleich an, ohne Netzaufruf.',
    suchen: '    if (!isSupabaseConfigured) {\n      onNachgestellt()\n      return\n    }\n',
    ersetzen: '',
  },
  {
    id: 'anmelden-code-verbraucht',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Angemeldet ist der Code aus der Adresse verbraucht — nach dem Abmelden steht er nicht wieder im Feld.',
    suchen: '    anmeldeCodeVerbraucht()\n    onAngemeldet()\n',
    ersetzen: '    onAngemeldet()\n',
  },
  {
    id: 'anmelden-code-verworfen',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Nach „Zurück" ist der Code aus der Adresse verworfen.',
    suchen: "              anmeldeCodeVerbraucht()\n              setAnsicht({ art: 'start' })\n",
    ersetzen: "              setAnsicht({ art: 'start' })\n",
  },
  {
    id: 'scannen-nur-mit-kamera',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Ohne Kamera-Schnittstelle kein „Zettel scannen".',
    suchen: '  const scannen = !useMedia(DESKTOP_BREITE) && kameraMoeglich()\n',
    ersetzen: '  const scannen = !useMedia(DESKTOP_BREITE)\n',
  },
  {
    id: 'scannen-nicht-am-desktop',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Am Desktop kein „Zettel scannen" — dort tippt man den Code.',
    suchen: '  const scannen = !useMedia(DESKTOP_BREITE) && kameraMoeglich()\n',
    ersetzen: '  useMedia(DESKTOP_BREITE)\n  const scannen = kameraMoeglich()\n',
  },
  {
    id: 'scannen-hinweis-passt',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Ohne Scanner nennt der Hinweis nur das Eintippen.',
    suchen: '{scannen ? t.ohneMailHinweis : t.ohneMailHinweisTippen}',
    ersetzen: '{t.ohneMailHinweis}',
  },
  {
    id: 'scanner-meldet-einmal',
    datei: 'src/login/ZettelScanner.tsx',
    regel: 'Der Scanner meldet den ersten Fund genau einmal und liest dann nicht weiter.',
    suchen: '          gefunden.current(text)\n          return\n',
    ersetzen: '          gefunden.current(text)\n',
  },
  {
    id: 'scanner-kamera-aus',
    datei: 'src/login/ZettelScanner.tsx',
    regel: 'Verschwindet der Scanner, geht die Kamera aus.',
    suchen: '      clearTimeout(wecker)\n      strom?.getTracks().forEach((spur) => spur.stop())\n',
    ersetzen: '      clearTimeout(wecker)\n',
  },
  {
    id: 'scanner-kamera-aus-zu-spaet',
    datei: 'src/login/ZettelScanner.tsx',
    regel: 'Geht die Kamera erst auf, als der Scanner schon weg ist, wird sie gleich wieder ausgeschaltet.',
    suchen: '      if (aus || !video) {\n        strom.getTracks().forEach((spur) => spur.stop())\n        return\n      }\n',
    ersetzen: '      if (aus || !video) return\n',
  },
  {
    id: 'scanner-kamera-fehlt',
    datei: 'src/login/ZettelScanner.tsx',
    regel: 'Geht die Kamera nicht auf, sagt der Scanner es.',
    suchen: '      } catch {\n        if (!aus) setKameraFehlt(true)\n',
    ersetzen: '      } catch {\n',
  },
  {
    id: 'send-invite-ohne-versand-nichts',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Kann der Server nicht senden, stellt er auf „senden" hin nichts aus — sonst verfielen die alten Links still.',
    suchen: '    if (senden && !bereit) return json({ links: [], mailBereit: false })\n',
    ersetzen: '',
  },
  {
    id: 'links-in-teilen',
    datei: 'src/lib/links-ausstellen.ts',
    regel: 'Viele Personen gehen in Teilen hinaus — die Function liefe sonst an ihre Zeitgrenze.',
    suchen: 'const JE_AUFRUF = 40\n',
    ersetzen: 'const JE_AUFRUF = 1000\n',
  },
  {
    id: 'links-ohne-versand-aufhoeren',
    datei: 'src/lib/links-ausstellen.ts',
    regel: 'Kann der Server nicht senden, fragt die App nicht Teil für Teil weiter.',
    suchen: '    if (senden && !ergebnis.mailBereit) break\n',
    ersetzen: '',
  },
  {
    id: 'links-fehler-behaelt-ausgestellte',
    datei: 'src/lib/links-ausstellen.ts',
    regel: 'Scheitert ein Teil, bleiben die schon ausgestellten Links — sonst wüsste der Zustand nichts von ihnen.',
    suchen: '      return { ...ergebnis, fehler: true }\n',
    ersetzen: '      return { links: [], mailBereit: ergebnis.mailBereit, fehler: true }\n',
  },
  {
    id: 'link-ersetzt-alten-im-zustand',
    datei: 'src/app/reducer.ts',
    regel: 'Ein neuer Link ersetzt im Zustand den alten derselben Person.',
    suchen: '      return { ...state, anmeldeLinks: [...state.anmeldeLinks.filter((l) => !neu.has(l.personId)), ...action.links] }\n',
    ersetzen: '      return { ...state, anmeldeLinks: [...state.anmeldeLinks, ...action.links] }\n',
  },
  {
    id: 'konto-weg-link-weg',
    datei: 'src/app/reducer.ts',
    regel: 'Mit dem Konto geht der Link der Person aus dem Zustand.',
    suchen: '        anmeldeLinks: personId ? state.anmeldeLinks.filter((l) => l.personId !== personId) : state.anmeldeLinks,\n',
    ersetzen: '',
  },
  {
    id: 'konto-weg-link-weg-db',
    datei: 'src/app/persist.ts',
    regel: 'Mit dem Konto löscht die App den Link der Person — sonst käme sie mit ihm gleich wieder herein.',
    suchen: '      if (personId) deleteAnmeldeLink(personId)\n',
    ersetzen: '',
  },
  {
    id: 'person-weg-link-weg',
    datei: 'src/app/reducer.ts',
    regel: 'Mit der Person geht ihr Link aus dem Zustand (wie in der Datenbank: on delete cascade).',
    suchen: '    anmeldeLinks: state.anmeldeLinks.filter((l) => l.personId !== id),\n',
    ersetzen: '',
  },
  {
    id: 'links-laden-ausdruecklich',
    datei: 'src/lib/data.ts',
    regel: 'Die Links kommen mit ausdrücklichen Spalten — die Prüfsummen darf die App nicht lesen.',
    suchen: "const ANMELDE_LINK_SPALTEN = 'person_id, gueltig_bis, erstellt_at, gesendet_at, benutzt_at'",
    ersetzen: "const ANMELDE_LINK_SPALTEN = '*'",
  },
  {
    id: 'links-laden-nicht-fatal',
    datei: 'src/lib/data.ts',
    regel: 'Scheitern die Links, lädt die App trotzdem.',
    suchen: '  const firstErr = [cong, persons, services, groups, weeks, absences, notifs, confs, members, fsRulesRows, fsWeeksRows]\n',
    ersetzen: '  const firstErr = [cong, persons, services, groups, weeks, absences, notifs, confs, members, linkRows, fsRulesRows, fsWeeksRows]\n',
  },
  {
    id: 'link-abgelaufen-wie-keiner',
    datei: 'src/personen/person-lage.ts',
    regel: 'Ein abgelaufener Link zählt wie keiner.',
    suchen: '  return link.gueltigBis > heute\n',
    ersetzen: '  return true\n',
  },
  {
    id: 'link-senden-mailprogramm',
    datei: 'src/personen/LinkSendenBlatt.tsx',
    regel: 'Kann der Server nicht senden, öffnet sich dieselbe E-Mail im eigenen Mail-Programm.',
    suchen: '      if (ohneVersand) r = await ausstellen([person.id], false)\n',
    ersetzen: '',
  },
  {
    id: 'links-ausstellen-offline',
    datei: 'src/personen/useLinksAusstellen.ts',
    regel: 'Offline stellt die App keine Links aus — weder per E-Mail noch für Zettel.',
    suchen: "    if (state.staleAt) {\n      dispatch({ type: 'showToast', text: t.offlineReadOnly })\n      return null\n    }\n",
    ersetzen: '',
  },
  {
    id: 'links-ausstellen-in-den-zustand',
    datei: 'src/personen/useLinksAusstellen.ts',
    regel: 'Was ausgestellt wurde, steht gleich im Zustand — sonst zeigte die Liste weiter „Ohne Link".',
    suchen: "    if (r.links.length > 0) dispatch({ type: 'linksAusgestellt', links: r.links.map((l) => alsAnmeldeLink(l, new Date())) })\n",
    ersetzen: '',
  },
  {
    id: 'zettel-ohne-versand',
    datei: 'src/personen/useZettelDruck.tsx',
    regel: '„Zettel drucken" stellt Links ohne Versand aus.',
    suchen: '        personen.map((p) => p.id),\n        false,\n',
    ersetzen: '        personen.map((p) => p.id),\n        true,\n',
  },
  {
    id: 'zettel-bogen-weg-nach-druck',
    datei: 'src/personen/useZettelDruck.tsx',
    regel: 'Nach dem Druckdialog verschwindet der Bogen — die Codes darauf melden an.',
    suchen: '      delete document.documentElement.dataset.print\n      setSatz(null)\n',
    ersetzen: '      delete document.documentElement.dataset.print\n',
  },
  {
    id: 'zettel-druck-eigener',
    datei: 'src/personen/useZettelDruck.tsx',
    regel: 'Nach dem Druck räumt jede Stelle ihren eigenen Bogen ab — auch wenn eine zweite zuerst auf „afterprint" hört.',
    suchen: '      if (!meiner.current) return\n      meiner.current = false\n',
    ersetzen: '      if (document.documentElement.dataset.print !== DRUCK) return\n',
  },
  {
    id: 'links-senden-nur-mit-adresse',
    datei: 'src/personen/LinksSendenBlatt.tsx',
    regel: '„Links senden" schickt nur an die mit Adresse — die übrigen bekommen den Zettel.',
    suchen: '  const perMail = personen.filter((p) => p.mail.trim())\n',
    ersetzen: '  const perMail = personen\n',
  },
  {
    id: 'links-senden-nicht-bereit',
    datei: 'src/personen/LinksSendenBlatt.tsx',
    regel: 'Kann die App nicht senden, sagt „Links senden" es.',
    suchen: "      if (!r.fehler && !r.mailBereit) {\n        dispatch({ type: 'showToast', text: t.mailNichtBereit })\n        return\n      }\n",
    ersetzen: '',
  },
  // `token-erneuern-neuer-code` gestrichen (T121, Phase 10b): `tokenErneuern`
  // ist fort, „Link senden" stellt immer einen neuen Code aus. Dass ein alter
  // Zettel danach nicht mehr anmeldet, prüft `_test/anmelden.test.ts` weiter.
  {
    id: 'anmelden-wettlauf-erste-anmeldung',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Zwei erste Anmeldungen zugleich: Auch die zweite ist angemeldet.',
    suchen: '  return (await kontoIdDer(person.id, congregationId)) === konto.id ? { email: konto.email } : null\n',
    ersetzen: '  return null\n',
  },
  {
    id: 'anmelden-mail-antwort-sofort',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: '„Link senden" antwortet, bevor gesucht und gesendet wird — die Dauer verrät nicht, ob es die Adresse gibt.',
    suchen: "  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(arbeit)\n  else await arbeit\n",
    ersetzen: '  await arbeit\n',
  },
  {
    id: 'anmelden-mail-fehler-still',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Scheitert „Link senden" im Hintergrund, bleibt die Antwort dieselbe — der Fehler geht nur in die Logs.',
    suchen: "  const arbeit = linksPerMail(adresse, typeof lang === 'string' ? lang : null, jetzt).catch((err: unknown) => {\n    console.error('anmelden (mail):', err instanceof Error ? err.message : String(err))\n  })\n",
    ersetzen: "  const arbeit = linksPerMail(adresse, typeof lang === 'string' ? lang : null, jetzt)\n",
  },
  {
    id: 'scanner-leser-fehlt',
    datei: 'src/login/ZettelScanner.tsx',
    regel: 'Lädt der Leser nicht, geht die Kamera aus, und der Scanner sagt es.',
    suchen: '      const lesen = await leserFuer().catch(() => null)\n      if (!lesen) {\n        strom.getTracks().forEach((spur) => spur.stop())\n        if (!aus) setKameraFehlt(true)\n        return\n      }\n',
    ersetzen: '      const lesen = await leserFuer()\n',
  },
  {
    id: 'scannen-ueberschrift',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Auch beim Scannen hat die Seite ihre Überschrift.',
    suchen: '            <h1 className="seitentitel seitentitel--gross login-titel">{t.zettelScannen}</h1>\n',
    ersetzen: '',
  },
  {
    id: 'bogen-verteilen-abstand',
    datei: 'src/druck/verteilen.ts',
    regel: 'Beim Verteilen auf Blätter zählt der Abstand zwischen zwei Blöcken mit.',
    suchen: '    const mitAbstand = aktuell ? belegt + (anschluss[i] ? 0 : abstand) + hoehe : hoehe\n',
    ersetzen: '    const mitAbstand = aktuell ? belegt + hoehe : hoehe\n',
  },
  {
    id: 'bogen-verteilen-anschluss',
    datei: 'src/druck/verteilen.ts',
    regel: 'Die nächste Zeile einer Tabelle schließt ohne Abstand an — so passen mehr aufs Blatt.',
    suchen: '    const mitAbstand = aktuell ? belegt + (anschluss[i] ? 0 : abstand) + hoehe : hoehe\n',
    ersetzen: '    const mitAbstand = aktuell ? belegt + abstand + hoehe : hoehe\n',
  },
  {
    id: 'bogen-reicht-anschluss-weiter',
    datei: 'src/druck/Bogen.tsx',
    regel: 'Der Bogen sagt beim Verteilen, welche Blöcke als Tabellenzeilen anschließen.',
    suchen: '    const anschluss = bloecke.map((block) => block.anschluss === true)\n',
    ersetzen: '    const anschluss = bloecke.map(() => false)\n',
  },
  {
    id: 'bogen-anschluss-klasse',
    datei: 'src/druck/Bogen.tsx',
    regel: 'Eine anschließende Tabellenzeile trägt ihre Klasse — sonst stünde der Abstand der Blöcke zwischen den Zeilen.',
    suchen: "  return <div className={block.anschluss ? 'druck-block druck-block--anschluss' : 'druck-block'}>{block.inhalt}</div>\n",
    ersetzen: "  return <div className=\"druck-block\">{block.inhalt}</div>\n",
  },
  {
    id: 'tabellen-bloecke-zeilenweise',
    datei: 'src/druck/tabellen-bloecke.tsx',
    regel: 'Eine lange Tabelle geht Zeile für Zeile auf die Blätter — nicht als ein Block, der über den Rand läuft.',
    suchen: '          <DruckTabelle {...form} zeilen={[erste]} />\n',
    ersetzen: '          <DruckTabelle {...form} zeilen={zeilen} />\n',
  },
  {
    id: 'tabellen-bloecke-anschluss',
    datei: 'src/druck/tabellen-bloecke.tsx',
    regel: 'Die Zeilen nach der ersten schließen an — ohne Abstand dazwischen.',
    suchen: '      anschluss: true,\n',
    ersetzen: '',
  },
  {
    id: 'tabellen-bloecke-ohne-zeilen',
    datei: 'src/druck/tabellen-bloecke.tsx',
    regel: 'Eine Tabelle ohne Zeilen steht gar nicht da — auch nicht ihr Kopf.',
    suchen: '  if (!erste) return []\n',
    ersetzen: '',
  },
  {
    id: 'plan-bogen-alle-spannen',
    datei: 'src/druck/PlanBogen.tsx',
    regel: 'Der Bogen eines Plans nennt jede Woche seines Zeitraums — auch eine ohne Eintrag.',
    suchen: '  const zeilen = planSpannen(plan).map((spanne) => {\n',
    ersetzen: '  const zeilen = [...gruppeVon.keys()].map((spanne) => {\n',
  },
  {
    id: 'plan-bogen-offen',
    datei: 'src/druck/PlanBogen.tsx',
    regel: 'Eine Woche ohne Gruppe steht auf dem Plan-Bogen gepunktet da.',
    suchen: '  const gruppe = (grp: string | null) => gruppenName(grp, state.groups, tu) || <Offen breite={110} />\n',
    ersetzen: '  const gruppe = (grp: string | null) => gruppenName(grp, state.groups, tu)\n',
  },
  {
    id: 'plan-bogen-aufseher',
    datei: 'src/druck/PlanBogen.tsx',
    regel: 'Neben der Gruppe steht ihr Gruppenaufseher.',
    suchen: '  const aufseher = (grp: string | null) => nameVon(state.persons, state.groups.find((g) => g.id === grp)?.overseerId ?? null)\n',
    ersetzen: "  const aufseher = (_grp: string | null) => ''\n",
  },
  {
    id: 'plan-bogen-monatstakt',
    datei: 'src/druck/PlanBogen.tsx',
    regel: 'Im Monatstakt spricht der Plan-Bogen von Monaten — Satz und Spaltenkopf.',
    suchen: "  const monatlich = taktVon(plan) === 'monat'\n",
    ersetzen: '  const monatlich = false\n',
  },
  {
    id: 'plan-bogen-gruppe-fett',
    datei: 'src/druck/PlanBogen.tsx',
    regel: 'Fett steht auf dem Plan-Bogen die Gruppe, die dran ist — nicht ihr Aufseher.',
    suchen: '    betont: 1,\n',
    ersetzen: '',
  },
  {
    id: 'plan-bearbeiten-drucken-handy',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Am Handy steht Drucken vorn in der Leiste von „Plan bearbeiten".',
    suchen: '          <button type="button" className="aktion-neben" onClick={planDrucken}>\n',
    ersetzen: '          <button type="button" className="aktion-neben">\n',
  },
  {
    id: 'plan-bearbeiten-drucken-tablet',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Ab dem Tablet steht Drucken neben dem Titel von „Plan bearbeiten".',
    suchen: '          {breit && laeuft && <DruckKnopf mitText onClick={planDrucken} />}\n',
    ersetzen: '',
  },
  {
    id: 'bogen-verteilen-ueberlang',
    datei: 'src/druck/verteilen.ts',
    regel: 'Ein Block, höher als ein Blatt, läuft weiter, statt abgeschnitten zu werden.',
    suchen: '    aktuell = { indizes: [i], ueberlang: hoehe > platz }\n',
    ersetzen: '    aktuell = { indizes: [i], ueberlang: false }\n',
  },
  {
    id: 'bogen-misst-kopf-und-fuss',
    datei: 'src/druck/Bogen.tsx',
    regel: 'Der Platz je Blatt ist, was zwischen Kopf und Fuß bleibt — gemessen, nicht das ganze Blatt.',
    suchen: '    setBlaetter(blaetterVerteilen(hoehen, BLATT_HOEHE - rand - kopf - fuss - abstand, abstand, anschluss))\n',
    ersetzen: '    setBlaetter(blaetterVerteilen(hoehen, BLATT_HOEHE - rand - abstand, abstand, anschluss))\n',
  },
  {
    id: 'druck-bogen-erst-zeichnen',
    datei: 'src/druck/useDruckBogen.tsx',
    regel: 'Der Bogen steht im DOM, bevor der Druckdialog das Blatt aufnimmt.',
    suchen: '    flushSync(() => setDruck((vorher) => ({ nr: (vorher?.nr ?? 0) + 1, inhalt })))\n',
    ersetzen: '    setDruck((vorher) => ({ nr: (vorher?.nr ?? 0) + 1, inhalt }))\n',
  },
  {
    id: 'druck-bogen-nur-eigener',
    datei: 'src/druck/useDruckBogen.tsx',
    regel: 'Nach dem Druckdialog räumt nur ab, wer gedruckt hat — ein fremdes Kennzeichen bleibt.',
    suchen: '      if (!meiner.current) return\n',
    ersetzen: '',
  },
  {
    id: 'druck-bogen-neu-je-druck',
    datei: 'src/druck/useDruckBogen.tsx',
    regel: 'Jeder Druck zeichnet den Bogen neu — auch wenn der vorige mangels „afterprint" noch dasteht.',
    suchen: '          <div key={druck.nr} className="druck-bogen"',
    ersetzen: '          <div className="druck-bogen"',
  },
  {
    id: 'druck-bogen-kennzeichen',
    datei: 'src/druck/useDruckBogen.tsx',
    regel: 'Gedruckt wird unter dem Kennzeichen „bogen" — auch wenn ein abgebrochener Druck ein anderes stehen ließ.',
    suchen: '    document.documentElement.dataset.print = BOGEN\n',
    ersetzen: '',
  },
  {
    id: 'druck-personen-offen',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Ein freier Platz steht auf dem Bogen gepunktet da, zum Eintragen von Hand.',
    suchen: '          ) : (\n            <Offen />\n          )}\n',
    ersetzen: '          ) : null}\n',
  },
  {
    id: 'druck-namen-knapp-ganz-frei',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Auf dem Monatsbogen ist ein Punkt frei, sobald einer seiner Plätze fehlt — eine halbe Besetzung ist keine.',
    suchen: '  if (slots.some((slot) => !slot.name)) return <Offen breite={84} />\n',
    ersetzen: '',
  },
  {
    id: 'druck-namen-knapp-partner',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Schüler und Partner stehen auf dem Monatsbogen als „A mit B".',
    suchen: "  if (rest.length === 1 && rest[0]?.bereichsKey === 'schulungPartner')\n    return <>{fill(t.druckMit, { a: erster?.name ?? '', b: rest[0].name })}</>\n",
    ersetzen: '',
  },
  {
    id: 'druck-namen-knapp-partner-am-platz',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Der Partner auf dem Monatsbogen ist der Platz „schulungPartner" — nicht das Rollenwort.',
    suchen: "  if (rest.length === 1 && rest[0]?.bereichsKey === 'schulungPartner')\n",
    ersetzen: "  if (rest.length === 1 && rest[0]?.rolle === 'Partner')\n",
  },
  {
    id: 'treffpunkt-anders-tag',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Steht ein Treffpunkt an einem anderen Tag als im Grundplan, nennt „statt" den Tag des Grundplans.',
    suchen: "    [regel.wd !== inst.wd ? tagText(kennung, regel.wd) : '', regel.time, tu(regel.place)].filter(Boolean).join(' · ')\n",
    ersetzen: "    [regel.time, tu(regel.place)].filter(Boolean).join(' · ')\n",
  },
  {
    id: 'druck-hilfsdienste-platzzahl',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Die Hilfsdienste auf dem Bogen füllen bis zur Platzzahl auf — ein freier Platz steht gepunktet da.',
    suchen: '            const plaetze = plaetzeVon(week[key].helpers, service)\n',
    ersetzen: '            const plaetze = week[key].helpers[service.key] ?? []\n',
  },
  {
    id: 'druck-ausfall-grund',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Fällt ein Tag aus, steht auf dem Wochenbogen der Grund statt des Programms.',
    suchen: '  const ausgefallen = istAusgefallen(rawWeek, tab)\n  return (\n    <section className="druck-spalte">\n',
    ersetzen: '  const ausgefallen = false\n  return (\n    <section className="druck-spalte">\n',
  },
  {
    id: 'druck-woche-beide-tage',
    datei: 'src/druck/ZusammenkunftBogen.tsx',
    regel: 'Der Wochenbogen trägt beide Zusammenkünfte auf einem Blatt.',
    suchen: '        <TagVoll tab="we" {...tag} />\n',
    ersetzen: '',
  },
  {
    id: 'druck-kongress-satz',
    datei: 'src/druck/ZusammenkunftBogen.tsx',
    regel: 'Die Kongresswoche steht auf dem Monatsbogen mit einem Satz da, nicht mit leerem Programm.',
    suchen: "      {art === 'kongress' ? (\n",
    ersetzen: '      {false ? (\n',
  },
  {
    id: 'druck-zeitraum-mit-jahr',
    datei: 'src/programm/druck.ts',
    regel: 'Der Wochenbogen nennt die Woche samt Jahr in der Sprache des Lesers.',
    suchen: "  return datumsFormat(lang, 'tagMonatJahr').formatRange(montag, sonntag)\n",
    ersetzen: '  return ersatz\n',
  },
  {
    id: 'druck-kopf-versammlung',
    datei: 'src/druck/DruckBlatt.tsx',
    regel: 'Der Kopf jedes Blatts nennt „Versammlung <Name>".',
    suchen: '          <span className="druck-versammlung">{fill(t.congLabel, { name: state.congregation.name })}</span>\n',
    ersetzen: '          <span className="druck-versammlung">{state.congregation.name}</span>\n',
  },
  {
    id: 'druckwahl-wochenbogen',
    datei: 'src/programm/DruckWahl.tsx',
    regel: '„Diese Woche" druckt bei den Zusammenkünften den Wochenbogen, nicht den Bildschirm.',
    suchen: '        <WochenBogen wi={wi} />\n',
    ersetzen: "        <MonatsBogen monat={monat ?? ''} />\n",
  },
  {
    id: 'versammlung-holen-mehrere',
    datei: 'scripts/gemeinsam.mjs',
    regel: 'Ohne --cong gilt die einzige Versammlung — gibt es mehrere, bricht das Skript ab, statt eine zu raten.',
    suchen: '  if (zeilen.length > 1) {\n',
    ersetzen: '  if (false) {\n',
  },
  {
    id: 'zuruecksetzen-konto-ueber-id',
    datei: 'scripts/versammlung-zuruecksetzen.mjs',
    regel: 'Das Zurücksetzen verknüpft Konten über die Konto-Id — Konten ohne Adresse zeigten sonst alle auf dieselbe Person.',
    suchen: '    const konto = v.userId ? `user_id=eq.${encodeURIComponent(v.userId)}` : `email=eq.${encodeURIComponent(v.email)}`\n',
    ersetzen: '    const konto = `email=eq.${encodeURIComponent(v.email)}`\n',
  },
  {
    id: 'zuruecksetzen-links-zurueck',
    datei: 'scripts/versammlung-zuruecksetzen.mjs',
    regel: 'Ausgegebene Anmelde-Links überstehen das Zurücksetzen — an der neuen Person, mit denselben Prüfsummen.',
    suchen: "    await rest('anmelde_links', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(linkZeilen) })\n",
    ersetzen: '',
  },
  {
    id: 'anlegen-erster-admin-link',
    datei: 'scripts/versammlung-anlegen.mjs',
    regel: 'Eine neue Versammlung gibt ihrem ersten Admin einen Anmelde-Link.',
    suchen: '  const link = await anmeldeLinkAusstellen(roh, planer.id, cong.id)\n',
    ersetzen: "  const link = { url: '', code: '', zettelUrl: '', gueltigBis: new Date().toISOString() }\n",
  },
  {
    id: 'zugang-genau-eine-person',
    datei: 'scripts/zugang-ausstellen.mjs',
    regel: 'Der Notzugang stellt nur aus, wenn der Name genau eine Person trifft — er rät nicht.',
    suchen: '  if (treffer.length === 1) return treffer[0]\n',
    ersetzen: '  if (treffer.length >= 1) return treffer[0]\n',
  },
  {
    id: 'qr-pfad-laeufe',
    datei: 'src/personen/zettel-satz.ts',
    regel: 'Der QR-Code des Zettels trägt genau die Module von uqr — ein Lauf ist so breit, wie er ist.',
    suchen: '      pfad += `M${von} ${y}h${x - von + 1}v1h-${x - von + 1}z`\n',
    ersetzen: '      pfad += `M${von} ${y}h1v1h-1z`\n',
  },
  {
    id: 'laden-wartet-auf-schreiben',
    datei: 'src/app/hydrate.ts',
    regel: 'Das Nachladen liest erst, wenn angekommen ist, was schon hinausging — sonst überholt die Abfrage es.',
    suchen: '  await schreibenAbwarten()\n  const vorher = schreibStand()\n',
    ersetzen: '  const vorher = schreibStand()\n',
  },
  {
    id: 'laden-holt-nach',
    datei: 'src/app/hydrate.ts',
    regel: 'Ging während des Ladens etwas hinaus, wird still noch einmal geladen — sonst stand eine eben gegebene Zusage wieder offen da.',
    suchen: '    return schreibStand() !== vorher\n',
    ersetzen: '    return false\n',
  },
  {
    id: 'schreiben-nur-aenderndes',
    datei: 'src/lib/schreiben-unterwegs.ts',
    regel: 'Lesen (GET) zählt nicht als Schreiben — sonst lüde jedes Nachladen ein zweites Mal.',
    suchen: "  if (methode === 'GET' || methode === 'HEAD') return false\n",
    ersetzen: "  if (methode === 'HEAD') return false\n",
  },
  {
    id: 'schreiben-ohne-anmeldung',
    datei: 'src/lib/schreiben-unterwegs.ts',
    regel: 'Die Anmeldung und das Erneuern ihres Tokens zählen nicht als Schreiben.',
    suchen: "  return !adresseVon(input).includes('/auth/v1/')\n",
    ersetzen: '  return true\n',
  },
  {
    id: 'client-zaehlt-mit',
    datei: 'src/lib/supabase.ts',
    regel: 'Der Supabase-Client schickt seinen fetch über den Zähler — sonst weiß das Nachladen nichts vom Schreiben.',
    suchen: 'createClient(url, anonKey, { global: { fetch: verfolgterFetch() } })',
    ersetzen: 'createClient(url, anonKey)',
  },
  {
    id: 'gelesen-bleibt-beim-oeffnen',
    datei: 'src/app/reducer.ts',
    regel: 'Eine Antwort, abgefragt vor dem eigenen gelesen, macht beim Öffnen der Mitteilungen nichts wieder ungelesen.',
    suchen: '      return { ...state, notifs: gelesenBehalten(action.notifs, state.notifs) }\n',
    ersetzen: '      return { ...state, notifs: action.notifs }\n',
  },
  {
    id: 'gelesen-bleibt-beim-nachladen',
    datei: 'src/app/reducer.ts',
    regel: 'Ein stilles Nachladen macht eine eben gelesene Mitteilung nicht wieder neu.',
    suchen: '        notifs: gelesenBehalten(p.notifications, state.notifs),\n',
    ersetzen: '        notifs: p.notifications,\n',
  },
  {
    id: 'start-ort-uebersetzt',
    datei: 'src/dashboard/DashboardScreen.tsx',
    regel: 'Auf dem Start steht der Ort eines Treffpunkts in der Sprache des Lesers — wie im Programm.',
    suchen: '    return termin.inst.place ? `${titel} · ${i18n.tu(termin.inst.place)}` : titel\n',
    ersetzen: '    return termin.inst.place ? `${titel} · ${termin.inst.place}` : titel\n',
  },
  {
    id: 'buch-regel-versalien',
    datei: 'supabase/functions/_shared/i18n/translate.ts',
    regel: 'Den Kopf der Bibellese schreibt jw.org in Versalien (JEREMIA 42-44) — auch so wird das Buch übersetzt.',
    suchen: '  const namen = [...voll.keys(), ...kurz.keys(), ...versal.keys()].sort((a, b) => b.length - a.length)\n',
    ersetzen: '  const namen = [...voll.keys(), ...kurz.keys()].sort((a, b) => b.length - a.length)\n',
  },
  {
    id: 'buch-stelle-endet-vor-strich',
    datei: 'supabase/functions/_shared/i18n/translate.ts',
    regel: 'Eine Bibelstelle endet vor dem Gedankenstrich — der Rest des Atoms wird für sich übersetzt.',
    suchen: "(?:(?! — ).)*)$`, 'u'),",
    ersetzen: ".*)$`, 'u'),",
  },
  {
    id: 'uset-buecher-im-memo',
    datei: 'src/i18n/useT.ts',
    regel: 'Nach dem Nachladen der Bibelbücher baut useT seinen Übersetzer neu — sonst bleiben Buchnamen deutsch, bis der Baustein neu entsteht.',
    suchen: '  }, [lang, congLang, overlayGen, buecher])\n',
    ersetzen: '  }, [lang, congLang, overlayGen])\n',
  },
  {
    id: 'bibelbuecher-danach-neu-zeichnen',
    datei: 'src/app/store.tsx',
    regel: 'Sind die Bibelbücher nachgeladen, zeichnet die App neu — wie nach einem Sprach-Overlay.',
    suchen: "        if (geladen) dispatch({ type: 'setLang', lang: stateRef.current.lang })\n",
    ersetzen: '        void geladen\n',
  },
  {
    id: 'gesuch-name-ohne-uebersetzer',
    datei: 'src/aufgaben/Angebot.tsx',
    regel: 'Wer einen Hilfsdienst abgesagt hat, steht im Ersatzgesuch da, wie er heißt — ohne Übersetzer.',
    suchen: '      wann={`${aufgabenTp(req, i18n)(req.date)} · ${req.declinedBy}`}',
    ersetzen: '      wann={`${aufgabenTp(req, i18n)(req.date)} · ${i18n.tu(req.declinedBy)}`}',
  },
  {
    id: 'plan-nur-planer',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Nachrichten an die ganze Versammlung darf nur auslösen, wer zuteilt — Admin oder Planer.',
    suchen: "    if (aufseherVon && (payload.action === 'erinnern' || aufseherVon.size === 0)) {",
    ersetzen: '    if (false) {',
  },
  {
    id: 'plan-planer-darf-senden',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Der Planer sendet wie der Admin (4.10.2026).',
    suchen: '    const darfZuteilen = Boolean(mich?.planner || mich?.zuteiler)',
    ersetzen: '    const darfZuteilen = Boolean(mich?.planner)',
  },
  {
    id: 'plan-aufseher-nur-eigene-gruppe',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Der Gruppenaufseher sendet nur die Treffpunkte seiner Gruppe — nicht die Zusammenkünfte, nicht eine fremde Gruppe.',
    suchen: '    const zuSenden = eigeneTreffpunkte\n',
    ersetzen: '    const zuSenden = false\n',
  },
  {
    id: 'plan-nicht-zweimal',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Gesendet wird nur, was das Tagebuch noch nicht kennt — sonst kommt nach jeder Nachbesserung alles erneut.',
    suchen:
      '    const neu = zuSenden.filter((p) => !schonGemeldet.has(tagebuchSchluessel(p.key, p.name)))',
    ersetzen: '    const neu = zuSenden',
  },
  {
    id: 'plan-je-person-eine',
    datei: 'supabase/functions/send-plan/index.ts',
    /*
      Ohne die Bündelung bekäme jemand mit drei Plätzen drei Nachrichten. Die
      Mutation wirft die bisherigen Aufgaben weg, statt die neue anzuhängen —
      dann trägt die Nachricht nur noch eine, und der Fall „wer zwei Aufgaben
      hat, bekommt EINE Nachricht mit beiden" fällt auf.
    */
    regel: 'Je eingeteilter Person geht EINE Nachricht hinaus, nicht je Aufgabe.',
    suchen: '    jePerson.set(uid, [...(jePerson.get(uid) ?? []), p])',
    ersetzen: '    jePerson.set(uid, [p])',
  },

  // ── Treffpunkt-Wochenkennung (T100) ───────────────────────────────────────
  /*
   * Hier stand `fs-woche-aus-der-woche`: „Der Montag einer Treffpunkt-Woche
   * kommt aus der Woche selbst, nicht aus der Ordnungszahl." Die Mutation
   * stellte in `fsKennung` den Rückfall `fsBase + wi·7` wieder her. Seit dem
   * 25.9.2026 gibt es weder `fsKennung` noch eine Datumsbasis: Jede Stelle
   * liest `Week.start` unmittelbar, und `Week.start` ist Pflicht. Die Regel
   * ist damit Struktur — es gibt keine zweite Rechnung mehr, auf die eine
   * Mutation zurückfallen könnte. Was bleibt, prüfen die drei Anker darunter
   * je Leser: Sie nehmen ihm die Woche aus der Hand.
   */
  {
    id: 'fs-woche-im-kandidatenblatt',
    datei: 'src/planen/kandidaten.ts',
    regel:
      'Das Kandidatenblatt prüft die Abwesenheit am Tag DIESER Woche — sonst widerspricht es dem Konfliktbanner daneben um sieben Tage.',
    /*
      Die Mutation nimmt dem Blatt die Woche aus der Hand: Ohne Kennung bleibt
      die Abwesenheitsprüfung aus, und der Abwesende steht wieder vorn.
    */
    suchen: "fsTag(state.weeks[sel.wi]?.start ?? '', inst.wd)",
    ersetzen: "fsTag('', inst.wd)",
  },
  {
    id: 'fs-woche-in-der-zeitleiste',
    datei: 'src/personen/person-timeline.ts',
    regel:
      'Auch die Zeitleiste nimmt den Montag aus der Woche — sonst nennt sie bei einer Lücke im Bestand zwei Termine derselben Woche eine Woche auseinander.',
    /*
      Die Mutation rechnet wieder aus der Ordnungszahl: Montag der Woche 0 plus
      `wi` Wochen. Ohne Lücke im Bestand ist das dasselbe — nur die Probe mit
      der herausgenommenen Woche merkt etwas.
    */
    suchen: "      const datum = fsTag(state.weeks[wi]?.start ?? '', inst.wd)\n",
    ersetzen:
      "      const datum = fsTag(state.weeks[0]?.start ?? '', inst.wd)\n" +
      '      if (datum) datum.setDate(datum.getDate() + wi * 7)\n',
  },
  {
    id: 'fs-woche-im-versand',
    datei: 'src/data/plan-versand.ts',
    /*
      Die Mutation nimmt dem Versand die Woche aus der Hand: Der Schlüssel
      trägt dann keinen Montag mehr — und die Edge Function, die ihn aus der
      Datenbankzeile nimmt, meint eine andere Menge.
    */
    regel:
      'Auch „Plan senden" nimmt den Montag aus der Woche — die Edge Function nimmt ihn aus der Datenbankzeile, und beide müssen dieselbe Woche meinen.',
    suchen: '    nimm(fsTaskKey(kennung, inst.id), inst.leader, () => ({',
    ersetzen: "    nimm(fsTaskKey('', inst.id), inst.leader, () => ({",
  },
  /*
   * Hier stand `fs-kennung-migration-kette`: „Beim Umschreiben der
   * Treffpunkt-Schlüssel blockiert ein besetztes Ziel nur dann, wenn es nicht
   * selbst weiterzieht." Das Umschreiben ist mit der Altlasten-Räumung (T104)
   * weggefallen — es gibt nur noch eine Form des Schlüssels, und damit nichts
   * mehr umzuschreiben.
   */

  // ── Mitteilungen: Umfang und Bezeichnung (T102) ───────────────────────────
  {
    id: 'plan-liest-nur-die-woche',
    // Die beiden Präfixe kommen inzwischen aus `wochenPraefixe` — eine Stelle
    // für `send-plan` und den Präfix-Vergleich im Client statt zweier.
    datei: 'supabase/functions/_shared/aufgaben-schluessel.ts',
    /*
      Der Filter darf nach beiden Seiten nicht danebenliegen. Die Mutation
      lässt die zweite Schlüsselform weg — die der Treffpunkte, als einzige
      ohne führenden Montag. Ohne sie gilt jede Treffpunkt-Leitung als noch
      nicht gemeldet, und der Leiter bekommt bei jedem Druck dieselbe
      Nachricht erneut.
    */
    regel:
      'Der Wochenfilter deckt BEIDE Schlüsselformen ab — `<Montag>|…` und `fs|<Montag>|…`.',
    suchen: '  return [`${woche}|`, `fs|${woche}|`]',
    ersetzen: '  return [`${woche}|`, `${woche}|`]',
  },
  {
    id: 'entzug-loescht-jeden-eintrag',
    datei: 'supabase/functions/send-plan/index.ts',
    /*
      Seit der Entzug als Liste kommt, ist „den Eintrag löschen" ein „jeden
      Eintrag löschen". Die Mutation nimmt nur den ersten. Bliebe einer stehen,
      bekäme die Person bei einer erneuten Zuteilung auf denselben Platz keine
      Nachricht mehr — er zählte als gemeldet.
    */
    regel:
      'Ein Entzug räumt JEDEN Platz der Liste aus dem Versand-Tagebuch, nicht nur den ersten.',
    suchen: '        entzuege.map((e) =>\n          rest.send(',
    ersetzen: '        entzuege.slice(0, 1).map((e) =>\n          rest.send(',
  },
  {
    id: 'entzug-als-liste',
    datei: 'src/app/persist.ts',
    /*
      Je Entzug ein eigener Aufruf hieß: Die Function las für jeden davon aufs
      Neue alle Mitglieder, Personen und Push-Abos. Die Mutation stellt genau
      das wieder her — inhaltlich geht dasselbe hinaus, nur eben in N Aufrufen
      und als N Nachrichten an dieselbe Person.
    */
    regel:
      'Alle Entzüge einer Änderung gehen in EINEM Aufruf hinaus — und je Person als eine Nachricht.',
    suchen: '    if (entzogen.length > 0) sendPlanEntzug(entzogen)',
    ersetzen: '    for (const z of entzogen) sendPlanEntzug([z])',
  },
  {
    id: 'treffpunkt-ort-im-termin',
    datei: 'supabase/functions/_shared/zuteilungen.ts',
    /*
      Die Mutation stellt die alte Fassung wieder her: Ort in der Bezeichnung,
      Termin ohne Ort. Der Client macht es umgekehrt — wer erst erinnert und
      dann entzogen wird, las dieselbe Auskunft in zwei Reihenfolgen.
    */
    regel:
      'Der Ort eines Treffpunkts steht im Termin, nicht in der Bezeichnung — auf beiden Seiten gleich.',
    suchen: '      label: FS_LEITER,',
    ersetzen: '      label: inst.place ? `${FS_LEITER} · ${inst.place}` : FS_LEITER,',
  },
  {
    id: 'glocke-laedt-nach-wenn-neu',
    datei: 'src/mitteilungen/useMitteilungenNachladen.ts',
    /*
      Zwei Fehler sind hier möglich, und die Probe misst beide Richtungen über
      denselben Ausdruck: Wer nie voll nachlädt, zeigt die frische Zuteilung
      ohne den Bestätigen-Knopf, für den sie den Schlüssel mitbringt; wer immer
      voll nachlädt, holt für fünfzig Zeilen Text die ganze Versammlung.
    */
    regel:
      'Die Mitteilungen laden den ganzen Bestand nur nach, wenn wirklich eine neue Zeile dabei ist.',
    suchen: 'if (frisch.some((n) => !bekannt.has(n.id))) {',
    ersetzen: 'if (false) {',
  },

  // ── Start-Bildschirm: die Planungs-Karte (T95) ────────────────────────────
  {
    id: 'planung-nur-beim-planer',
    datei: 'src/dashboard/DashboardScreen.tsx',
    regel: 'Die Planungs-Karte steht nur bei Admin und Planer — sie führt in einen Screen, den sonst niemand betreten darf.',
    suchen: '        {zuteilen && (\n          <div className="start-spalte">\n            <PlanungsKarte />',
    ersetzen: '        {(\n          <div className="start-spalte">\n            <PlanungsKarte />',
  },
  {
    id: 'planung-ab-laufender-woche',
    datei: 'src/data/planungsstand.ts',
    /*
      Die Mutation lässt die Karte bei der ersten geladenen Woche beginnen. Mit
      einer oder zwei Wochen davor bliebe das unbemerkt — vergangene Wochen
      zählen nichts und fallen heraus. Mit einem ganzen Jahr Bestand, wie die
      App ihn lädt, belegen sie die vier Zeilen, und die kommende fehlt.
    */
    regel:
      'Die Karte beginnt bei der laufenden Kalenderwoche — nicht bei der ältesten geladenen (und nicht erst bei der nächsten Zusammenkunft, die Kongresswochen überspringt).',
    suchen: '    return sonntag !== null && sonntag >= heuteMs',
    ersetzen: '    return sonntag !== null',
  },
  {
    id: 'planung-hoechstens-vier-zeilen',
    datei: 'src/data/planungsstand.ts',
    regel: 'Die Karte zeigt höchstens vier Wochen — acht frisch importierte wären acht Zeilen „offen".',
    suchen: 'for (let wi = ab; wi < weeks.length && out.length < WOCHEN_VORAUS; wi++) {',
    ersetzen: 'for (let wi = ab; wi < weeks.length; wi++) {',
  },
  {
    id: 'planung-luecke-streckt-nicht',
    datei: 'src/data/planungsstand.ts',
    regel: 'Eine Lücke im Bestand streckt die Karte nicht über vier Kalenderwochen hinaus (T66).',
    suchen: '    if (start && Date.parse(start) >= grenzeMs) break\n',
    ersetzen: '',
  },
  {
    id: 'planung-nur-mit-handlungsbedarf',
    datei: 'src/data/planungsstand.ts',
    regel: 'Eine fertig geplante und gesendete Woche steht nicht auf der Karte.',
    suchen: 'if (stand.konflikte + stand.nichtBesetzbar + stand.offen + stand.nichtGesendet > 0) {',
    ersetzen: 'if (true) {',
  },
  {
    id: 'planung-vorbei-zaehlt-nicht',
    datei: 'src/data/planungsstand.ts',
    regel: 'Eine Zusammenkunft, die vorbei ist, zählt auf der Karte nicht mehr (T77).',
    suchen: '(tab) => !istAusgefallen(week, tab) && !istVorbei(meetingDateMs(week, tab, q.zeiten), heute),',
    ersetzen: '(tab) => !istAusgefallen(week, tab),',
  },
  {
    id: 'planung-entfallen-zaehlt-nicht',
    datei: 'src/data/planungsstand.ts',
    regel: 'Eine entfallene Zusammenkunft zählt auf der Karte nicht — ihre Plätze braucht niemand (T30).',
    suchen: '(tab) => !istAusgefallen(week, tab) && !istVorbei(meetingDateMs(week, tab, q.zeiten), heute),',
    ersetzen: '(tab) => !istVorbei(meetingDateMs(week, tab, q.zeiten), heute),',
  },
  {
    id: 'planung-treffpunkt-vorbei',
    datei: 'src/data/planungsstand.ts',
    regel: 'Ein Treffpunkt, dessen Tag vorbei ist, zählt nicht mehr als offen.',
    suchen: '  const fsOffen = (q.fsWeeks[wi] ?? []).filter((inst) => !inst.leader && fsAnstehend(inst.wd)).length',
    ersetzen: '  const fsOffen = (q.fsWeeks[wi] ?? []).filter((inst) => !inst.leader).length',
  },
  {
    id: 'plan-vorbei-nicht-mehr-zaehlen',
    datei: 'src/data/plan-versand.ts',
    /*
      Seit der Durchsicht von T95 steht die Regel in der Vorschau selbst, nicht
      mehr nur auf der Karte: Knopf, Karte und Function zählen dieselbe Menge.
    */
    regel: '„Plan senden" zählt keine Zuteilung, deren Zusammenkunft vorbei ist — am Knopf und auf der Karte.',
    suchen: '      if (wo && vorbei.has(wo.tab)) return\n      nimm(key, slot.name, task)',
    ersetzen: '      nimm(key, slot.name, task)',
  },
  {
    id: 'plan-vorbei-treffpunkt-nicht-mehr-zaehlen',
    datei: 'src/data/plan-versand.ts',
    regel: 'Ebenso ein Treffpunkt, dessen eigener Tag vorbei ist.',
    suchen: '    if (fsTagVorbei(kennung, inst.wd, heute)) continue\n    nimm(fsTaskKey(kennung, inst.id), inst.leader, () => ({',
    ersetzen: '    nimm(fsTaskKey(kennung, inst.id), inst.leader, () => ({',
  },
  {
    id: 'plan-vorbei-function-zusammenkunft',
    datei: 'supabase/functions/_shared/zuteilungen.ts',
    regel: 'Die Function schickt keine Nachricht über eine Zusammenkunft, die gewesen ist.',
    suchen: '    if (terminVorbei(weekStart, offset, heuteUTC)) continue\n',
    ersetzen: '',
  },
  {
    id: 'plan-vorbei-function-treffpunkt',
    datei: 'supabase/functions/_shared/zuteilungen.ts',
    regel: 'Und keine über einen Treffpunkt, dessen Tag vorbei ist.',
    suchen: '    if (terminVorbei(weekStart, pend.offset, heuteUTC)) continue\n',
    ersetzen: '',
  },
  {
    id: 'plan-heute-des-planers',
    datei: 'supabase/functions/send-plan/index.ts',
    /*
      Ohne den mitgeschickten Tag rechnet der Server in UTC — zwischen
      Mitternacht und 02:00 in Mitteleuropa ein anderer Tag als am Knopf, und
      die Zahl ginge nach dem Drücken nicht auf null.
    */
    regel: 'Die Function meint denselben Kalendertag wie der Knopf, der gezählt hat.',
    suchen: '      heuteUtc(payload.heute),',
    ersetzen: '      heuteUtc(undefined),',
  },
  {
    id: 'plan-heute-plausibel',
    datei: 'supabase/functions/_shared/planung.ts',
    regel: 'Ein mitgeschickter Tag, der mehr als einen Tag neben der Serveruhr liegt, wird nicht geglaubt.',
    suchen: '  if (Number.isNaN(client) || Math.abs(client - server) > 864e5) return server',
    ersetzen: '  if (Number.isNaN(client)) return server',
  },
  {
    id: 'plan-knopf-schickt-seinen-tag',
    datei: 'src/planen/wochen-versand.ts',
    regel: 'Der Knopf schickt den Tag mit, mit dem er gezählt hat.',
    suchen: '  return useSenden(week?.start ?? null, (start) => sendPlan(start, tag))',
    ersetzen: "  return useSenden(week?.start ?? null, (start) => sendPlan(start, ''))",
  },
  {
    id: 'entzug-vorbei-schweigt',
    datei: 'src/data/plan-versand.ts',
    regel: 'Ein Entzug für einen vergangenen Platz meldet nichts — wer nachträgt, nimmt niemandem etwas.',
    suchen: '    if (!betroffen(key, slot.name)) return\n    const wo = taskKeyWeek(key)\n    if (wo && vorbei.has(wo.tab)) return\n',
    ersetzen: '    if (!betroffen(key, slot.name)) return\n',
  },
  {
    id: 'entzug-vorbei-schweigt-treffpunkt',
    datei: 'src/data/plan-versand.ts',
    regel: 'Ebenso für einen Treffpunkt, dessen Tag vorbei ist.',
    suchen: '    if (!betroffen(key, inst.leader)) continue\n    if (fsTagVorbei(kennung, inst.wd, heute)) continue\n',
    ersetzen: '    if (!betroffen(key, inst.leader)) continue\n',
  },
  {
    id: 'planung-engpass-ist-problem',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    // Seit Phase 10 (T121) mit den Wörtern der Wochen beim Planen: „Probleme"
    // umfasst Konflikte und was nicht besetzbar ist (`lageDerWoche`).
    regel: 'Was nicht besetzbar ist, nennt die Karte als Problem — auch ohne Konflikt in der Woche.',
    suchen: '                {w.konflikte + w.nichtBesetzbar > 0 && (\n',
    ersetzen: '                {w.konflikte > 0 && (\n',
  },
  {
    id: 'planung-offline-kein-senden',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    /*
      Die Regel steht in der reinen Funktion (`sendenMoeglich`) und ist dort
      geprüft — gemessen wird hier der Aufrufer, der den Offline-Stand
      hineingeben muss. Genau diese Hälfte ist die, die vergessen wird.
    */
    regel: 'Offline zeigt die Karte kein „Plan senden" — Planen blendet den Knopf dann auch aus.',
    suchen: '  const sendenMoeglich = state.staleAt === null\n',
    ersetzen: '  const sendenMoeglich = true\n',
  },
  {
    id: 'planung-vorrat-ohne-wochen',
    datei: 'src/data/planungsstand.ts',
    regel: 'Ohne jede geladene Woche erinnert die Karte an den ersten Import.',
    suchen: 'if (weeks.length === 0) return true',
    ersetzen: 'if (weeks.length === 0) return false',
  },
  {
    id: 'planung-vorrat-drei-wochen',
    datei: 'src/data/planungsstand.ts',
    regel: 'Reichen die Programme weniger als drei Wochen voraus, erinnert die Karte an den Import — nicht erst, wenn nichts mehr da ist.',
    suchen: 'return geladenBisMs - kalendertagMs(heute) < VORRAT_TAGE * 864e5',
    ersetzen: 'return geladenBisMs - kalendertagMs(heute) < 0',
  },
  {
    id: 'planung-karte-folgt-dem-tag',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Die gemerkte Karte rechnet neu, sobald der Kalendertag wechselt — nicht erst, wenn sich die Wochen ändern.',
    suchen: '      sendenMoeglich,\n      tag,\n    ],',
    ersetzen: '      sendenMoeglich,\n    ],',
  },
  {
    id: 'kalendertag-beim-zurueckkehren',
    datei: 'src/app/useKalendertag.ts',
    regel: 'Kehrt die App aus dem Hintergrund zurück, wird der Tag neu gelesen — dort hält das Betriebssystem Zeitgeber an.',
    suchen: "    document.addEventListener('visibilitychange', beimZurueckkehren)\n",
    ersetzen: '',
  },
  {
    id: 'planung-aufrufer-treffpunkte',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Die Karte gibt die Treffpunkte der Wochen an die Rechnung weiter.',
    suchen: '          fsWeeks: state.fsWeeks,',
    ersetzen: '          fsWeeks: [],',
  },
  {
    id: 'planung-aufrufer-abwesenheiten',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Die Karte gibt die Abwesenheiten weiter — sonst fehlt der abwesende Treffpunkt-Leiter unter den Konflikten.',
    suchen: '          absences: state.absences,',
    ersetzen: '          absences: [],',
  },
  {
    id: 'planung-aufrufer-tagebuch',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Die Karte gibt das Versand-Tagebuch weiter — sonst stünde jede gesendete Woche wieder mit „Plan senden" da.',
    suchen: '          sentLog: state.sentLog,',
    ersetzen: '          sentLog: {},',
  },
  {
    id: 'planung-reiter-treffpunkt-senden',
    datei: 'src/data/planungsstand.ts',
    regel: 'Ist nur ein Treffpunkt-Leiter noch nicht benachrichtigt, öffnet Planen bei den Treffpunkten.',
    suchen: "  return ungesendet.some((m) => !m.key.startsWith('fs|')) ? (jeTab[0]?.tab ?? 'mid') : 'fs'",
    ersetzen: "  return jeTab[0]?.tab ?? 'mid'",
  },
  {
    id: 'planung-zeitraum-sichtbar',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: '„Alles zugeteilt" nennt den Zeitraum, für den es gilt.',
    suchen: '          {zeitraum && <span className="dash-plan-zeitraum">{zeitraum}</span>}\n',
    ersetzen: '',
  },
  {
    id: 'planung-wochenspanne-variante',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Die Wochenspanne steht in derselben Sprachvariante wie der Kopf in Planen.',
    suchen: "        const p = week ? progWeek(week) : null\n        return { ...w, spanne: p ? p.tpw(p.week.range) : '' }",
    ersetzen: "        return { ...w, spanne: week?.range ?? '' }",
  },
  {
    id: 'planung-konflikte-je-zusammenkunft',
    datei: 'src/data/planungsstand.ts',
    regel: 'Die Konflikte einer vergangenen Zusammenkunft zählen nicht mit, auch wenn die Woche als Ganzes gerechnet wird.',
    suchen: '    konflikte: alleKonflikte.filter((c) => c.tab === tab).length,',
    ersetzen: '    konflikte: alleKonflikte.length,',
  },
  {
    id: 'navigation-woche-nur-mit-recht',
    datei: 'src/app/reducer.ts',
    regel: 'Ein abgewiesener Sprung auf eine bestimmte Woche stellt die Woche nicht um.',
    // Ob das Ziel erreicht wurde, steht inzwischen am Screen selbst: `screen`
    // ist nach einer Abweisung ein anderer als der gewünschte.
    suchen: '      if (action.woche && screen === action.screen) {',
    ersetzen: '      if (action.woche) {',
  },
  {
    id: 'start-nur-eigene-treffpunkte',
    /*
      Die Karte „Aktuelle Woche", die das selbst filterte, gibt es seit dem
      19.9.2026 nicht mehr — der Start liest `state.myTasks`. Damit ist die
      Regel dorthin gewandert, wo diese Liste entsteht: `deriveMyFsTasks`
      ordnet über die Person-Id zu, mit Rückfall auf den Namen. Ohne sie sähen
      Namensgleiche gegenseitig ihre Treffpunkte — und zwar überall, nicht nur
      auf dem Start.
    */
    datei: 'src/data/fs.ts',
    regel: 'Eine Treffpunkt-Leitung gehört in die Aufgaben ihres Leiters, nicht in fremde.',
    // Seit dem 25.9.2026 fragt die Ableitung `gehoertZuKennung` — die Mutation
    // lässt jede besetzte Leitung durch, gleich wem sie gehört.
    suchen: '      if (!gehoertZuKennung(fsLeiterZuteilung(inst), personId, personName)) continue',
    ersetzen: '      if (!fsLeiterZuteilung(inst)) continue',
  },
  {
    id: 'start-wochenfolge',
    // Aus der Karte wurde die Zeitleiste (19.9.2026), aus der Zeitleiste die
    // Termine der Woche (T121) — die Regel blieb: Zusammenkünfte und
    // Treffpunkte stehen gemischt in der Folge ihrer Tage.
    datei: 'src/dashboard/diese-woche.ts',
    regel: 'Die Termine der Woche stehen in Tagesfolge — der Treffpunkt am Samstag vor der Zusammenkunft am Sonntag.',
    suchen: '  return termine.sort((a, b) => a.tag.getTime() - b.tag.getTime() || a.zeit.localeCompare(b.zeit))',
    ersetzen: '  return termine',
  },
  {
    id: 'treffpunkt-freitext-gehoert-niemandem',
    datei: 'src/data/fs.ts',
    regel: 'Ein auswärtiger Treffpunkt-Leiter (Freitext) gehört niemandem hier, auch keinem Gleichnamigen.',
    suchen: '  if (!inst.leader || inst.lext) return undefined',
    ersetzen: '  if (!inst.leader) return undefined',
  },

  // ── Predigtdienstgruppe löschen · ohne Gruppe (13.9.2026) ────────────────
  {
    id: 'gruppe-loeschen-rueckfrage',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Eine Predigtdienstgruppe wird erst mit dem zweiten Tipp entfernt — der erste fragt nach.',
    suchen:
      "        <EntfernenKnopf\n          className=\"knopf-umriss knopf-entfernen\"\n          text={t.gruppeEntfernen}\n          onEntfernen={() => {\n            dispatch({ type: 'removeGroup', id: gruppe.id })\n            onClose()\n          }}\n        />",
    ersetzen:
      "        <button\n          type=\"button\"\n          className=\"knopf-umriss knopf-entfernen\"\n          onClick={() => {\n            dispatch({ type: 'removeGroup', id: gruppe.id })\n            onClose()\n          }}\n        >\n          {t.gruppeEntfernen}\n        </button>",
  },
  {
    id: 'gruppe-loeschen-folgen-mitglieder',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Vor dem Entfernen steht da, dass die Mitglieder der Gruppe danach ohne Gruppe dastehen.',
    suchen: "  if (daten.persons.some((p) => p.grp === gruppeId)) folgen.push('mitglieder')\n",
    ersetzen: '',
  },
  {
    id: 'gruppe-loeschen-folgen-treffpunkte',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Vor dem Entfernen stehen die Treffpunkte da, die mit der Gruppe gehen — auch die einmaligen.',
    suchen:
      "  const rest = fsGruppeEntfernen(daten.fsRules, daten.fsWeeks, gruppeId)\n  if (rest.fsRules !== daten.fsRules || rest.fsWeeks !== daten.fsWeeks) folgen.push('treffpunkte')",
    ersetzen: "  if (daten.fsRules.some((r) => r.grp === gruppeId)) folgen.push('treffpunkte')",
  },
  {
    id: 'gruppe-loeschen-treffpunkte',
    datei: 'src/app/reducer.ts',
    regel: 'Mit einer Predigtdienstgruppe gehen ihre Treffpunkte — aus dem Grundplan und aus jeder Woche.',
    suchen: '      const { fsRules, fsWeeks } = fsGruppeEntfernen(state.fsRules, state.fsWeeks, action.id)',
    ersetzen: '      const { fsRules, fsWeeks } = { fsRules: state.fsRules, fsWeeks: state.fsWeeks }',
  },
  {
    id: 'gruppe-loeschen-auch-einmalige',
    datei: 'src/data/fs.ts',
    regel: 'Auch die nur für eine Woche angelegten Treffpunkte einer gelöschten Gruppe gehen mit.',
    suchen: '    return week.filter((inst) => inst.grp !== grp)\n  })\n  return { fsRules, fsWeeks: geaendert ? weeks : fsWeeks }',
    ersetzen:
      '    return week.filter((inst) => inst.grp !== grp || inst.manual)\n  })\n  return { fsRules, fsWeeks: geaendert ? weeks : fsWeeks }',
  },
  {
    id: 'gruppe-loeschen-versammlung-bleibt',
    datei: 'src/data/fs.ts',
    regel: 'Die Kennung `null` ist die Versammlung — für sie wird kein Treffpunkt gestrichen.',
    suchen: '  if (!grp) return { fsRules: rules, fsWeeks }\n',
    ersetzen: '',
  },
  {
    id: 'gruppe-loeschen-speichern',
    datei: 'src/app/persist.ts',
    regel: 'Das Löschen einer Gruppe schreibt Grundplan und Wochen ohne ihre Treffpunkte in die Datenbank.',
    suchen: '      // gegenüber der Kaskade nur eine Wiederholung, keine zweite Wahrheit.\n      treffpunkteSpeichern(congId, prev, next, fsVerwaist)',
    ersetzen: '      // gegenüber der Kaskade nur eine Wiederholung, keine zweite Wahrheit.',
  },
  {
    id: 'gruppe-loeschen-gebuendelt',
    datei: 'src/app/persist.ts',
    regel: 'Ein gebündelt ausstehender Grundplan bringt die Regeln einer gelöschten Gruppe nicht zurück.',
    suchen: '      // gegenüber der Kaskade nur eine Wiederholung, keine zweite Wahrheit.\n      treffpunkteSpeichern(congId, prev, next, fsVerwaist)',
    // Am Bündler vorbei **und** ohne die Streichungen — genau der Stand, den
    // `saveFsRules` vor dem 21.9.2026 hatte.
    ersetzen:
      '      // gegenüber der Kaskade nur eine Wiederholung, keine zweite Wahrheit.\n      saveFsRules(congId, next.fsRules)',
  },
  {
    id: 'ohne-gruppe-rolle-keine',
    datei: 'src/data/helpers.ts',
    regel: 'Die Rolle „Keine" (Schüler ohne Verkündiger-Status) braucht keine Predigtdienstgruppe.',
    suchen: "  return persons.filter((p) => p.role !== 'keine' && !(p.grp && vorhanden.has(p.grp)))",
    ersetzen: '  return persons.filter((p) => !(p.grp && vorhanden.has(p.grp)))',
  },
  {
    id: 'ohne-gruppe-verwaist',
    datei: 'src/data/helpers.ts',
    regel: 'Ein Verweis auf eine Gruppe, die es nicht mehr gibt, zählt als keine Gruppe.',
    suchen: "  return persons.filter((p) => p.role !== 'keine' && !(p.grp && vorhanden.has(p.grp)))",
    ersetzen: "  return persons.filter((p) => p.role !== 'keine' && !p.grp)",
  },
  {
    id: 'ohne-gruppe-ohne-gruppen',
    datei: 'src/data/helpers.ts',
    regel: 'Ohne angelegte Gruppen meldet die Warnung „ohne Gruppe" niemanden.',
    suchen: '  if (groups.length === 0) return []\n  const vorhanden',
    ersetzen: '  const vorhanden',
  },
  // ── Eindeutige Personennamen (T110) ───────────────────────────────────────
  {
    id: 'name-vergleich-ohne-schreibweise',
    datei: 'src/data/helpers.ts',
    regel: 'Gleich heißt gleich ungeachtet der Groß-/Kleinschreibung und mehrfacher Leerzeichen.',
    suchen: "  return displayName(p).replace(/\\s+/g, ' ').toLowerCase()",
    ersetzen: '  return displayName(p)',
  },
  {
    id: 'name-eigene-person-keine-dublette',
    datei: 'src/data/helpers.ts',
    regel: 'Eine Person ist nie ihre eigene Dublette — sonst ließe sie sich nicht mehr bearbeiten.',
    suchen: '  return persons.find((p) => p.id !== person.id && namensSchluessel(p) === schluessel)',
    ersetzen: '  return persons.find((p) => namensSchluessel(p) === schluessel)',
  },
  {
    id: 'name-namenlose-sind-keine-dublette',
    datei: 'src/data/helpers.ts',
    regel: 'Zwei Personen ohne Namen sind keine Dublette (frisch angelegt, noch nichts getippt).',
    suchen: '  if (!schluessel) return undefined',
    ersetzen: '',
  },
  {
    id: 'name-feld-meldet-die-dublette',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: '„Person bearbeiten" nennt am Feld, wer den Namen schon trägt.',
    suchen: '  const dublette = namensDublette(state.persons, name)',
    ersetzen: '  const dublette = undefined',
  },
  {
    id: 'ohne-gruppe-warnung-personen',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Die Personenliste warnt vor Personen ohne Predigtdienstgruppe.',
    suchen: '      ohne: ohneGruppe(sortiert, groups),',
    ersetzen: '      ohne: [],',
  },
  {
    id: 'ohne-gruppe-hinweis-einstellungen',
    datei: 'src/einstellungen/GruppenInhalt.tsx',
    regel: 'Über den Gruppen der Einstellungen steht, wie viele keiner Gruppe zugeordnet sind.',
    suchen: '  const ohne = ohneGruppe(state.persons, state.groups)',
    ersetzen: '  const ohne: Person[] = []',
  },

  // ── Ein gelöschter Dienst nimmt seine Spuren mit (T105) ───────────────────
  {
    id: 'dienst-bereich-bleibt',
    datei: 'src/data/dienste.ts',
    regel: 'Mit dem Dienst verschwindet sein Aufgabenbereich aus jeder Person.',
    suchen: '    if (!(bereich in p.priv)) return p',
    ersetzen: '    return p',
  },
  {
    id: 'dienst-plaetze-bleiben',
    datei: 'src/data/dienste.ts',
    regel: 'Mit dem Dienst verschwindet seine Platzreihe aus den geladenen Wochen.',
    suchen: '      if (!(key in week[tab].helpers)) continue',
    ersetzen: '      continue',
  },
  {
    id: 'dienst-zusagen-bleiben',
    datei: 'src/data/dienste.ts',
    regel: 'Mit dem Dienst verschwinden die Bestätigungen seiner Plätze.',
    suchen: '      arr.forEach((_slot, pos) => out.push(helferKey(week.start, tab, key, pos)))',
    ersetzen: '      void arr',
  },
  {
    id: 'haushalt-vor-person',
    datei: 'src/app/persist.ts',
    regel: 'Der Haushalt geht vor den Personen hinaus — sonst weist der Fremdschlüssel sie ab.',
    suchen: '        saveFamily(congId, haushalt, geaendert)\n',
    ersetzen: '        for (const p of geaendert) personSofort(congId, p)\n',
  },
  {
    id: 'push-gesucht-einspringen',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Ein Klick auf „Ersatz gesucht" führt zum Bereich Einspringen, nicht an den Anfang der Aufgaben (T109).',
    suchen: '`${APP_URL}#go=aufgaben&abschnitt=einspringen`',
    ersetzen: '`${APP_URL}#go=aufgaben`',
  },
  {
    id: 'sprung-wartet-auf-bereich',
    datei: 'src/aufgaben/AufgabenScreen.tsx',
    regel: 'Der Sprung zum Einspringen wartet, bis das Gesuch nach dem Nachladen dasteht (T109).',
    suchen: '  }, [state.sprungZiel, gesucheOffen, dispatch])',
    ersetzen: '  }, [state.sprungZiel, dispatch])',
  },
  {
    id: 'kontakt-betreff-kodiert',
    datei: 'src/login/kontakt.ts',
    regel: 'Der Betreff der Anfrage an den Betreiber steht kodiert im mailto-Verweis — sonst zerbricht er an Leerzeichen, fremder Schrift und einem & (T113).',
    suchen: '?subject=${encodeURIComponent(betreff)}',
    ersetzen: '?subject=${betreff}',
  },
  {
    id: 'kontakt-adresse-ltr',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Die Kontaktadresse bleibt auf Arabisch, Hebräisch, Persisch und Urdu links-nach-rechts lesbar (T113).',
    suchen: 'href={kontaktVerweis(t.anfrageBetreff)} dir="ltr"',
    ersetzen: 'href={kontaktVerweis(t.anfrageBetreff)}',
  },
  {
    id: 'kontakt-auch-in-der-demo',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Der Kontakt für eine neue Versammlung öffnet auch in der Demo eine Mail — wer sie ansieht, ist genau der, der fragen würde (T113).',
    suchen: 'href={kontaktVerweis(t.anfrageBetreff)}',
    ersetzen: 'href={isSupabaseConfigured ? kontaktVerweis(t.anfrageBetreff) : undefined}',
  },

  /* ---- Weitere Pläne (T120, Phase 5) ---- */
  {
    id: 'wp-schema-entwurf-nur-fuer-planer',
    datei: 'supabase/schema.sql',
    regel: 'Einen Entwurf liefert die Datenbank nur einem Planer aus.',
    suchen: '       and not p.entwurf\n',
    ersetzen: '',
  },
  {
    id: 'wp-ansehen-nur-veroeffentlicht',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Beim Ansehen stehen nur veröffentlichte Pläne — auch für den Planer; Entwürfe gibt es nur beim Planen.',
    suchen: '!plan.entwurf && !planVorbei(plan, heute))',
    ersetzen: '!planVorbei(plan, heute))',
  },
  {
    id: 'wp-ansehen-ohne-vergangene',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Ein vergangener Plan verschwindet aus dem Ansehen.',
    suchen: '!plan.entwurf && !planVorbei(plan, heute))',
    ersetzen: '!plan.entwurf)',
  },
  {
    id: 'wp-menue-nur-mit-plan',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Ohne etwas zum Ansehen steht „Weitere Pläne" für Mitglieder nicht im Menü.',
    suchen: '  return args.zuteilen || plaeneZumAnsehen(args.plaene, args.heute).length > 0',
    ersetzen: '  return true',
  },
  {
    id: 'wp-verteilen-laesst-vergangenes',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Reihum verteilen fasst vergangene Wochen nicht an.',
    suchen: '    .filter((s) => s >= jetzt)\n',
    ersetzen: '',
  },
  {
    id: 'wp-verteilen-behaelt-kennung',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Bekommt eine Woche eine andere Gruppe, behält ihr Eintrag die Kennung — die Datenbank kennt je Woche nur einen.',
    suchen: '      if (da) return da.grp === grp ? da : { ...da, grp }\n',
    ersetzen: '',
  },
  {
    id: 'wp-zeitraum-saal-ganze-woche',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Die Woche, in der der Zeitraum beginnt, gehört ganz dazu.',
    suchen: 'e.datum >= spanneVon(takt, plan.von) && e.datum <= plan.bis',
    ersetzen: 'e.datum >= plan.von && e.datum <= plan.bis',
  },
  // Der Takt (4.10.2026): je Woche oder je Monat eine Gruppe.
  {
    id: 'wp-takt-im-raster',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Ein Eintrag neben dem Takt des Plans geht mit — ein Montag ist kein Monat.',
    suchen: ' && spanneVon(takt, e.datum) === e.datum',
    ersetzen: '',
  },
  {
    id: 'wp-takt-wechsel-nimmt-mit',
    datei: 'src/app/reducer.ts',
    regel: 'Ein anderer Takt verteilt ab jetzt neu, statt die Einteilung fallen zu lassen.',
    suchen: '          : taktWechseln({ plan, eintraege: state.planEintraege, groups: state.groups, heute: new Date(), neueId: neueEintragId })',
    ersetzen: '          : null',
  },
  {
    id: 'wp-takt-wechsel-gleiche-reihe',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Nach einem Wechsel des Takts geht es mit der Gruppe weiter, die gerade dran ist — nicht wieder von vorn.',
    suchen: '    abGruppe: dran.grp,\n',
    ersetzen: "    abGruppe: groups[0]?.id ?? '',\n",
  },
  {
    id: 'wp-takt-wechsel-vergangenes',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Was vorbei ist, geht beim Wechsel des Takts ins neue Raster über, statt zu verschwinden.',
    suchen: '    if (quelle) vergangen.push(',
    ersetzen: '    if (false) vergangen.push(',
  },
  {
    id: 'wp-monat-verteilen-ab-laufendem',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Im Monatstakt verteilt „Reihum" ab dem laufenden Monat, nicht erst ab der laufenden Woche.',
    suchen: '  const jetzt = spanneVon(taktVon(plan), isoDay(heute))',
    ersetzen: "  const jetzt = spanneVon('woche', isoDay(heute))",
  },
  {
    id: 'wp-monat-ansehen-ab-laufendem',
    datei: 'src/programm/WeiterePlaeneAnsicht.tsx',
    regel: 'Beim Ansehen steht im Monatstakt der laufende Monat noch da.',
    suchen: '  const jetzt = spanneVon(taktVon(plan), tag)',
    ersetzen: "  const jetzt = spanneVon('woche', tag)",
  },
  {
    id: 'wp-takt-laden',
    datei: 'src/lib/data.ts',
    regel: 'Der Takt kommt beim Laden mit — sonst wechselte ein Monatsplan danach wieder wöchentlich.',
    suchen: ', takt: taktVon({ takt: r.takt as PlanTakt }) }',
    ersetzen: ' }',
  },
  {
    id: 'wp-takt-speichern',
    datei: 'src/lib/data.ts',
    regel: 'Der Takt geht beim Speichern mit in die Zeile.',
    suchen: '    takt: taktVon(p),\n',
    ersetzen: '',
  },
  {
    id: 'wp-zeitraum-nimmt-eintraege-mit',
    datei: 'src/app/reducer.ts',
    regel: 'Ein kürzerer Zeitraum nimmt die Einträge außerhalb mit.',
    suchen: '        planEintraege: eintraegeImZeitraum(wechsel?.eintraege ?? state.planEintraege, plan),\n',
    ersetzen: '        planEintraege: wechsel?.eintraege ?? state.planEintraege,\n',
  },
  {
    id: 'wp-loeschen-nimmt-eintraege-mit',
    datei: 'src/app/reducer.ts',
    regel: 'Ein gelöschter Plan nimmt seine Einträge mit.',
    suchen: '        planEintraege: state.planEintraege.filter((e) => e.planId !== action.id),\n',
    ersetzen: '',
  },
  {
    id: 'wp-geloeschte-gruppe-raeumt-die-woche',
    datei: 'src/app/reducer.ts',
    regel: 'Eine gelöschte Gruppe verlässt ihre Wochen — die Wochen bleiben.',
    suchen: '          ? state.planEintraege.map((e) => (e.grp === action.id ? { ...e, grp: null } : e))',
    ersetzen: '          ? state.planEintraege',
  },
  {
    id: 'wp-zurueck-zur-zusammenkunft',
    datei: 'src/app/reducer.ts',
    regel: 'Wer aus den Weiteren Plänen zu den Zusammenkünften wechselt, landet bei der Zusammenkunft der Woche.',
    suchen: "            : action.thema === 'zusammenkuenfte' && themaVon(state.tab) !== 'zusammenkuenfte'",
    ersetzen: "            : action.thema === 'zusammenkuenfte' && state.tab === 'fs'",
  },
  {
    id: 'wp-eintrag-nach-dem-plan',
    datei: 'src/app/persist.ts',
    regel: 'Ein Eintrag geht nie vor dem Plan hinaus, auf den er zeigt — sonst weist ihn der Fremdschlüssel ab.',
    suchen: '  planSaves.flush()\n  savePlanEintraege(congId, geaendert, entfernt)',
    ersetzen: '  savePlanEintraege(congId, geaendert, entfernt)',
  },
  /* ---- Code-Review T120 (3.10.2026) ---- */
  {
    id: 'zeilen-nur-geaenderte',
    datei: 'src/app/persist.ts',
    regel:
      'Ein getippter Ort oder Name schreibt nur, was dieser Planer geändert hat — die ganze Liste holte zurück, was ein anderer gelöscht hat.',
    suchen: "  if (geaendert.length || entfernt.length) schreiber.schedule('zeilen', { congId, zeilen: geaendert, entfernt })",
    ersetzen: "  if (geaendert.length || entfernt.length) schreiber.schedule('zeilen', { congId, zeilen: [...nachher], entfernt })",
  },
  {
    id: 'zeilen-geloeschtes-nicht-zurueck',
    datei: 'src/app/persist.ts',
    regel: 'Erst getippt, dann gelöscht: Die Zeile geht nur als Löschung hinaus, nicht danach noch einmal als Upsert.',
    suchen: '  const nachId = new Map(alt.zeilen.filter((z) => !weg.has(z.id)).map((z) => [z.id, z]))',
    ersetzen: '  const nachId = new Map(alt.zeilen.map((z) => [z.id, z]))',
  },
  {
    id: 'zeilen-veraltet-laedt-nach',
    datei: 'src/lib/data.ts',
    regel:
      'Was nur ein veralteter Stand erklärt (Termin gelöscht, Platz besetzt, Recht entzogen), lädt nach — sonst bleibt lokal stehen, was es nicht gibt.',
    suchen: "const STAND_VERALTET: ReadonlySet<string> = new Set(['23505', '23503', '23514', '42501'])",
    ersetzen: "const STAND_VERALTET: ReadonlySet<string> = new Set(['23505'])",
  },
  {
    id: 'person-weg-eintraege-weg',
    datei: 'src/app/reducer.ts',
    regel: 'Geht eine Person, geht ihr Trolley-Termin mit — wie in der Datenbank (on delete cascade).',
    suchen: '          .filter((t) => t.pid !== id)\n',
    ersetzen: '',
  },
  /* ---- Testlücken T120 geschlossen (3.10.2026) ---- */
  {
    id: 'laden-waisen-raus',
    datei: 'src/lib/data.ts',
    regel: 'Einträge eines Plans, der nicht geladen ist, kommen nicht mit — sie gehören zu nichts, was die App zeigt.',
    suchen: '      .filter((e) => geladenePlaene.has(e.planId)),',
    ersetzen: '      .filter(() => true),',
  },
  {
    id: 'wp-neu-gleich-offen',
    datei: 'src/planen/WeiterePlaenePlan.tsx',
    regel: 'Ein neuer Plan steht gleich offen da, nicht wieder die Liste.',
    suchen: '    setOffen(id)\n',
    ersetzen: '',
  },
  /* ---- Testlücken 6–11 T120 geschlossen (3.10.2026) ---- */
  {
    id: 'erinnerung-fs-tabelle-fehlt',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel:
      'Fehlt die Tabelle der Treffpunkte, erinnert der Lauf trotzdem an die Zusammenkünfte. Der Test dazu maß bis zum 3.10.2026 nichts: Sein eigenes `fetch` überschrieb `loadFn` wieder.',
    suchen:
      "        ).catch((err) => {\n          // Fehlt die Tabelle (Migration nicht eingespielt), lieber die\n          // Zusammenkünfte erinnern als den ganzen Lauf verlieren.\n          console.error(`fs_weeks nicht lesbar: ${(err as Error).message}`)\n          return [] as { start: string; data: FsInstance[] }[]\n        }),",
    ersetzen: '        ),',
  },
  {
    id: 'wp-gleicher-platz-gleicher-zustand',
    datei: 'src/app/reducer.ts',
    regel: 'Dieselbe Gruppe noch einmal setzen ändert nichts — derselbe Zustand, nichts geschrieben.',
    suchen: '      return eintraege === state.planEintraege ? state : { ...state, planEintraege: eintraege }',
    ersetzen: '      return { ...state, planEintraege: eintraege }',
  },
  {
    id: 'besuch-uebernehmen-ohne-aenderung',
    datei: 'src/app/reducer.ts',
    regel: '„Übernehmen", wo der Besucher schon leitet, ändert nichts und meldet nichts.',
    suchen: "      return fsWeeks === state.fsWeeks ? state : { ...state, fsWeeks, toast: toastKey(state, 'toastZugeteilt') }",
    ersetzen: "      return { ...state, fsWeeks, toast: toastKey(state, 'toastZugeteilt') }",
  },
  {
    id: 'besuch-gleicher-besucher',
    datei: 'src/app/reducer.ts',
    regel: 'Denselben Besucher noch einmal wählen trägt ihn nicht aus und wieder ein.',
    suchen: '      const alt = state.gruppenbesuche.find((b) => b.id === action.id)\n      if (!alt || alt.pid === action.pid) return state',
    ersetzen: '      const alt = state.gruppenbesuche.find((b) => b.id === action.id)\n      if (!alt) return state',
  },
  {
    id: 'thema-reiter-der-woche',
    datei: 'src/app/reducer.ts',
    regel:
      'Zurück zu den Zusammenkünften öffnet die nächste nur, wenn sie in der gezeigten Woche liegt — sonst die unter der Woche.',
    suchen: "  return naechste && naechste.wi === state.week ? naechste.tab : 'mid'",
    ersetzen: "  return naechste ? naechste.tab : 'mid'",
  },
  /* ---- Zurück am Handy, Menüfuß (4.10.2026) ---- */
  {
    id: 'zurueck-bildschirm-zu-start',
    datei: 'src/app/AppShell.tsx',
    regel: 'Zurück auf einem Bildschirm außer Start führt zu Start, statt die App zu verlassen.',
    suchen: "  useBackDismiss(\n    !isLogin && state.screen !== 'start',",
    ersetzen: '  useBackDismiss(\n    false,',
  },
  {
    id: 'zurueck-detail-zuerst',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Zurück schließt zuerst das Personen-Detail, erst dann geht es zu Start.',
    suchen: 'useBackDismiss(selected !== undefined,',
    ersetzen: 'useBackDismiss(false,',
  },
  {
    id: 'zurueck-plan-zuerst',
    datei: 'src/planen/WeiterePlaenePlan.tsx',
    regel: 'Zurück schließt zuerst den geöffneten Plan, erst dann geht es zu Start.',
    suchen: "  useBackDismiss(plan !== undefined, () => setOffen(null), 'unteransicht')",
    ersetzen: "  useBackDismiss(false, () => setOffen(null), 'unteransicht')",
  },
  {
    id: 'zurueck-verbraucht',
    datei: 'src/components/useBackDismiss.ts',
    regel:
      'Hat ein Zurück-Druck den Eintrag einer Ebene genommen, räumt ihr Schließen nichts mehr ab — sonst nähme es den Eintrag der Ebene darunter mit.',
    suchen: '      } else if (!lage.verbraucht) austragen()',
    ersetzen: '      } else austragen()',
  },
  {
    id: 'zurueck-unterwegs-wartet',
    datei: 'src/components/useBackDismiss.ts',
    regel:
      'Geht eine Ebene auf, während ein eigener Rückschritt unterwegs ist, legt sie ihren Eintrag erst danach an — ein pushState bräche den Rückschritt ab, und der nächste Druck ginge verloren.',
    suchen: '  if (unterwegs > 0) {\n    nachzutragen++ // erst, wenn der eigene Rückschritt angekommen ist\n    return\n  }\n',
    ersetzen: '',
  },
  {
    id: 'zurueck-rang',
    datei: 'src/components/useBackDismiss.ts',
    regel: 'Zurück trifft die Ebene mit dem höchsten Rang, nicht die zuletzt eingehängte — React hängt Kinder vor Eltern ein.',
    suchen: '    if (!beste || lage.rang > beste.rang || (lage.rang === beste.rang && lage.nr > beste.nr)) beste = lage',
    ersetzen: '    if (!beste || lage.nr > beste.nr) beste = lage',
  },
  /* ---- Zurück nach einem Push-Tipp: ohne Geste ein Wächter (4.10.2026) ---- */
  {
    id: 'zurueck-ohne-geste-waechter',
    datei: 'src/components/useBackDismiss.ts',
    regel:
      'Geht eine Ebene ohne Geste auf (der Bildschirm nach einem Push-Tipp), legt sie keinen Eintrag an, sondern einen Wächter — Chromium überspränge den Eintrag, und die Zurück-Taste schlösse die App.',
    suchen: '    if (Klasse && ohneGeste() && stapel.every((andere) => andere.waechter)) {',
    ersetzen: '    if (false) {',
  },
  {
    id: 'zurueck-waechter-schliesst',
    datei: 'src/components/useBackDismiss.ts',
    regel: 'Die Zurück-Taste schließt eine Ebene mit Wächter — nach einem Push-Tipp führt sie zu Start.',
    suchen: '    lage.verbraucht = true\n    lage.schliessen()\n  }\n  lage.waechter = waechter',
    ersetzen: '    lage.verbraucht = true\n  }\n  lage.waechter = waechter',
  },
  {
    id: 'zurueck-waechter-abloesen',
    datei: 'src/components/useBackDismiss.ts',
    regel:
      'Geht danach eine Ebene mit Geste auf, bekommt die Ebene mit Wächter ihren Eintrag nachgetragen, und der Wächter geht — sonst träfe die Zurück-Taste zuerst ihn, also die untere Ebene.',
    suchen: '    } else {\n      waechterAbloesen()\n',
    ersetzen: '    } else {\n',
  },
  {
    id: 'zurueck-waechter-nur-ueber-waechtern',
    datei: 'src/components/useBackDismiss.ts',
    regel:
      'Liegt schon eine Ebene mit Eintrag offen, bekommt auch eine Ebene ohne Geste einen Eintrag — ein Wächter darüber schlösse vor der höher rangierenden Ebene darunter.',
    suchen: '    if (Klasse && ohneGeste() && stapel.every((andere) => andere.waechter)) {',
    ersetzen: '    if (Klasse && ohneGeste()) {',
  },
  {
    id: 'zurueck-waechter-abbauen',
    datei: 'src/components/useBackDismiss.ts',
    regel:
      'Schließt eine Ebene mit Wächter anders als über die Taste, geht ihr Wächter mit — sonst träfe der nächste Druck eine Ebene, die es nicht mehr gibt.',
    suchen: '        lage.waechter.destroy() // ohne Eintrag ist nichts abzuräumen\n',
    ersetzen: '',
  },
  {
    id: 'zurueck-mit-geste-eintrag',
    datei: 'src/components/useBackDismiss.ts',
    regel: 'Mit Geste bleibt es beim Verlaufseintrag — der Wächter springt nur ein, wo kein Eintrag zählen würde.',
    suchen: '  return (navigator as { userActivation?: UserActivation }).userActivation?.isActive === false',
    ersetzen: '  return true',
  },
  {
    id: 'zurueck-ohne-closewatcher-eintrag',
    datei: 'src/components/useBackDismiss.ts',
    regel: 'Ohne CloseWatcher (Firefox, Safari) bleibt es auch ohne Geste beim Verlaufseintrag.',
    suchen: '    if (Klasse && ohneGeste() && stapel.every((andere) => andere.waechter)) {',
    ersetzen: '    if (ohneGeste() && stapel.every((andere) => andere.waechter)) {',
  },
  {
    id: 'abmelden-statusseite',
    datei: 'src/app/AppShell.tsx',
    regel: 'Wo statt des Profils eine Statusseite steht (kein Mitglied, Ladefehler, leere Versammlung), meldet sie selbst ab.',
    suchen: "      {kind !== 'loading' && <AbmeldenKnopf className=\"btn-outline status-btn\" />}",
    ersetzen: '      {false && <AbmeldenKnopf className="btn-outline status-btn" />}',
  },
  {
    id: 'abmelden-profil-knopf',
    datei: 'src/profil/ProfilScreen.tsx',
    regel: '„Abmelden" ist ein Knopf wie „App installieren", keine Textzeile.',
    suchen: '            <AbmeldenKnopf className="knopf-umriss" />',
    ersetzen: '            <AbmeldenKnopf className="" />',
  },
  {
    id: 'abmelden-fragt-nach',
    datei: 'src/components/AbmeldenKnopf.tsx',
    regel: 'Abmelden fragt erst nach („Wirklich abmelden?") — ein einzelner Tipp meldet nicht ab.',
    suchen: '      onClick={abmelden.onClick}',
    ersetzen: '      onClick={() => performLogout(dispatch)}',
  },
  {
    id: 'abwesenheit-fragt-nach',
    datei: 'src/components/AbwesenheitEntfernen.tsx',
    regel: 'Eine Abwesenheit zu löschen fragt erst nach („Wirklich löschen?") — ein einzelner Tipp löscht nicht.',
    suchen: "  return <EntfernenKnopf className={className} onEntfernen={() => dispatch({ type: 'removeAbsence', id })} />",
    ersetzen:
      "  return <button type=\"button\" className={className} onClick={() => dispatch({ type: 'removeAbsence', id })}>✕</button>",
  },
  /* ---- Das Menü im neuen Design (T121, 12.10.2026) ---- */
  {
    id: 'menue-bereich-zum-ansehen',
    datei: 'src/app/AppShell.tsx',
    regel: 'Ein Bereich im Menü öffnet zum Ansehen — auch wer gerade plant; geplant wird über „Planen" oder „Planung".',
    suchen: '    dispatch(zumAnsehen(thema))\n  }',
    ersetzen: "    dispatch(state.screen === 'planen' ? zumPlanen(thema) : zumAnsehen(thema))\n  }",
  },
  {
    id: 'menue-planenkopf-bereich',
    datei: 'src/app/AppShell.tsx',
    regel: 'Der Kopf des Planens nennt den Bereich, der darunter geplant wird — beim Gruppenaufseher den Predigtdienst.',
    suchen: '  const geplant = geplantesThema(rechte, state.tab)',
    ersetzen: '  const geplant = themaVon(state.tab)',
  },
  {
    id: 'menue-planung-gruppenaufseher',
    datei: 'src/app/AppShell.tsx',
    regel: '„Planung" führt den Gruppenaufseher zu den Treffpunkten, die er planen darf — nicht in die Zusammenkünfte.',
    suchen: "const planungsThema: Thema = darfPlanen(rechte, 'zusammenkuenfte') ? 'zusammenkuenfte' : 'predigtdienst'",
    ersetzen: "const planungsThema: Thema = 'zusammenkuenfte'",
  },

  // ── Für mich: Start, Meine Aufgaben, Absagen (T121, Phase 3) ──────────────
  {
    id: 'saal-verschweigt-keine-lage',
    datei: 'src/data/saal.ts',
    regel: 'Im Saal bekommt jede vorhandene Lage einen Platz — eine einzige Absage unter dreißig Plätzen verschwindet nicht.',
    suchen: '    if (zahlen[lage] === 0 || out[lage] > 0) continue',
    ersetzen: '    continue',
  },
  {
    id: 'saal-offen-hinten',
    datei: 'src/data/saal.ts',
    regel: 'Offene Plätze sitzen hinten im Saal, die besetzten vorn.',
    suchen: "  const reihe: SaalLage[] = [...wunsch.map((w) => w.lage), ...Array<SaalLage>(frei - vorn).fill('offen')]",
    ersetzen: "  const reihe: SaalLage[] = [...Array<SaalLage>(frei - vorn).fill('offen'), ...wunsch.map((w) => w.lage)]",
  },
  {
    id: 'woche-nur-was-noch-kommt',
    datei: 'src/dashboard/diese-woche.ts',
    regel: 'Unter „Diese Woche" steht nur, was noch kommt — am Donnerstag nicht mehr der Dienstag.',
    suchen: '    if (ms === null || ms < ab) continue',
    ersetzen: '    if (ms === null) continue',
  },
  {
    id: 'woche-nur-eigene-gruppe',
    datei: 'src/dashboard/diese-woche.ts',
    regel: 'Unter „Diese Woche" stehen die Treffpunkte der eigenen Gruppen und der Versammlung, nicht die fremder Gruppen.',
    suchen: '    if (inst.grp !== null && !gruppen.has(inst.grp)) continue',
    ersetzen: '',
  },
  {
    id: 'woche-auch-geleitete-gruppe',
    datei: 'src/dashboard/DashboardScreen.tsx',
    regel: 'Unter „Diese Woche" stehen auch die Treffpunkte der Gruppe, die man leitet — wie im Predigtdienst.',
    suchen: 'eigeneGruppen(persons, groups, personId)',
    ersetzen: 'new Set(persons.find((p) => p.id === personId)?.grp ? [persons.find((p) => p.id === personId)!.grp!] : [])',
  },
  {
    id: 'alle-bestaetigen-nur-offene',
    datei: 'src/app/persist.ts',
    regel: '„Alle bestätigen" sagt nur zu, was offen war — eine Absage wird dabei nicht still zur Zusage.',
    suchen: "        if (task.status === 'offen') saveConfirmation(congId, userId, task.id, 'bestätigt')",
    ersetzen: "        saveConfirmation(congId, userId, task.id, 'bestätigt')",
  },
  {
    id: 'absage-nachricht-als-freitext',
    datei: 'src/app/reducer.ts',
    regel: 'Die Nachricht beim Absagen steht als Freitext in der Mitteilung — kein Übersetzer macht aus „Markus 2" ein Bibelbuch.',
    suchen: '  return text ? ` · ${alsFreitext(text)}` : \'\'',
    ersetzen: '  return text ? ` · ${text}` : \'\'',
  },
  {
    id: 'absage-abwesend-nur-mit-schalter',
    datei: 'src/aufgaben/AbsageBlatt.tsx',
    regel: 'Beim Absagen wird der Tag nur als abwesend eingetragen, wenn der Schalter an ist — er steht aus.',
    suchen: '    if (abwesend && tag) {',
    ersetzen: '    if (tag) {',
  },
  {
    id: 'blatt-eigene-fehlergrenze',
    datei: 'src/app/AppShell.tsx',
    regel: 'Geht ein Blatt über einem anderen auf, bleibt das untere eingehängt — es behält seinen Verlaufseintrag.',
    suchen: '  const blatt = (inhalt: ReactNode) => <ErrorBoundary {...fehlerTexte}>{inhalt}</ErrorBoundary>',
    ersetzen: '  const blatt = (inhalt: ReactNode) => <ErrorBoundary key={String(state.s89 != null)} {...fehlerTexte}>{inhalt}</ErrorBoundary>',
  },
  {
    id: 'escape-verbraucht',
    datei: 'src/components/useEscape.ts',
    regel: 'Ein Escape, das ein Blatt schließt, ist verbraucht — Chromium macht daraus keine zweite „close request".',
    suchen: '      event.preventDefault()\n      handler.current()',
    ersetzen: '      handler.current()',
  },
  {
    id: 'zeitraum-von-nie-nach-bis',
    datei: 'src/components/kalender.ts',
    regel: 'Ein Tipp vor „Von" beginnt den Zeitraum neu — Von liegt nie nach Bis, sonst träfe ihn keine Prüfung.',
    suchen: "  if (stand.ende === 'von' || !stand.von || tag < stand.von) {",
    ersetzen: "  if (stand.ende === 'von' || !stand.von) {",
  },
  {
    id: 'abwesenheiten-nur-was-ansteht',
    datei: 'src/components/abwesenheiten.ts',
    regel: 'Im Profil und bei der Person stehen nur Abwesenheiten, die anstehen oder laufen — was vorbei ist, fällt heraus.',
    suchen: '  return liste.filter((a) => a.to >= heute)',
    ersetzen: '  return liste.filter(() => true)',
  },
  {
    id: 'abwesenheit-nur-mit-recht',
    datei: 'src/data/rechte.ts',
    regel: 'Eintragen darf, wen es betrifft, oder ein Admin — wie absences_write; sonst schriebe der Knopf ins Leere.',
    suchen: '  return s.planner || personId === s.personId',
    ersetzen: '  return true',
  },
  {
    id: 'menue-fuss-gruppe-uebersetzt',
    datei: 'src/app/eigene-person.ts',
    regel: 'Die Gruppe unter dem Namen steht in der Sprache der App — im Fuß des Menüs wie im Profil.',
    suchen: '  return gruppe ? [rolle, tu(gruppe.name)] : [rolle]',
    ersetzen: '  return gruppe ? [rolle, gruppe.name] : [rolle]',
  },
  {
    id: 'spaeter-legt-weg',
    datei: 'src/app/reducer.ts',
    regel: '„Später" legt das Blatt beim Öffnen weg, auch wenn noch etwas zu bestätigen ist.',
    suchen: "    case 'closeConfirm':\n      // „Später\" (T121): Das Blatt lässt sich weglegen, auch wenn noch etwas zu\n      // bestätigen ist. Beim nächsten Öffnen der App liegt es wieder da (`login`).\n      return { ...state, confirmOpen: false }",
    ersetzen: "    case 'closeConfirm':\n      return state.myTasks.some((t) => t.status === 'offen') ? state : { ...state, confirmOpen: false }",
  },
  {
    id: 'entfernen-fragt-nach',
    datei: 'src/components/EntfernenKnopf.tsx',
    regel: 'Ein ✕ fragt erst nach („Wirklich löschen?") — ein einzelner Tipp entfernt nichts.',
    suchen: '      onClick={entfernen.onClick}',
    ersetzen: '      onClick={onEntfernen}',
  },
  {
    id: 'entfernen-frage-je-art',
    datei: 'src/components/EntfernenKnopf.tsx',
    regel: 'Was nur herausgenommen wird (Person, Sprache, Konto), fragt „Wirklich entfernen?" — nicht „Wirklich löschen?".',
    suchen: "      {entfernen.armed ? (frage ?? t.loeschenSicher) : (text ?? '✕')}",
    ersetzen: "      {entfernen.armed ? t.loeschenSicher : (text ?? '✕')}",
  },
  {
    id: 'gruppenbesuch-fragt-nach',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Einen Gruppenbesuch zu löschen fragt erst nach — ein einzelner Tipp löscht nicht.',
    suchen:
      "          <EntfernenKnopf\n            className=\"knopf-umriss knopf-entfernen\"\n            text={t.a11yRemove}\n            onEntfernen={() => {\n              dispatch({ type: 'besuchEntfernen', id })",
    ersetzen:
      "          <button\n            type=\"button\"\n            className=\"knopf-umriss knopf-entfernen\"\n            onClick={() => {\n              dispatch({ type: 'besuchEntfernen', id })",
  },
  {
    id: 'dienst-loeschen-fragt-nach',
    datei: 'src/einstellungen/HilfsdienstBlatt.tsx',
    regel: 'Einen Dienst zu entfernen fragt erst nach — und die Wache über alle Lösch-Knöpfe merkt einen ohne Rückfrage.',
    suchen:
      "          <EntfernenKnopf\n            className=\"knopf-umriss knopf-entfernen\"\n            text={t.hdEntfernen}\n            onEntfernen={() => dispatch({ type: 'removeService', key: svcKey })}\n          />",
    ersetzen:
      "          <button type=\"button\" className=\"knopf-umriss knopf-entfernen\" onClick={() => dispatch({ type: 'removeService', key: svcKey })}>\n            {t.hdEntfernen}\n          </button>",
  },
  {
    id: 'zuteilung-entfernen-fragt-nach',
    datei: 'src/planen/AssignSheet.tsx',
    regel: '„Entfernen" im Zuteilungsblatt fragt erst nach — wer zugesagt hatte, bekäme sofort eine Nachricht.',
    suchen:
      '      <EntfernenKnopf\n        className="knopf-pille zuteilen-entfernen"\n        text={t.entfernen}\n        frage={t.entfernenSicher}\n        onEntfernen={onEntfernen}\n      />',
    ersetzen:
      '      <button type="button" className="knopf-pille zuteilen-entfernen" onClick={onEntfernen}>\n        {t.entfernen}\n      </button>',
  },
  {
    id: 'partner-entfernen-fragt-nach',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Den Partner eines Schülerteils abzuschalten fragt erst nach — mit dem Platz geht, wer dort steht.',
    suchen:
      '  return <EntfernenKnopf className="partner-toggle" text={t.partnerEntfernen} frage={t.entfernenSicher} onEntfernen={umschalten} />',
    ersetzen:
      '  return <button type="button" className="partner-toggle" onClick={umschalten}>{t.partnerEntfernen}</button>',
  },
  /* ---- Gruppenbesuche weniger starr (4.10.2026) ---- */
  {
    id: 'gb-aendern-austragen',
    datei: 'src/app/reducer.ts',
    regel: 'Wird ein Besuch verlegt, geht der Besucher aus den bisherigen Treffpunkten — dort leitet er nicht mehr.',
    suchen:
      '      const fsWeeks = besuchEintragen(besuchAustragen(state.fsWeeks, lage.kennungen, alt), lage.kennungen, neu, state.persons)',
    ersetzen: '      const fsWeeks = besuchEintragen(state.fsWeeks, lage.kennungen, neu, state.persons)',
  },
  {
    id: 'gb-aendern-doppelt',
    datei: 'src/app/reducer.ts',
    regel: 'Ein Besuch lässt sich nicht dorthin verlegen, wo dieselbe Gruppe in der Woche schon besucht wird.',
    suchen: '      if (state.gruppenbesuche.some((b) => b !== alt && b.woche === neu.woche && b.grp === neu.grp)) return state',
    ersetzen: '',
  },
  {
    id: 'gb-aendern-vorbei',
    datei: 'src/app/reducer.ts',
    regel: 'Ein vergangener Besuch bleibt, wie er war, und in Vergangenes wird nicht verlegt.',
    suchen: "      if (besuchStand(alt, lage).art === 'vorbei' || besuchStand(neu, lage).art === 'vorbei') return state",
    ersetzen: '',
  },
  {
    id: 'gb-aendern-gespeichert',
    datei: 'src/app/persist.ts',
    regel: 'Ein verlegter Besuch geht in die Datenbank — samt den Wochen, aus denen und in die er wechselt.',
    suchen: "    case 'besuchAendern':\n",
    ersetzen: '',
  },
  {
    id: 'gb-woche-gesperrt',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Beim Verlegen steht gesperrt, wo die Gruppe schon besucht wird.',
    suchen: 'gesperrt={(w) => andere.some((b) => b.woche === w && b.grp === besuch.grp)}',
    ersetzen: 'gesperrt={() => false}',
  },
  // ── Mitteilungen: ein Tipp führt dorthin, wo sie herkommen (4.10.2026) ────
  {
    id: 'mitteilung-ersatz-einspringen',
    datei: 'src/app/mitteilungen.ts',
    regel: '„Ersatz gesucht" führt zum Einspringen auf „Meine Aufgaben" — wie der Push.',
    suchen: "  if (n.title === ERSATZ_GESUCHT) return [{ type: 'navigate', screen: 'aufgaben', abschnitt: 'einspringen' }]\n",
    ersetzen: '',
  },
  {
    id: 'mitteilung-planer-vor-eigener-aufgabe',
    datei: 'src/app/mitteilungen.ts',
    regel: 'Eine Absage führt den Planer ins Planen, auch wenn es seine eigene Aufgabe war — als Planer sucht er Ersatz.',
    suchen: "  if (lage.zuteilen && AN_DIE_PLANER.has(n.title)) return wocheZeigen('planen', teile, lage.weeks)",
    ersetzen:
      "  if (lage.zuteilen && AN_DIE_PLANER.has(n.title) && !lage.myTasks.some((t) => t.id === n.taskId)) return wocheZeigen('planen', teile, lage.weeks)",
  },
  {
    id: 'mitteilung-woche-der-aufgabe',
    datei: 'src/app/mitteilungen.ts',
    regel: 'Ein Schlüssel einer geladenen Woche führt in genau diese Woche, nicht bloß zum Thema.',
    suchen: "    wi < 0 ? { type: 'navigate', screen, thema: themaVon(tab) }",
    ersetzen: "    wi < 999 ? { type: 'navigate', screen, thema: themaVon(tab) }",
  },
  {
    id: 'mitteilung-treffpunkt-reiter',
    datei: 'src/app/mitteilungen.ts',
    regel: 'Ein Treffpunkt öffnet im Predigtdienst den Reiter Treffpunkte, nicht den zuletzt gewählten.',
    suchen: "  return teile.art === 'fs' ? [hin, { type: 'setFsBereich', bereich: 'treffpunkte' }] : [hin]",
    ersetzen: '  return [hin]',
  },
  {
    id: 'mitteilung-absage-ohne-bestaetigen',
    datei: 'src/app/mitteilungen.ts',
    regel: 'An einer Absage steht nie „Bestätigen" — auch wenn ihr Schlüssel inzwischen die eigene offene Aufgabe ist.',
    suchen: "    n.type !== 'verhindert' &&\n",
    ersetzen: '',
  },
  {
    id: 'mitteilung-offline-nicht-gelesen',
    datei: 'src/mitteilungen/Mitteilung.tsx',
    regel: 'Offline springt der Tipp, ohne „gelesen" zu schicken — die Sperre meldete sonst nur „nur lesen".',
    suchen: 'if (!notif.read && !state.staleAt) dispatch(',
    ersetzen: 'if (!notif.read) dispatch(',
  },
  /* ---- Die Mitteilungen als Seite (T121, Phase 3c) ---- */
  {
    id: 'mitteilung-bestaetigen-nur-offen',
    datei: 'src/app/mitteilungen.ts',
    regel: '„Bestätigen" steht an einer Mitteilung nur, solange die eigene Aufgabe auf Zusage wartet.',
    suchen: "    lage.myTasks.some((t) => t.id === id && t.status === 'offen')",
    ersetzen: '    lage.myTasks.some((t) => t.id === id)',
  },
  {
    id: 'mitteilung-uebernehmen-nur-offenes-gesuch',
    datei: 'src/app/mitteilungen.ts',
    regel: '„Übernehmen" steht an „Ersatz gesucht" nur, solange das Gesuch offen ist.',
    suchen: "  if (n.title === ERSATZ_GESUCHT) return lage.substituteReqs.some((r) => r.key === id) ? { art: 'uebernehmen', id } : null",
    ersetzen: "  if (n.title === ERSATZ_GESUCHT) return { art: 'uebernehmen', id }",
  },
  {
    id: 'mitteilung-kann-nicht-noch-ungelesen',
    datei: 'src/mitteilungen/Mitteilung.tsx',
    regel: '„Ich kann nicht" öffnet nur das Blatt — wer es abbricht, hat nichts beantwortet, die Mitteilung bleibt neu.',
    suchen: "onClick={() => dispatch({ type: 'openAbsage', id: handlung.id })}",
    ersetzen: "onClick={() => { gelesen(); dispatch({ type: 'openAbsage', id: handlung.id }) }}",
  },
  {
    id: 'mitteilungen-alle-gelesen-nur-bei-neuem',
    datei: 'src/mitteilungen/MitteilungenScreen.tsx',
    regel: '„Alle gelesen" steht nur da, solange es Neues gibt.',
    suchen: '{neu.length > 0 && <AlleGelesen className="knopf-umriss mitteilungen-alle" />}',
    ersetzen: '<AlleGelesen className="knopf-umriss mitteilungen-alle" />',
  },
  {
    id: 'push-karte-nicht-bei-verweigert',
    datei: 'src/mitteilungen/PushKarte.tsx',
    regel: 'Hat der Browser die Berechtigung verweigert, steht keine Karte da, deren Knopf nichts mehr ausrichtet.',
    suchen: '  if (!angemeldet || subscribed || verweigert || weg) return null',
    ersetzen: '  if (!angemeldet || subscribed || weg) return null',
  },
  {
    id: 'glocke-fuehrt-zur-seite',
    datei: 'src/app/AppShell.tsx',
    regel: 'Die Glocke führt auf die Seite der Mitteilungen.',
    suchen: "              onGlocke={() => navigate('mitteilungen')}",
    ersetzen: '              onGlocke={() => undefined}',
  },
  {
    id: 'unterseite-zurueck-zu-start',
    datei: 'src/app/AppShell.tsx',
    regel: 'Zurück im Kopf der Mitteilungen führt zu Start — wie die Zurück-Taste.',
    suchen: "              <UnterseiteKopf onZurueck={() => navigate('start')}>",
    ersetzen: "              <UnterseiteKopf onZurueck={() => navigate('aufgaben')}>",
  },
  /* ---- Die Versammlung ansehen (T121, Phase 4a) ---- */
  {
    id: 'kongress-statt-programm',
    datei: 'src/programm/ProgrammScreen.tsx',
    regel: 'In der Kongresswoche steht statt der Tage und des Programms die Karte mit den Wegen weiter.',
    suchen: "  const kongress = !isFs && anlassArt(rawWeek) === 'kongress'",
    ersetzen: '  const kongress = false',
  },
  {
    id: 'naechste-ueberspringt-ausfall',
    datei: 'src/data/helpers.ts',
    regel: '„Nächste Zusammenkunft" nach dem Kongress überspringt, was ausfällt.',
    suchen: '    const tab = MEETING_TABS.find((key) => !istAusgefallen(week, key))',
    ersetzen: '    const tab = MEETING_TABS[0]',
  },
  {
    id: 'woche-anlass-vor-aktuell',
    datei: 'src/components/WochenWahl.tsx',
    regel: 'Unter der Woche steht ihr Anlass — „Aktuelle Woche" nur, wenn sie keinen hat.',
    suchen: '        {anlass ? (',
    ersetzen: '        {anlass && !istAktuell ? (',
  },
  {
    id: 'du-gedruckt-mit-namen',
    datei: 'src/programm/PersonZeile.tsx',
    regel: 'Am eigenen Platz steht „Du" — gedruckt wird der Name, der Aushang gilt allen.',
    suchen: "      <span className={du ? 'prog-name nur-druck' : 'prog-name'}>{name || t.offenDash}</span>",
    ersetzen: '      {!du && <span className="prog-name">{name || t.offenDash}</span>}',
  },
  {
    id: 'lied-im-abschnittskopf',
    datei: 'src/programm/programm-zeilen.ts',
    regel: 'Das Lied aus dem Sammeltitel von Eröffnung und Abschluss steht im Kopf des Abschnitts — es geht nicht verloren.',
    suchen: '    if (song) lieder.push(song)\n',
    ersetzen: '',
  },
  {
    id: 'ausfall-beim-ansehen',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Fällt eine Zusammenkunft aus, steht es beim Ansehen mit dem Grund — nicht nur durchgestrichen.',
    suchen: '      <AusfallBanner week={rawWeek} tab={mtab(tab)} />\n',
    ersetzen: '',
  },
  {
    id: 'druck-woche-vorgewaehlt',
    datei: 'src/programm/DruckWahl.tsx',
    regel: 'Im Blatt „Drucken" ist die Woche vorgewählt — der Monat ist die Ausnahme.',
    suchen: '  const [ganzerMonat, setGanzerMonat] = useState(false)',
    ersetzen: '  const [ganzerMonat, setGanzerMonat] = useState(true)',
  },
  {
    id: 'druck-blatt-weg-vor-druck',
    datei: 'src/programm/DruckWahl.tsx',
    regel: 'Das Blatt „Drucken" ist weg, bevor gedruckt wird — sonst stünde es im Ausdruck.',
    suchen: '            flushSync(() => setOffen(false))\n',
    ersetzen: '            setOffen(false)\n',
  },
  {
    id: 'tageskarte-echter-tag',
    datei: 'src/components/MeetingTabs.tsx',
    regel: 'Die Karte einer verlegten Zusammenkunft nennt ihren echten Tag, nicht den Rhythmus.',
    suchen: '        const datum = week\n          ? meetingDate(week, key, zeiten)',
    ersetzen: '        const datum = false\n          ? meetingDate(week, key, zeiten)',
  },
  /* ---- Die Versammlung ansehen: Tablet und Desktop (T121, Phase 4a-2) ---- */
  {
    id: 'dauer-an-der-zahl',
    datei: 'src/data/helpers.ts',
    regel: 'Die Dauer ist der Teil der Meta-Zeile mit der Zahl aus den Daten — nicht der erste Teil mit irgendeiner Zahl.',
    suchen: '    if (ersteZahl(teil) === mins && (!beste || teil.length < beste.teil.length)) beste = { index, teil }',
    ersetzen: '    if (ersteZahl(teil) !== null && !beste) beste = { index, teil }',
  },
  {
    id: 'dauer-kuerzerer-gewinnt',
    datei: 'src/data/helpers.ts',
    regel: 'Tragen zwei Teile die Zahl der Dauer, ist der kürzere die Dauer — nicht der vordere („Studienartikel 30 · 30 Min.").',
    suchen: '(!beste || teil.length < beste.teil.length)',
    ersetzen: '!beste',
  },
  {
    id: 'dauer-sonst-zeile-ganz',
    datei: 'src/data/helpers.ts',
    regel: 'Passt kein Teil zur Dauer, bleibt die Meta-Zeile ganz — nichts geht verloren.',
    suchen: "  if (!beste) return { dauer: null, rest: meta }",
    ersetzen: "  if (!beste) return { dauer: null, rest: '' }",
  },
  {
    id: 'dauer-in-der-zeile',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Die Dauer steht neben dem Titel, der Rahmen darunter.',
    suchen: "  const { dauer, rest } = dauerAbtrennen(item.meta ?? '', item.mins)",
    ersetzen: "  const { dauer, rest } = { dauer: null, rest: item.meta ?? '' }",
  },
  {
    id: 'tablet-druck-neben-woche',
    datei: 'src/programm/ProgrammScreen.tsx',
    regel: 'Ab dem Tablet steht „Drucken" neben der Wochenwahl, nicht ein zweites Mal neben dem Termin.',
    suchen: '  const druckNebenTermin = breit ? null : druck',
    ersetzen: '  const druckNebenTermin = druck',
  },
  {
    id: 'kongress-ohne-druck',
    datei: 'src/programm/ProgrammScreen.tsx',
    regel: 'In der Kongresswoche gibt es keinen Druckknopf — es gibt nichts zu drucken.',
    suchen: '  const druck = kongress ? null : (',
    ersetzen: '  const druck = false ? null : (',
  },
  {
    id: 'kongress-gewohnte-spalte',
    datei: 'src/programm/ProgrammScreen.tsx',
    regel: 'Die volle Breite neben dem Menü bekommen nur die zwei Spalten, nicht die Karte des Kongresses.',
    suchen: '  const zweiSpalten = beideTage && !kongress',
    ersetzen: '  const zweiSpalten = beideTage',
  },
  {
    id: 'beide-tage-nicht-im-predigtdienst',
    datei: 'src/programm/useBeideTage.ts',
    regel: 'Im Predigtdienst gibt es keine zwei Tage nebeneinander — dort bleibt der Plan der Treffpunkte.',
    suchen: "  return desktop && state.tab !== 'fs'",
    ersetzen: '  return desktop',
  },
  {
    id: 'desktop-hilfsdienste-je-tag',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'In der Tabelle der Hilfsdienste steht jeder Tag mit seinen eigenen Plätzen.',
    suchen: '                  <DienstWer helpers={week[key].helpers} service={service} me={me} />',
    ersetzen: '                  <DienstWer helpers={week.mid.helpers} service={service} me={me} />',
  },
  {
    id: 'desktop-ausfall-im-tabellenkopf',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Fällt ein Tag aus, steht er im Kopf der Hilfsdienst-Tabelle durchgestrichen.',
    suchen: '                  {istAusgefallen(rawWeek, key) ? <s>{tag}</s> : tag}',
    ersetzen: '                  {tag}',
  },
  {
    id: 'druck-thema-beide-tage',
    datei: 'src/programm/druck.ts',
    regel: 'Stehen beide Tage im Blatt, nennt der Kopf „Zusammenkünfte" — nicht den zuletzt gewählten Tag.',
    suchen: '  if (beideTage) return t.navZusammenkuenfte\n',
    ersetzen: '',
  },
  {
    id: 'fusszeile-im-druck',
    datei: 'src/programm/print.css',
    regel: 'Die Fußzeile („Stand") ist am Bildschirm aus — im Druck blendet print.css sie wieder ein.',
    suchen: '    display: flex;\n    justify-content: space-between;\n    gap: 6mm;\n',
    ersetzen: '',
  },
  /* ---- Predigtdienst ansehen (T121, Phase 4b) ---- */
  {
    id: 'treffpunkt-deine-gruppe-am-tag',
    datei: 'src/programm/FsProgram.tsx',
    regel: 'Wer alle Gruppen sieht, liest „Deine Gruppe" nicht am Tag — dort meinte es eine von vielen.',
    suchen: '{!amTreffpunkt && tag.items.some(eigene) && ',
    ersetzen: '{tag.items.some(eigene) && ',
  },
  {
    id: 'treffpunkt-deine-gruppe-am-punkt',
    datei: 'src/programm/FsProgram.tsx',
    regel: 'Wer alle Gruppen sieht, liest „Deine Gruppe" am Treffpunkt der eigenen Gruppe.',
    suchen: 'deine={amTreffpunkt && eigene(inst)}',
    ersetzen: 'deine={false}',
  },
  {
    id: 'treffpunkt-leiter-du-ueber-id',
    datei: 'src/programm/FsProgram.tsx',
    regel: 'Am Treffpunkt heißt der eigene Leiterplatz „Du" über die Id — ein Leiter als Freitext gehört niemandem.',
    suchen: 'du={me != null && gehoertZu(fsLeiterZuteilung(inst), me)}',
    ersetzen: 'du={me != null && gehoertZu({ name: inst.leader }, me)}',
  },
  {
    id: 'eigene-gruppe-auch-geleitet',
    datei: 'src/data/fs.ts',
    regel: 'Die eigene Gruppe ist auch die, die man leitet, ohne in ihr geführt zu sein.',
    suchen: '  if (geleitet) meine.add(geleitet)\n',
    ersetzen: '',
  },
  {
    id: 'besuch-eigene-gruppe-hervorgehoben',
    datei: 'src/programm/GruppenbesucheAnsicht.tsx',
    regel: 'Unter allen Besuchen ist der der eigenen Gruppe hervorgehoben.',
    suchen: "className={besuch.grp === meineGruppe ? 'gb-liste-zeile is-eigen' : 'gb-liste-zeile'}",
    ersetzen: 'className="gb-liste-zeile"',
  },
  /* ---- Weitere Pläne ansehen (T121, Phase 4c) ---- */
  {
    id: 'plaene-wahl-zeigt-gewaehlten',
    datei: 'src/programm/WeiterePlaeneAnsicht.tsx',
    regel: 'Gibt es mehrere Pläne, zeigt die Ansicht den gewählten — nicht immer den ersten.',
    suchen: '  const plan = plaene.find((p) => p.id === gewaehlt) ?? plaene[0]',
    ersetzen: '  const plan = plaene[0]',
  },
  {
    id: 'plaene-eigene-zeile-hervorgehoben',
    datei: 'src/programm/WeiterePlaeneAnsicht.tsx',
    regel: 'Im Plan ist die Zeile der eigenen Gruppe hervorgehoben.',
    suchen: "className={meineGruppe && e.grp === meineGruppe ? 'wp-liste-zeile is-eigen' : 'wp-liste-zeile'}",
    ersetzen: 'className="wp-liste-zeile"',
  },
  {
    id: 'plaene-ohne-gruppe-nichts-hervorgehoben',
    datei: 'src/programm/WeiterePlaeneAnsicht.tsx',
    regel: 'Wer keine Gruppe hat, sieht keine Zeile als die eigene — auch die noch offene nicht (beide `null`).',
    suchen: '{meineGruppe && e.grp === meineGruppe ?',
    ersetzen: '{e.grp === meineGruppe ?',
  },
  {
    id: 'ansicht-drucken-wort-ab-tablet',
    datei: 'src/programm/AnsichtDrucken.tsx',
    regel: 'Ab dem Tablet trägt auch der Druckknopf der Pläne ohne Woche sein Wort.',
    suchen: '        <DruckKnopf mitText={breit} onClick={() => drucken(zeichne())} />',
    ersetzen: '        <DruckKnopf mitText={false} onClick={() => drucken(zeichne())} />',
  },
  /* ---- Gesamt-Review des neuen Designs (T121, 13.10.2026) ---- */
  {
    id: 'schublade-escape',
    datei: 'src/app/Menue.tsx',
    regel: 'Escape schließt die Schublade — über `useEscape`, wie jedes Blatt.',
    suchen: '  useEscape(onSchliessen)\n',
    ersetzen: '',
  },
  {
    id: 'schublade-zurueck',
    datei: 'src/app/Menue.tsx',
    regel: 'Die Zurück-Taste schließt die Schublade, statt den Bildschirm zu verlassen.',
    suchen: '  useBackDismiss(true, onSchliessen)\n',
    ersetzen: '',
  },
  /* ---- Woche einrichten und Programm (T121, Phase 5b) ---- */
  {
    id: 'einrichten-anlass-gewaehlt',
    datei: 'src/planen/WochePanel.tsx',
    regel: 'Gewählt steht der Anlass, den die Woche hat — ohne Anlass „Normale Woche".',
    suchen: 'an={(art ?? null) === wert}',
    ersetzen: 'an={false}',
  },
  {
    id: 'einrichten-abweichung-offen',
    datei: 'src/planen/WochePanel.tsx',
    regel: 'Weicht eine Zusammenkunft schon ab, steht ihre Abweichung offen da.',
    suchen: 'const [offen, setOffen] = useState(() => weichtAb(week, tab))',
    ersetzen: 'const [offen, setOffen] = useState(false)',
  },
  {
    id: 'einrichten-ebene-ohne-tage',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: '„Woche einrichten" ist eine Ebene unter dem Plan — ohne die Karten der Tage.',
    suchen: '{!isFs && !isEdit && (',
    ersetzen: '{!isFs && (',
  },
  {
    id: 'programm-nur-mit-minuten',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Bearbeiten lassen sich nur Punkte von „Unser Leben als Christ", die Minuten tragen.',
    suchen: 'return lac && itemMinutes(rawItem) != null ? (',
    ersetzen: 'return lac ? (',
  },
  {
    id: 'programmpunkt-an-kennung',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Das Blatt eines Punkts findet ihn an seiner Kennung — verschoben bleibt es bei ihm.',
    suchen: 'const ii = section.items.findIndex((item) => !isSong(item) && item.iid === iid)',
    ersetzen: 'const ii = section.items.findIndex((item) => !isSong(item))',
  },
  {
    id: 'programmpunkt-entfernt-schliesst',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Mit dem entfernten Punkt geht sein Blatt zu.',
    suchen: "            dispatch({ type: 'lacRemove', si, ii })\n            onClose()",
    ersetzen: "            dispatch({ type: 'lacRemove', si, ii })",
  },
  {
    id: 'programmpunkt-neu-braucht-titel',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Ein eigener Punkt braucht einen Titel — leer bittet die App darum.',
    suchen: '    if (!titel.trim()) {',
    ersetzen: '    if (false) {',
  },
  /* ---- Automatisch und Plan senden (T121, Phase 5c) ---- */
  {
    id: 'auto-umfang-woche',
    datei: 'src/data/planning.ts',
    regel: '„Ganze Woche" wirkt auf beide Zusammenkünfte, der Tag auf die gezeigte.',
    suchen: "  const tabs = umfang === 'tag' ? [gezeigt] : MEETING_TABS\n",
    ersetzen: '  const tabs = [gezeigt]\n',
  },
  {
    id: 'auto-umfang-ohne-ausfall',
    datei: 'src/data/planning.ts',
    regel: 'Eine ausgefallene Zusammenkunft gehört nie zum Umfang von „Automatisch" — ihre Zuteilungen ruhen nur.',
    suchen: '  return tabs.filter((tab) => !istAusgefallen(week, tab))\n',
    ersetzen: '  return tabs\n',
  },
  {
    id: 'auto-zaehlt-ohne-gastredner',
    datei: 'src/data/planning.ts',
    regel: 'Das Blatt zählt den Gastredner nicht mit — „Automatisch" füllt und leert ihn nie.',
    suchen: "    if (platz.art !== 'helper' && isGuestRole(platz.slot.rolle)) continue\n",
    ersetzen: '',
  },
  {
    id: 'leeren-alles-beide-bereiche',
    datei: 'src/data/planning.ts',
    regel: '„Leeren" mit beiden Bereichen leert auch die Hilfsdienste.',
    suchen: "  if (scope !== 'parts') {\n    // Über alles Gespeicherte",
    ersetzen: "  if (scope === 'helpers') {\n    // Über alles Gespeicherte",
  },
  {
    id: 'auto-woche-zusagen-beider',
    datei: 'src/app/reducer.ts',
    regel: 'Wer beim Leeren der ganzen Woche seinen Platz verliert, verliert seine Zusage — auch am Wochenende.',
    suchen: '  return umfangTabs(state, umfang).flatMap(',
    ersetzen: '  return [mtab(state.tab)].flatMap(',
  },
  {
    id: 'blatt-auto-vorwahl',
    datei: 'src/planen/AutomatischBlatt.tsx',
    regel: 'Vorgewählt sind nur die Bereiche, in denen am Tag etwas offen ist.',
    suchen: '    return new Set(BEREICHE.filter((b) => amTag[b].besetzt < amTag[b].gesamt))',
    ersetzen: '    return new Set(BEREICHE)',
  },
  {
    id: 'blatt-auto-beide-heisst-alles',
    datei: 'src/planen/AutomatischBlatt.tsx',
    regel: 'Beide Bereiche gewählt heißt „alles" für Auto-Zuteilung und Leeren.',
    suchen: "  if (gewaehlt.size === BEREICHE.length) return 'all'\n",
    ersetzen: '',
  },
  {
    id: 'blatt-auto-schickt-umfang',
    datei: 'src/planen/AutomatischBlatt.tsx',
    regel: '„Zuteilen" schickt den gewählten Umfang mit.',
    suchen: "            dispatch({ type: 'autoAssign', scope, umfang })",
    ersetzen: "            dispatch({ type: 'autoAssign', scope, umfang: 'tag' })",
  },
  {
    id: 'blatt-auto-wahl-entschaerft',
    datei: 'src/planen/AutomatischBlatt.tsx',
    regel: 'Jede andere Wahl nimmt ein „Wirklich leeren?" zurück — es galt der alten.',
    suchen: '  const umschalten = (b: Bereich): void => {\n    leeren.entschaerfen()\n',
    ersetzen: '  const umschalten = (b: Bereich): void => {\n',
  },
  {
    id: 'blatt-senden-liste-grenze',
    datei: 'src/planen/PlanSendenBlatt.tsx',
    regel: 'Bei vielen offenen Zuteilungen steht keine Namensliste, nur der Satz.',
    suchen: '  const liste = n !== 0 && n <= LISTEN_GRENZE\n',
    ersetzen: '  const liste = n !== 0\n',
  },
  {
    id: 'blatt-senden-gesperrt-ohne-offene',
    datei: 'src/planen/PlanSendenBlatt.tsx',
    regel: 'Ist nichts mehr offen, lässt sich „Plan senden" nicht drücken.',
    suchen: '        <GesperrterKnopf className="knopf-haupt" gesperrt={laeuft || n === 0}',
    ersetzen: '        <GesperrterKnopf className="knopf-haupt" gesperrt={laeuft}',
  },
  {
    // Ersetzt seit Phase 9 `s89-druck-ohne-aktionsleiste` (print-s89.css):
    // Die Bögen hängen unter `body`, eine Regel blendet alles andere aus.
    id: 'bogen-blendet-alles-andere-aus',
    datei: 'src/druck/druck-bogen.css',
    regel: 'Im Druck eines Bogens kommt nur der Bogen aufs Papier — nicht die App darum herum.',
    suchen: "  :root[data-print='bogen'] body > :not(.druck-bogen) {\n",
    ersetzen: "  :root[data-print='bogen'] body > .gibt-es-nicht {\n",
  },
  {
    id: 'fs-abweichung-entfaellt',
    datei: 'src/data/fs.ts',
    regel: 'Ein für die Woche entfernter Treffpunkt des Grundplans steht unter „Anders als sonst" als entfallen.',
    suchen: "    if (!istNachRegel.has(s.ruleId)) out.push({ art: 'entfaellt', inst: s, regel: s.ruleId ? regelVon.get(s.ruleId) : undefined })\n",
    ersetzen: '',
  },
  {
    id: 'fs-abweichung-ohne-aus',
    datei: 'src/data/fs.ts',
    regel: 'Verglichen wird mit dem Grundplan ohne die ausgesetzten Wochen — sonst entfiele nie etwas.',
    suchen: '  const soll = genFsWeek(wochenStart, rules.map((r) => ({ ...r, aus: [] })))\n',
    ersetzen: '  const soll = genFsWeek(wochenStart, rules)\n',
  },
  {
    id: 'treffpunkt-bogen-sichtbar',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Auf dem Bogen der Treffpunkte steht, was der Leser auch am Bildschirm sieht — ohne Zuteilen die eigene Gruppe.',
    suchen: '  const sichtbar = (insts: readonly FsInstance[]) => fsVisible(insts, state.persons, state.groups, state.personId, alle)\n',
    ersetzen: '  const sichtbar = (insts: readonly FsInstance[]) => [...insts]\n',
  },
  {
    id: 'treffpunkt-bogen-leiter-offen',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Ein Treffpunkt ohne Leiter steht auf dem Bogen gepunktet da.',
    suchen: '  const leiter = (inst: FsInstance) => (inst.leader ? inst.leader : <Offen breite={140} />)\n',
    ersetzen: '  const leiter = (inst: FsInstance) => inst.leader\n',
  },
  {
    id: 'besuch-fremd-ohne-treffpunkt',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Von fremden Gruppenbesuchen druckt nur, wer zuteilt, Ort und Zeit — sonst Woche und Gruppe.',
    suchen: '      const treffpunkt = alle || meine.has(besuch.grp) ? besuchStand(besuch, lage).treffpunkte[0] : undefined\n',
    ersetzen: '      const treffpunkt = besuchStand(besuch, lage).treffpunkte[0]\n',
  },
  {
    id: 'gruppenbesuch-bogen-nur-kommende',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Der Bogen der Gruppenbesuche nennt nur die kommenden, wie die Ansicht.',
    suchen: "    .filter((besuch) => besuch.woche >= ab && (!nurKommende || besuchStand(besuch, lage, heute).art !== 'vorbei'))\n",
    ersetzen: '    .filter((besuch) => besuch.woche >= ab)\n',
  },
  {
    id: 'druckwahl-treffpunkte-bogen',
    datei: 'src/programm/DruckWahl.tsx',
    regel: 'Im Predigtdienst druckt „Diese Woche" den Bogen der Treffpunkte.',
    suchen: "        <TreffpunktBogen wochen={[wi]} zeitraum={week ? wochenZeitraum(week, state.lang, zeitraum ?? '') : (zeitraum ?? '')} />\n",
    ersetzen: '        <WochenBogen wi={wi} />\n',
  },
  {
    id: 'trolley-bogen-zwei-wochen',
    datei: 'src/druck/TrolleyBogen.tsx',
    regel: 'Der Bogen der Trolleys reicht zwei Wochen weit.',
    suchen: 'const TAGE = 14\n',
    ersetzen: 'const TAGE = 7\n',
  },
  {
    id: 'trolley-bogen-gesucht-gestrichelt',
    datei: 'src/druck/TrolleyBogen.tsx',
    regel: 'Auf dem Bogen der Trolleys ist gestrichelt, wo jemand einen Partner sucht.',
    suchen: "                  <span key={termin.id} className={termin.partner ? 'druck-termin' : 'druck-termin is-gesucht'}>\n",
    ersetzen: '                  <span key={termin.id} className="druck-termin">\n',
  },
  {
    id: 'trolley-bogen-neue-woche',
    datei: 'src/druck/TrolleyBogen.tsx',
    regel: 'Zwischen den beiden Wochen steht ein kräftigerer Strich.',
    suchen: "        <div key={tag} className={i === 7 ? 'druck-trolley-zeile is-neue-woche' : 'druck-trolley-zeile'} style={spalten}>\n",
    ersetzen: '        <div key={tag} className="druck-trolley-zeile" style={spalten}>\n',
  },
  {
    id: 'trolley-ansicht-druckt-bogen',
    datei: 'src/trolleys/TrolleyAnsicht.tsx',
    regel: 'Der Druckknopf der Trolleys druckt den Bogen über zwei Wochen, nicht den Bildschirm.',
    suchen: '        <AnsichtDrucken titel={t.fsTrolleysTab} bogen={() => <TrolleyBogen montag={montag} />} />\n',
    ersetzen: '        <AnsichtDrucken titel={t.fsTrolleysTab} />\n',
  },
  {
    id: 's89-ort-angekreuzt',
    datei: 'src/components/S89Karte.tsx',
    regel: 'Auf dem S-89 ist der Raum angekreuzt, in dem der Teil stattfindet — die Zusätzliche Klasse, wenn er dort ist.',
    suchen: '            <Ort an={payload.aux === true}>{t.auxKlasse}</Ort>\n',
    ersetzen: '            <Ort an={false}>{t.auxKlasse}</Ort>\n',
  },
  {
    id: 's89-nur-angekreuzter-vorgelesen',
    datei: 'src/components/S89Karte.tsx',
    regel: 'Vorgelesen wird nur der angekreuzte Raum — sonst wüsste man nicht, welcher gilt.',
    suchen: "    <span className={an ? 's89-ort is-an' : 's89-ort'} aria-hidden={an ? undefined : true}>\n",
    ersetzen: "    <span className={an ? 's89-ort is-an' : 's89-ort'}>\n",
  },
  {
    id: 's89-blatt-sechs-felder',
    datei: 'src/druck/S89Druck.tsx',
    regel: 'Auch ein halb leeres letztes S-89-Blatt hat sechs Felder — die Schnittkanten stehen, wo sie immer stehen.',
    suchen: '            {Array.from({ length: S89_JE_BLATT }, (_unused, i) => blatt[i]).map((z, i) => (\n',
    ersetzen: '            {blatt.map((z, i) => (\n',
  },
  {
    id: 's89-druck-ueber-den-bogen',
    datei: 'src/planen/S89Bogen.tsx',
    regel: 'Der S-89-Knopf im Planen druckt den Bogen mit allen Zetteln der Woche.',
    suchen: '          <button type="button" className="s89-druck-btn" onClick={() => drucken(<S89Druck zettel={zettel} datum={datum} />)}>\n',
    ersetzen: '          <button type="button" className="s89-druck-btn" onClick={() => window.print()}>\n',
  },
  {
    id: 's89-dieser-zettel-ab-tablet',
    datei: 'src/components/S89Sheet.tsx',
    regel: '„Diesen Zettel drucken" steht erst ab dem Tablet — am Handy druckt kaum jemand.',
    suchen: '        {breit && (\n',
    ersetzen: '        {(\n',
  },
  {
    id: 'blatt-senden-ohne-konto',
    datei: 'src/planen/PlanSendenBlatt.tsx',
    regel: 'Wen „Plan senden" nicht erreicht hat (kein Konto), steht im Blatt — den spricht der Planer selbst an.',
    suchen: '        {ohneKonto.length > 0 && (',
    ersetzen: '        {false && (',
  },
  {
    id: 'plan-senden-nicht-auf-altem-stand',
    datei: 'src/planen/wochen-versand.ts',
    regel: 'Auf der Momentaufnahme gibt es kein „Plan senden" — es ginge an ihr vorbei hinaus.',
    suchen: '  return rechteVon(state).zuteilen && !state.staleAt',
    ersetzen: '  return rechteVon(state).zuteilen',
  },
  {
    id: 'leiste-nicht-beim-einrichten',
    datei: 'src/planen/planen-raster.ts',
    regel: 'Die Aktionsleiste gehört zum Plan, nicht zu „Woche einrichten" und nicht zu den Zusagen.',
    suchen: "  if (thema === 'zusammenkuenfte') return state.tab === 'mid' || state.tab === 'we' ? 'zusammenkuenfte' : null\n",
    ersetzen: "  if (thema === 'zusammenkuenfte') return 'zusammenkuenfte'\n",
  },
  {
    id: 'senden-liste-treffpunkt-rolle',
    datei: 'src/data/plan-versand.ts',
    regel: 'In der Liste von „Plan senden" steht ein Treffpunkt als Treffpunkt-Leiter.',
    suchen: '      rolle: FS_LEITER,\n',
    ersetzen: "      rolle: '',\n",
  },
  /* ---- Nachentschieden am 13.10.2026 (T121) ---- */
  {
    id: 'programmpunkt-titel-nur-geaendert',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Übernommen wird ein Titel nur, wenn er anders ist als der, der dasteht.',
    suchen: "    if (neu && neu !== titelText) dispatch({ type: 'lacTitel', si, ii, title: neu })",
    ersetzen: "    if (neu) dispatch({ type: 'lacTitel', si, ii, title: neu })",
  },
  {
    id: 'blatt-verlaesst-feld-beim-schliessen',
    datei: 'src/components/Sheet.tsx',
    regel: 'Ein Blatt verlässt beim Schließen erst das Feld, in dem getippt wird — sonst ginge die Eingabe verloren.',
    suchen: '    if (aktiv instanceof HTMLElement && dlg.current?.contains(aktiv)) aktiv.blur()\n',
    ersetzen: '',
  },
  {
    id: 'programmpunkt-titel-escape',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Escape im Titelfeld nimmt die Eingabe zurück, ohne das Blatt darum zu schließen.',
    suchen: '                  e.stopPropagation()\n',
    ersetzen: '',
  },
  {
    id: 'programmpunkt-co-ohne-titel',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Ein Punkt des Kreisaufsehers bekommt kein Titelfeld — sein Thema steht im Plan.',
    suchen: '        {!istCoPunkt(stelle.item) && (',
    ersetzen: '        {(',
  },
  {
    id: 'lac-titel-co-unberuehrt',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Den Titel eines Punkts des Kreisaufsehers ändert das Umbenennen nicht.',
    suchen: '  if (!item || isSong(item) || istCoPunkt(item) || item.title === trimmed) return weeks',
    ersetzen: '  if (!item || isSong(item) || item.title === trimmed) return weeks',
  },
  {
    id: 'lac-titel-alle-varianten',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Ein neuer Titel gilt in allen Sprachvarianten gleich.',
    suchen: '  ziel.title = trimmed\n  forEachAltMeeting(an.week, tab, (m) => {\n    const vi = m.sections[si]?.items[ii]\n    if (vi && !isSong(vi)) vi.title = trimmed\n',
    ersetzen: '  ziel.title = trimmed\n  forEachAltMeeting(an.week, tab, (m) => {\n    const vi = m.sections[si]?.items[ii]\n',
  },
  {
    id: 'lac-titel-umbau',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Ein umbenannter Punkt ist ein Umbau — eine später nachgeholte Sprache legt ihren Titel nicht darüber.',
    suchen: '  umbauMerken(an.week, tab)\n',
    ersetzen: '',
  },
  {
    id: 'plus-minus-grenze',
    datei: 'src/bausteine/PlusMinus.tsx',
    regel: 'An der unteren Grenze ist − gesperrt.',
    suchen: '        gesperrt={wert <= min}',
    ersetzen: '        gesperrt={false}',
  },
  {
    id: 'gesperrter-knopf-tut-nichts',
    datei: 'src/bausteine/GesperrterKnopf.tsx',
    regel: 'Ein gesperrter Knopf bewirkt nichts, auch wenn man ihn antippt.',
    suchen: '        if (!gesperrt) onTipp()',
    ersetzen: '        onTipp()',
  },
  {
    id: 'gesperrter-knopf-behaelt-fokus',
    datei: 'src/bausteine/GesperrterKnopf.tsx',
    regel: 'Gesperrt behält der Knopf den Fokus — `disabled` gäbe ihn an die Seite hinter dem Blatt ab.',
    suchen: '      aria-disabled={gesperrt}',
    ersetzen: '      disabled={gesperrt}',
  },
  {
    id: 'plus-minus-einerschritt',
    datei: 'src/bausteine/PlusMinus.tsx',
    regel: '+ zählt in Einerschritten — jede Minute ist erreichbar.',
    suchen: '        onTipp={() => onWert(wert + 1)}',
    ersetzen: '        onTipp={() => onWert(wert + 5)}',
  },
  {
    id: 'push-karte-weg-bleibt',
    datei: 'src/mitteilungen/PushKarte.tsx',
    regel: 'Weggeklickt bleibt die Push-Karte auf diesem Gerät weg, auch nach dem Neuladen.',
    suchen: "      localStorage.setItem(WEG_KEY, '1')\n",
    ersetzen: '',
  },
  {
    id: 'push-karte-weg-wirkt',
    datei: 'src/mitteilungen/PushKarte.tsx',
    regel: 'Das ✕ blendet die Push-Karte sofort aus.',
    suchen: '  if (!angemeldet || subscribed || verweigert || weg) return null',
    ersetzen: '  if (!angemeldet || subscribed || verweigert) return null',
  },
  /* ---- Die Woche planen (T121, Phase 5a) ---- */
  {
    id: 'plan-lage-konflikt-vor-zusage',
    datei: 'src/data/saal.ts',
    regel: 'Steht die Person in einem Konflikt, ist ihr Platz ein Problem — auch wenn sie zugesagt hat.',
    suchen: "  if (imKonflikt) return 'problem'",
    ersetzen: '  void imKonflikt',
  },
  {
    id: 'plan-lage-ohne-zusage-voll',
    datei: 'src/data/saal.ts',
    regel: 'Wer nichts zu bestätigen hat (Gastredner, Gruppe), ist besetzt — er wartet nicht ewig.',
    suchen: "  return zusage === null ? 'voll' : LAGE_DER_ZUSAGE[zusage]",
    ersetzen: "  return zusage === null ? 'wartet' : LAGE_DER_ZUSAGE[zusage]",
  },
  {
    id: 'plan-platz-mit-zusage-gast',
    datei: 'src/data/plaetze.ts',
    regel: 'Gastredner und Kreisaufseher haben nichts zu bestätigen — keine Aufgabe, keine Zusage.',
    suchen: '  if (!slot?.name || isGuestRole(slot.rolle)) return false',
    ersetzen: '  if (!slot?.name) return false',
  },
  {
    id: 'plan-platz-mit-zusage-gruppe',
    datei: 'src/data/plaetze.ts',
    regel: 'Die Reinigungs-Rotation ist eine Gruppe, keine Person — sie bestätigt nichts.',
    suchen: "  return !(platz.art === 'helper' && platz.svc.groups)",
    ersetzen: '  return true',
  },
  {
    id: 'plan-aufgaben-nur-mit-zusage',
    datei: 'src/data/planning.ts',
    regel: 'Aufgaben entstehen nur, wo jemand bestätigen kann (`platzMitZusage`).',
    suchen: '        if (!slot || !platzMitZusage(platz)) continue',
    ersetzen: '        if (!slot?.name) continue',
  },
  {
    id: 'plan-besetzung-konflikt',
    datei: 'src/data/saal.ts',
    regel: 'Im Saal beim Planen ist der Platz im Konflikt rot — wie seine Zeile darunter.',
    suchen: '    b[lageVon(slot, zusage, Boolean(slot && imKonflikt(slot)))]++',
    ersetzen: '    b[lageVon(slot, zusage, false)]++',
  },
  {
    id: 'plan-besetzung-nur-mit-zusage',
    datei: 'src/data/saal.ts',
    regel: 'Der Saal fragt die Zusage nur, wo es eine gibt — der Gastredner sitzt voll, nicht blass.',
    suchen: '    const zusage = key !== null && platzMitZusage(platz) ? zusageStatus(confirmations, key) : null',
    ersetzen: '    const zusage = key !== null ? zusageStatus(confirmations, key) : null',
  },
  {
    id: 'plan-zusagen-stand-nur-mit-zusage',
    datei: 'src/data/saal.ts',
    regel: 'Die Zusagen der Spur zählen nur, wer etwas zu bestätigen hat — „3/4" wäre mit dem Gastredner nie fertig.',
    suchen: '    if (!platzMitZusage(platz)) continue',
    ersetzen: '    if (!platz.slot?.name) continue',
  },
  {
    id: 'plan-konflikte-feste-reihenfolge',
    datei: 'src/planen/WochenStand.tsx',
    regel: '„Zu klären" nennt die Konflikte in fester Reihenfolge: abwesend, doppelt, Hilfsdienst und Aufgabe.',
    suchen: 'const KONFLIKT_RANG: Partial<Record<ConflictKind, number>> = { absent: 0, double: 1, helperTask: 2 }',
    ersetzen: 'const KONFLIKT_RANG: Partial<Record<ConflictKind, number>> = { absent: 2, double: 1, helperTask: 0 }',
  },
  {
    id: 'plan-konflikt-abwesenheit-gilt',
    datei: 'src/planen/useKonflikte.ts',
    regel: 'Steht eine Person in mehreren Konflikten, nennt ihr Platz die Abwesenheit.',
    suchen: "    if (!vorher || (c.kind === 'absent' && vorher.kind !== 'absent')) je.set(c.kennung, c)",
    ersetzen: '    if (!vorher) je.set(c.kennung, c)',
  },
  {
    id: 'plan-hinweis-abwesend',
    datei: 'src/planen/platz-anzeige.ts',
    regel: 'Wer abwesend ist und eingeteilt, trägt am Platz „Abwesend" — nicht den Satz der Doppelbelegung.',
    suchen: "  if (konflikt?.kind === 'absent' || konflikt?.kind === 'fsAbsent') return t.abwesendChip\n",
    ersetzen: "  if (konflikt?.kind === 'absent' || konflikt?.kind === 'fsAbsent') return t.sheetSchonHeute\n",
  },
  {
    id: 'plan-hinweis-abgesagt',
    datei: 'src/planen/platz-anzeige.ts',
    regel: 'Ein abgesagter Platz nennt rechts die Absage.',
    suchen: '  absage: string = t.zusageAbgesagt,',
    ersetzen: '  absage?: string,',
  },
  {
    id: 'plan-programm-konflikt-markiert',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Wer unter „Zu klären" steht, ist an seinem Programmplatz rot.',
    suchen: '{...platzAnzeige(slot, stand, konflikte.von(slot), t)}',
    ersetzen: '{...platzAnzeige(slot, stand, undefined, t)}',
  },
  {
    id: 'plan-hilfsdienst-konflikt-markiert',
    datei: 'src/planen/HelpersPanel.tsx',
    regel: 'Wer unter „Zu klären" steht, ist an seinem Hilfsdienst rot — Hilfsdienste sind die häufigste Hälfte der Konflikte.',
    suchen: '{...platzAnzeige(slot, stand, gruppe ? undefined : konflikte.von(slot), t, t.spurErsatzGesucht)}',
    ersetzen: '{...platzAnzeige(slot, stand, undefined, t, t.spurErsatzGesucht)}',
  },
  {
    id: 'plan-hilfsdienst-ersatz-gesucht',
    datei: 'src/planen/HelpersPanel.tsx',
    regel: 'Sagt jemand einen Hilfsdienst ab, steht am Platz „Ersatz gesucht" — die App sucht selbst.',
    suchen: 'konflikte.von(slot), t, t.spurErsatzGesucht)}',
    ersetzen: 'konflikte.von(slot), t)}',
  },
  {
    id: 'plan-hilfsdienst-gruppe-ohne-zusage',
    datei: 'src/planen/HelpersPanel.tsx',
    regel: 'Eine Gruppe sagt nicht zu — ihr Platz wartet nicht.',
    suchen: 'const stand = name && !gruppe && zusage.moeglich(tab)',
    ersetzen: 'const stand = name && zusage.moeglich(tab)',
  },
  {
    id: 'plan-platz-offen-zuteilen',
    datei: 'src/planen/PlatzZeile.tsx',
    regel: 'Ein offener Platz heißt „Zuteilen" — er sagt, was hier zu tun ist.',
    suchen: "{lage === 'offen' ? t.spurZuteilen : name}",
    ersetzen: '{name}',
  },
  {
    id: 'plan-platz-wartet-sichtbar',
    datei: 'src/planen/PlatzZeile.tsx',
    regel: '„Wartet" steht sichtbar hinter der Rolle.',
    suchen: "lage === 'wartet' ? status : undefined",
    ersetzen: 'undefined',
  },
  {
    id: 'plan-platz-stufe-vorgelesen',
    datei: 'src/planen/PlatzZeile.tsx',
    regel: 'Die übrigen Stufen der Zusage hört ein Vorleseprogramm — die Farbe allein sieht es nicht.',
    suchen: '{status && !stufeSichtbar && <span className="sr-only">{status}</span>}',
    ersetzen: '{null}',
  },
  {
    id: 'plan-platz-absage-einmal',
    datei: 'src/planen/PlatzZeile.tsx',
    regel: 'Steht die Absage sichtbar als Hinweis da, hört der Screenreader sie nicht ein zweites Mal.',
    suchen: "  const stufeSichtbar = lage === 'wartet' || status === hinweis",
    ersetzen: "  const stufeSichtbar = lage === 'wartet'",
  },
  {
    id: 'plan-spur-senden-ganze-woche',
    datei: 'src/planen/plan-spur.ts',
    regel: 'Was noch hinaus muss, steht in der Spur auch dann an, wenn die gezeigte Zusammenkunft leer ist.',
    suchen: "z.neu > 0 ? (alleBesetzt ? 'jetzt' : 'teil') : z.besetzt > 0 ? 'voll' : 'leer'",
    ersetzen: "z.besetzt === 0 ? 'leer' : z.neu === 0 ? 'voll' : alleBesetzt ? 'jetzt' : 'teil'",
  },
  {
    id: 'plan-spur-zusagen-nach-senden',
    datei: 'src/planen/plan-spur.ts',
    regel: 'Die Zusagen sind erst dran, wenn alles besetzt und gesendet ist.',
    suchen: "    : zuteilen === 'voll' && senden === 'voll'",
    ersetzen: "    : zuteilen === 'voll'",
  },
  {
    id: 'plan-spur-neu-mit-treffpunkten',
    datei: 'src/planen/plan-spur.ts',
    regel: '„Neu" zählt die ganze Woche wie „Plan senden" — Treffpunkte eingeschlossen.',
    suchen: 'offeneMeldungen(week, fsWeek, q.services',
    ersetzen: 'offeneMeldungen(week, undefined, q.services',
  },
  {
    id: 'plan-spur-nicht-bei-ausfall',
    datei: 'src/planen/WochenStand.tsx',
    regel: 'Fällt die Zusammenkunft aus, steht keine Spur da — es gibt nichts zu besetzen.',
    suchen: '      week && !istAusgefallen(week, tab)',
    ersetzen: '      week',
  },
  {
    id: 'plan-besetzung-nicht-bei-ausfall',
    datei: 'src/planen/WochenStand.tsx',
    regel: 'Fällt die Zusammenkunft aus, steht keine Besetzung da — eine Zahl führte an einen Plan, den es nicht gibt.',
    suchen: '  const da = week && !istAusgefallen(week, tab) ? week : null',
    ersetzen: '  const da = week ?? null',
  },
  {
    id: 'plan-klaeren-offene',
    datei: 'src/planen/WochenStand.tsx',
    regel: 'Unter „Zu klären" steht, wie viele Zuteilungen noch offen sind.',
    suchen: '          {offenGesamt > 0 && (',
    ersetzen: '          {offenGesamt < 0 && (',
  },
  {
    id: 'mitteilung-gelesen-nicht-lokal',
    datei: 'src/app/persist.ts',
    regel: 'Eine hier entstandene Zeile wird nicht als gelesen geschrieben — unter ihrer Kennung steht nichts in der Datenbank.',
    suchen: 'if (vorher && !vorher.read && !vorher.local) markNotificationRead(',
    ersetzen: 'if (vorher && !vorher.read) markNotificationRead(',
  },
  {
    id: 'absage-schluessel-an-die-planer',
    datei: 'src/app/persist.ts',
    regel: 'Die Absage geht mit dem Schlüssel ihrer Aufgabe an die Planer — daran findet ihr Tipp die Woche.',
    suchen: 'notifyPlanners(neu.type, neu.title, neu.text, neu.taskId)',
    ersetzen: 'notifyPlanners(neu.type, neu.title, neu.text)',
  },
  {
    id: 'absage-schluessel-im-reducer',
    datei: 'src/app/reducer.ts',
    regel: 'Die Meldung „Verhinderung gemeldet" trägt den Schlüssel der abgesagten Aufgabe.',
    suchen: '        // landete er nirgends.\n        action.id,\n',
    ersetzen: '        // landete er nirgends.\n',
  },
  {
    id: 'notify-planners-schluessel-gekuerzt',
    datei: 'supabase/schema.sql',
    regel: 'Der Schlüssel, den ein Mitglied über notify_planners mitschickt, wird gekürzt — er ist nur ein Wegweiser.',
    suchen: "nullif(left(task, 300), '')",
    ersetzen: 'task',
  },
  {
    id: 'mitteilung-text-zwei-zeilen',
    datei: 'src/mitteilungen/mitteilungen.css',
    regel: 'Der Text einer Mitteilung steht höchstens zwei Zeilen hoch.',
    suchen: '  -webkit-line-clamp: 2;\n',
    ersetzen: '  -webkit-line-clamp: 3;\n',
  },
  // ── Freie Plätze selbst übernehmen (4.10.2026) ────────────────────────────
  {
    id: 'frei-erst-nach-plan-senden',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Freie Plätze einer Woche werden erst angeboten, wenn ihr Plan gesendet ist — vorher plant der Planer noch.',
    suchen: '    if (!planGesendet(sentLog, week.start)) return\n',
    ersetzen: '',
  },
  {
    id: 'frei-treffpunkt-gibt-nicht-frei',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Ein gesendeter Treffpunkt gibt die Zusammenkünfte der Woche nicht frei — nur deren eigene Schlüssel zählen.',
    suchen: 'return neuesterVersand(sentLog, (schluessel) => schluessel.startsWith(zusammenkunft)) !== null',
    ersetzen: 'return neuesterVersand(sentLog, (schluessel) => schluessel.includes(woche)) !== null',
  },
  {
    id: 'frei-nicht-ausgefallen',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Eine ausgefallene Zusammenkunft bietet keine freien Plätze an.',
    suchen: '      if (istAusgefallen(week, tab)) continue\n',
    ersetzen: '',
  },
  {
    id: 'frei-nicht-vorbei',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Eine vergangene Zusammenkunft bietet keine freien Plätze an.',
    suchen: '      if (istVorbei(at, heute)) continue\n',
    ersetzen: '',
  },
  {
    id: 'frei-nicht-abwesend',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Wer an dem Tag abwesend ist, bekommt dort keine freien Plätze angeboten.',
    suchen: '      if (istAbwesend(abwesend, me.id, wi, tab)) continue\n',
    ersetzen: '',
  },
  {
    id: 'frei-brueder-platz',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Einen Brüder-Platz bekommt keine Schwester angeboten.',
    suchen: "        if (platz.art !== 'helper' && platz.slot.male && me.female) continue\n",
    ersetzen: '',
  },
  {
    id: 'frei-nicht-neben-eigenem',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Wer im Programmpunkt schon eingeteilt ist, bekommt den zweiten Platz darin nicht angeboten.',
    suchen: "        if (platz.art === 'programm' && slotsOf(platz.item, platz.aux).some((s) => gehoertZu(s, me))) continue\n",
    ersetzen: '',
  },
  {
    id: 'frei-reinigung-nicht',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Die Reinigung (eine Gruppe, keine Person) wird nicht angeboten.',
    suchen: "  if (platz.art === 'helper') return platz.svc.groups ? null : serviceQualKey(platz.svc.key)",
    ersetzen: "  if (platz.art === 'helper') return serviceQualKey(platz.svc.key)",
  },
  {
    id: 'frei-kein-rednerplatz',
    datei: 'supabase/functions/_shared/freie-plaetze.ts',
    regel: 'Rednerplätze (Gastredner, eigener Redner, Kreisaufseher) werden nicht angeboten — wer redet, entscheidet der Planer.',
    suchen: "  if (SKIP_ROLE.test(rolle) || rolle.split(' · ')[0] === EIGENER_REDNER) return null\n",
    ersetzen: '',
  },
  {
    id: 'frei-eigener-redner-nicht',
    datei: 'supabase/functions/_shared/freie-plaetze.ts',
    regel: 'Auch der eigene Redner (Rolle „Redner") ist ein Rednerplatz — wie `isSpeakerRole` im Client.',
    suchen: " || rolle.split(' · ')[0] === EIGENER_REDNER",
    ersetzen: '',
  },
  {
    id: 'frei-nur-angebotenes',
    datei: 'src/app/reducer.ts',
    regel: '„Übernehmen" trägt nur ein, was angeboten ist — ein veralteter Tipp ändert nichts.',
    suchen: '      if (!platz || !me || !sel) return state\n',
    ersetzen: '      if (!me || !sel) return state\n',
  },
  {
    id: 'frei-server-schreibt',
    datei: 'src/app/persist.ts',
    regel: 'Den freien Platz schreibt die Edge Function, nicht der Client — die Woche gehört ihm nicht.',
    suchen: "const OHNE_WOCHENSCHREIBEN: readonly AppAction['type'][] = ['hydrate', 'takeSubstitute', 'platzUebernehmen']",
    ersetzen: "const OHNE_WOCHENSCHREIBEN: readonly AppAction['type'][] = ['hydrate', 'takeSubstitute']",
  },
  {
    id: 'fill-weiche',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Der Aufruf „fill" geht seinen eigenen Weg — Programmpunkte laufen nicht über die Hilfsdienst-Prüfung.',
    suchen: "    if (payload?.action === 'fill') {\n",
    ersetzen: '    if (false) {\n',
  },
  {
    id: 'fill-nach-plan-senden',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Der Server trägt erst ein, wenn der Plan der Woche gesendet ist.',
    suchen: "  if (versand.length === 0) return json({ error: 'not-published' }, 409)\n",
    ersetzen: '',
  },
  {
    id: 'fill-platz-leer',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Der Server überschreibt keinen besetzten Platz.',
    suchen: "  if (fund.slot?.name) return json({ error: 'slot-taken' }, 409)\n",
    ersetzen: '',
  },
  {
    id: 'fill-angebot',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Was nicht angeboten wird (Schulung, Redner, Reinigung), trägt der Server nicht ein.',
    suchen: "  if (!fund.bereich) return json({ error: 'not-offered' }, 403)\n",
    ersetzen: '',
  },
  {
    id: 'fill-bereich',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Der Server verlangt den Aufgabenbereich des Platzes.',
    suchen: '!person.priv?.[fund.bereich] || ',
    ersetzen: '',
  },
  {
    id: 'fill-brueder',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Einen Brüder-Platz trägt der Server keiner Schwester ein.',
    suchen: '(fund.nurBrueder && person.female)',
    ersetzen: 'false',
  },
  {
    id: 'fill-ausfall',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'In eine ausgefallene Zusammenkunft trägt der Server nicht ein.',
    suchen: "  if (istAusgefallenFuer(row.data.dev, teile.tab)) return json({ error: 'meeting-cancelled' }, 409)\n",
    ersetzen: '',
  },
  {
    id: 'fill-vorbei',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'In eine vergangene Zusammenkunft trägt der Server nicht ein — am Tag selbst schon.',
    suchen: "  if (tag && tag < heute) return json({ error: 'past' }, 409)\n",
    ersetzen: '',
  },
  {
    id: 'fill-abwesend',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Wer an dem Tag abwesend ist, wird nicht eingetragen.',
    suchen: "  if (tag && absences.some((a) => a.from_date <= tag && tag <= a.to_date)) return json({ error: 'absent' }, 409)\n",
    ersetzen: '',
  },
  {
    id: 'fill-vergleiche-und-tausche',
    // Seit dem 5.10.2026 im gemeinsamen Schreibweg von `zuteilen` und `substitute`.
    datei: 'supabase/functions/_shared/woche-schreiben.ts',
    regel: 'Hat jemand die Woche zwischen Lesen und Schreiben geändert, schreibt der Server nicht darüber.',
    suchen: '    `&updated_at=eq.${wert(stand)}&select=updated_at`\n',
    ersetzen: "    '&select=updated_at'\n",
  },
  {
    id: 'fill-klasse-nur-wenn-besteht',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Plätze der Zusätzlichen Klasse gibt es nur, solange sie besteht.',
    suchen: "      if (teile.art === 'aux' && !meeting.auxRatgeber) return null\n",
    ersetzen: '',
  },
  {
    id: 'fill-platzzahl',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Ein Hilfsdienst-Platz jenseits der eingestellten Platzzahl wird nicht besetzt.',
    suchen: '    if (!svc || teile.pos >= svc.count) return null\n',
    ersetzen: '    if (!svc) return null\n',
  },
  {
    id: 'fill-reinigung',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Die Reinigung trägt der Server niemandem ein.',
    suchen: '      bereich: svc.groups ? null : `svc:${svc.key}`,\n',
    ersetzen: '      bereich: `svc:${svc.key}`,\n',
  },
  {
    id: 'vortrag-schaetze-beschriftung',
    datei: 'src/personen/priv-label.ts',
    regel: 'Der Vortrag aus „Schätze aus Gottes Wort" trägt seinen Programmteil im Namen — „Vorträge" allein hieß jeder Vortrag.',
    suchen: "  if (key === 'vortrag') return `${t.privSchaetze} · ${t.privVortrag}`\n",
    ersetzen: '',
  },

  // ── Feste Rollen mehrfach vergeben: die Namen im Banner (F7, 4.10.2026) ───
  {
    id: 'feste-rollen-warnung',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Die Personenliste warnt, wenn eine feste Rolle (Wachtturm-Studium-Leiter, Vertreter) mehrfach vergeben ist (F7).',
    suchen: '      mehrfachRollen: doppelteFesteRollen(sortiert),',
    ersetzen: '      mehrfachRollen: [],',
  },
  {
    id: 'feste-rollen-erst-ab-zwei',
    datei: 'src/data/helpers.ts',
    regel: 'Eine feste Rolle, die genau eine Person trägt, ist kein Befund.',
    suchen: '  })).filter(({ personen }) => personen.length >= 2)',
    ersetzen: '  })).filter(({ personen }) => personen.length >= 1)',
  },
  {
    id: 'feste-rollen-namen',
    datei: 'src/personen/PersonenScreen.tsx',
    regel:
      'Die Warnung nennt je Rolle, wer sie trägt — mit der Zahl allein suchte der Planer die Betroffenen Detail für Detail.',
    suchen: '              <NamenKnoepfe personen={r.personen} />\n',
    ersetzen: '',
  },
  {
    id: 'feste-rollen-namen-sortiert',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Die Namen in der Warnung stehen in der Folge der Liste — alphabetisch in der Sprache des Lesers.',
    suchen: '      mehrfachRollen: doppelteFesteRollen(sortiert),',
    ersetzen: '      mehrfachRollen: doppelteFesteRollen(persons),',
  },
  {
    id: 'warnung-name-oeffnet-sein-detail',
    datei: 'src/personen/NamenKnoepfe.tsx',
    regel: 'Ein Tipp auf einen Namen in einem Hinweis öffnet genau diese Person, nicht die erste.',
    suchen: "            dispatch({ type: 'selectPerson', id: person.id })\n",
    ersetzen: "            dispatch({ type: 'selectPerson', id: personen[0]!.id })\n",
  },
  {
    id: 'feste-rollen-im-filter',
    datei: 'src/personen/PersonenFilterBlatt.tsx',
    regel: 'Der Filter „Aufgabenbereiche" führt auch die festen Rollen — so findet man den festen Leiter.',
    suchen: '            ...[...QUALIFICATION_ORDER, ...WT_ROLE_ORDER].map(',
    ersetzen: '            ...[...QUALIFICATION_ORDER].map(',
  },

  /* ---- Code-Review 5.10.2026 ---- */
  {
    id: 'grundplan-nur-eigene-regel',
    datei: 'src/app/reducer.ts',
    regel:
      'Eine geänderte Regel setzt Zeit und Ort nur ihrer eigenen Treffpunkte zurück — die der übrigen Gruppen bleiben, wie ihre Woche sie hat (sonst wiese die Datenbank die Wochen des Gruppenaufsehers ab).',
    suchen: '      const dieseRegel = (inst: FsInstance) => inst.ruleId === action.id\n',
    ersetzen: '      const dieseRegel = (_inst: FsInstance) => true\n',
  },
  {
    id: 'grundplan-anlegen-behaelt-wochen',
    datei: 'src/data/fs.ts',
    regel: 'Ohne Angabe behält die Neu-Ausrichtung Zeit und Ort jeder Woche — beim Laden, beim Anlegen und Entfernen einer Regel.',
    suchen: '  zuruecksetzen: (inst: FsInstance) => boolean = () => false,\n',
    ersetzen: '  zuruecksetzen: (inst: FsInstance) => boolean = () => true,\n',
  },

  /* ---- Edge-Runde 5.10.2026: Schreiben auf Stand, „heute" vom Gerät ---- */
  {
    id: 'woche-schreiben-aussetzer',
    datei: 'supabase/functions/_shared/woche-schreiben.ts',
    regel: 'Ein Aussetzer beim ersten Schreibversuch verwirft weder die Zuteilung des Planers noch den Tipp auf einen freien Platz.',
    suchen: '  return (await versuchen()) ?? versuchen()\n',
    ersetzen: '  return versuchen()\n',
  },
  {
    id: 'woche-schreiben-zweiter-versuch-bedingt',
    datei: 'supabase/functions/_shared/woche-schreiben.ts',
    /*
      Der Fehler bis zum 5.10.2026: Der zweite Versuch ging ohne Bedingung
      hinaus. Die Mutation stellt genau das wieder her.
    */
    regel: 'Auch der zweite Schreibversuch trägt die Bedingung — schreibt dazwischen ein anderer, gewinnt er.',
    suchen: '  return (await versuchen()) ?? versuchen()\n',
    ersetzen:
      "  return (await versuchen()) ?? ((await rest.patchZeilen<{ updated_at: string }>(pfad.replace(/&updated_at=[^&]*/, ''), { data }))?.[0]?.updated_at ?? null)\n",
  },
  {
    id: 'woche-konflikt-ohne-ungeschuetzten-anlauf',
    datei: 'src/lib/data.ts',
    regel: 'Trifft das Update auf den Stand nichts, ist es ein Konflikt — kein zweiter Anlauf ohne Bedingung (5.10.2026).',
    suchen: '  if (data) {\n    standMerken(wochenStand, woche, data.updated_at as string, geladen)\n    return\n  }\n  konfliktMelder?.()\n}\n',
    ersetzen:
      "  if (data) {\n    standMerken(wochenStand, woche, data.updated_at as string, geladen)\n    return\n  }\n  const { data: erneut } = await supabase.from('weeks').update({ data: week }).eq('congregation_id', congregationId).eq('start', woche).select('updated_at').maybeSingle()\n  if (erneut) return\n  konfliktMelder?.()\n}\n",
  },
  {
    id: 'fill-heute-vom-geraet',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Ob eine Zusammenkunft vorbei ist, entscheidet beim Übernehmen eines freien Platzes der Kalendertag des Geräts, nicht der UTC-Tag.',
    suchen: '      const heute = new Date(heuteUtc(payload.heute)).toISOString().slice(0, 10)\n',
    ersetzen: '      const heute = new Date(heuteUtc(undefined)).toISOString().slice(0, 10)\n',
  },
  {
    id: 'fill-heute-geht-mit',
    datei: 'src/lib/data.ts',
    regel: 'Die App schickt beim Übernehmen eines freien Platzes ihren Kalendertag mit.',
    suchen: "{ body: { action: 'fill', taskKey, heute } }",
    ersetzen: "{ body: { action: 'fill', taskKey } }",
  },

  /* ---- Befund 9, 5.10.2026: Bestand, wie die App ihn lädt ---- */
  {
    id: 'neue-woche-klasse',
    datei: 'src/data/neue-woche.ts',
    regel: 'Eine importierte Woche bekommt die Zusätzliche Klasse, wenn sie eingerichtet ist.',
    suchen: '  let wochen = syncAuxSlots([mitEnden], k.auxClass)\n',
    ersetzen: '  let wochen = [mitEnden]\n',
  },
  {
    id: 'neue-woche-endzeit',
    datei: 'src/data/neue-woche.ts',
    regel: 'Eine importierte Woche bekommt die Endzeit aus den eigenen Zusammenkunftszeiten, nicht die des Imports.',
    suchen: '    mid: { ...roh.mid, end: endeAusStartzeit(k.zeiten.mid.time, roh.mid.end) },\n',
    ersetzen: '    mid: { ...roh.mid },\n',
  },
  {
    id: 'neue-woche-gedaechtnismahl',
    datei: 'src/data/neue-woche.ts',
    regel: 'Bringt eine importierte Woche das Gedächtnismahl mit, entfällt die Zusammenkunft, die es trifft.',
    suchen: '  if (mem) wochen = setAnlassTermin(wochen, 0, { von: mem })\n',
    ersetzen: '',
  },
  {
    id: 'import-skript-ordnet-ein',
    datei: 'scripts/wochen-importieren.mjs',
    regel: 'Das Import-Skript schreibt die Woche, wie der Knopf in der App sie einordnet — samt Treffpunkten.',
    suchen: '    const { week, fsWeek } = einordnen(roh)\n',
    ersetzen: '    const [week, fsWeek] = [roh, []]\n',
  },
  {
    id: 'import-skript-treffpunkte-bleiben',
    datei: 'scripts/wochen-importieren.mjs',
    regel: 'Hat eine Woche schon Treffpunkte, lässt das Import-Skript sie stehen.',
    suchen: '    if (mitTreffpunkten.has(week.start)) {\n',
    ersetzen: '    if (false) {\n',
  },
  {
    id: 'angleichen-klasse',
    datei: 'scripts/wochen-angleichen.mjs',
    regel: 'Das Prüfskript findet Wochen ohne die eingeschaltete Zusätzliche Klasse — an denen `zuteilen` den Planer abweist.',
    suchen: '  const angeglichen = app.syncAuxSlots(geladen, auxClass)\n',
    ersetzen: '  const angeglichen = geladen\n',
  },
  {
    id: 'angleichen-grundplan',
    datei: 'scripts/wochen-angleichen.mjs',
    regel: 'Das Prüfskript richtet die Treffpunkte nach dem Grundplan aus, wie das Laden — sonst weist der Trigger den Gruppenaufseher ab.',
    suchen: '  const ausgerichtet = fsRules.length ? app.regenFsWeeks(zeilen.map((r) => r.start), fsRoh, fsRules) : fsRoh\n',
    ersetzen: '  const ausgerichtet = fsRoh\n',
  },
  {
    id: 'angleichen-auf-stand',
    datei: 'scripts/wochen-angleichen.mjs',
    regel: 'Das Prüfskript schreibt eine Woche nur auf ihren gelesenen Stand — was inzwischen jemand gespeichert hat, bleibt.',
    suchen: '        `weeks?${meine}&start=eq.${e.start}&updated_at=eq.${encodeURIComponent(e.stand)}&select=start`,\n',
    ersetzen: '        `weeks?${meine}&start=eq.${e.start}&select=start`,\n',
  },
  // ---- 5.10.2026 abends: Durchsicht der bewusst offenen Punkte ----
  {
    id: 'personen-filter-ueber-detail',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Suche und Filter der Personenliste überstehen das Detail einer Person.',
    suchen: '  const [filter, setFilter] = useState<PersonFilter>(KEIN_FILTER)\n',
    ersetzen: '  const [filter, setFilter] = useState<PersonFilter>(KEIN_FILTER)\n  if (selected && filter !== KEIN_FILTER) setFilter(KEIN_FILTER)\n',
  },
  {
    id: 'zeitleiste-besuch',
    datei: 'src/personen/person-timeline.ts',
    regel: 'Vorgemerkte Gruppenbesuche stehen in der Zeitleiste des Besuchers.',
    suchen: '  for (const besuch of state.gruppenbesuche) {\n',
    ersetzen: '  for (const besuch of [] as typeof state.gruppenbesuche) {\n',
  },
  {
    id: 'zeitleiste-besuch-nicht-doppelt',
    datei: 'src/personen/person-timeline.ts',
    regel: 'Ein Besuch in einer geladenen Woche steht als Treffpunkt in der Zeitleiste, nicht noch einmal als Besuch.',
    suchen: "    if (stand.art !== 'vorgemerkt') continue\n",
    ersetzen: "    if (stand.art === 'vorbei') continue\n",
  },
  {
    id: 'druck-ansicht-druckt',
    datei: 'src/programm/AnsichtDrucken.tsx',
    regel: 'Der Druckknopf der Pläne ohne Woche druckt ihren Bogen.',
    suchen: 'onClick={() => drucken(zeichne())}',
    ersetzen: 'onClick={() => {}}',
  },
  // `druck-ansicht-kennzeichen` gestrichen (Phase 9e): Das Kennzeichen setzt
  // jetzt `useDruckBogen` für jeden Bogen — siehe `druck-bogen-kennzeichen`.
  {
    id: 'rechte-stufe-gruppe',
    datei: 'src/data/rechte.ts',
    regel: 'Wer eine Gruppe betreut, nennt sich in der Seitenleiste nicht „Verkündiger".',
    suchen: "  if (r.gruppe === null) return 'verkuendiger'\n",
    ersetzen: "  return 'verkuendiger'\n",
  },
  {
    id: 'rechte-stufe-gehilfe',
    datei: 'src/data/rechte.ts',
    regel: 'Der Gehilfe einer Gruppe heißt Gehilfe, nicht Gruppenaufseher.',
    suchen: "  return gruppe?.overseerId === s.personId ? 'gruppenaufseher' : 'gehilfe'\n",
    ersetzen: "  return 'gruppenaufseher'\n",
  },
  // Vortragsplan aus dem Planungsprogramm (T122).
  {
    id: 'vp-unbekannte-felder-nennen',
    datei: 'src/lib/vortragsplan-xml.ts',
    regel: 'Was die Datei sonst noch enthält, nennt die Vorschau — der Planer sieht, dass es das Gerät nicht verlässt.',
    suchen: '      if (!BEKANNT.kinder.has(kind.localName)) ignoriert.add(kind.localName)\n',
    ersetzen: '      if (!BEKANNT.kinder.has(kind.localName)) continue\n',
  },
  {
    id: 'vp-vergangene-wochen',
    datei: 'src/data/vortragsplan.ts',
    regel: 'Einen Vortrag, dessen Tag vorbei ist, fasst der Import nicht an.',
    suchen: '    if (tag < heute) {\n',
    ersetzen: "    if (tag < '0000') {\n",
  },
  {
    id: 'vp-zeitraum-am-tag',
    datei: 'src/data/vortragsplan.ts',
    regel: 'Ob ein Vortrag im Zeitraum der Datei liegt, entscheidet der Tag der Zusammenkunft, nicht der Montag seiner Woche.',
    suchen: '      if (tag >= plan.von && tag <= plan.bis && !fehlerhaft.has(woche)) wochen.add(woche)\n',
    ersetzen: '      if (woche >= montagVon(plan.von) && woche <= montagVon(plan.bis) && !fehlerhaft.has(woche)) wochen.add(woche)\n',
  },
  {
    id: 'vp-fehlerwoche-bleibt',
    datei: 'src/data/vortragsplan.ts',
    regel: 'Ein fehlerhafter Eintrag ist keine Absage: Seine Woche bleibt, wie sie ist.',
    suchen: '  const fehlerhaft = new Set(plan.fehlerWochen ?? [])\n',
    ersetzen: '  const fehlerhaft = new Set<string>()\n',
  },
  {
    id: 'vp-kreisaufseher-woche',
    datei: 'src/data/vortragsplan.ts',
    regel: 'In der Woche des Kreisaufsehers hält er den Vortrag — der Import lässt sie stehen.',
    suchen: "  if (week.anlass?.art === 'co') return 'kreisaufseher'\n",
    ersetzen: "  if (week.anlass?.art === 'nie') return 'kreisaufseher'\n",
  },
  {
    id: 'vp-vormerkung-in-neue-woche',
    datei: 'src/data/neue-woche.ts',
    regel: 'Eine später geholte Woche bekommt ihren vorgemerkten Vortrag.',
    suchen: '  const week = vortragInNeueWoche(wochen[0] ?? mitEnden, k.vortraege, k.persons)\n',
    ersetzen: '  const week = wochen[0] ?? mitEnden\n',
  },
  {
    id: 'vp-zusage-verfaellt',
    datei: 'src/app/reducer.ts',
    regel: 'Wer durch den Vortragsplan seinen Vortrag verliert, verliert die Zusage — wie beim Zuteilen von Hand.',
    suchen: "          geaendert.flatMap((wi) => geaenderteSlots(state.weeks, weeks, wi, 'we', state.services)),\n",
    ersetzen: '          [],\n',
  },
  {
    id: 'vp-vormerkungen-speichern',
    datei: 'src/app/persist.ts',
    regel: 'Die Vormerkungen des Vortragsplans gehen hinaus.',
    suchen: "    case 'vortragsplanUebernehmen':\n      vortraegeSpeichern(congId, prev, next)\n",
    ersetzen: "    case 'vortragsplanUebernehmen':\n",
  },
  {
    id: 'vp-thema-feld-schluessel',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Setzt jemand das Vortragsthema von außen, zeigt das Feld den neuen Titel — und schreibt den alten nicht zurück.',
    suchen: '                  key={`talk-${state.week}-${ii}-${rawTitle}`}\n',
    ersetzen: '                  key={`talk-${state.week}-${ii}`}\n',
  },
  {
    id: 'co-thema-feld-schluessel',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Ändert sich das Thema der Kreisaufseher-Woche von außen, zeigt das Feld den neuen Text.',
    suchen: '                    key={`thema-${state.week}-${si}-${ii}-${rawTitle}`}\n',
    ersetzen: '                    key={`thema-${state.week}-${si}-${ii}`}\n',
  },
  {
    id: 'vp-lied-feld-schluessel',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Setzt jemand das Anfangslied von außen, zeigt das Feld die neue Nummer.',
    suchen: "            key={`song-${isOpening ? 'open' : 'close'}-${state.week}-${liedNr}`}\n",
    ersetzen: "            key={`song-${isOpening ? 'open' : 'close'}-${state.week}`}\n",
  },
  {
    id: 'vp-rls-nur-zuteiler',
    datei: 'supabase/schema.sql',
    regel: 'Vorgemerkte Vorträge — Namen auswärtiger Redner — lesen nur Admin und Planer.',
    suchen:
      'create policy vortraege_zuteilen on public.vortraege\n  for all\n  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())\n',
    ersetzen: 'create policy vortraege_zuteilen on public.vortraege\n  for all\n  using (congregation_id = public.my_congregation_id())\n',
  },
  {
    id: 'mrp-vormerkungen-gemessen',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Die Mitgliedsrechte-Probe misst die Vormerkungen des Vortragsplans, (65)–(70).',
    suchen: '    await vortragProben(k, vortragAnlage({ marke, versammlung, tag0 }))\n',
    ersetzen: '',
  },
  {
    id: 'mrp-vormerkungen-aufraeumen',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Was die Probe in `vortraege` angelegt hat, räumt sie wieder weg.',
    suchen: "    ['die Vormerkungen der Vorträge', weg('vortraege')],\n",
    ersetzen: '',
  },

  // ── Treffpunkte planen (T121, Phase 5e) ───────────────────────────────────
  {
    id: 'fs-konflikt-je-tag',
    datei: 'src/data/fs.ts',
    regel: 'Ein Konflikt am Treffpunkt gilt an seinem Wochentag — wer am Samstag fehlt, leitet am Mittwoch trotzdem.',
    suchen: '    const eigene = conflicts.filter((c) => c.wd === inst.wd && c.kennung === kennung)\n',
    ersetzen: '    const eigene = conflicts.filter((c) => c.kennung === kennung)\n',
  },
  {
    id: 'fs-konflikt-abwesenheit-zuerst',
    datei: 'src/data/fs.ts',
    regel: 'Steht ein Leiter abwesend und doppelt da, nennt sein Platz die Abwesenheit.',
    suchen: "    return eigene.find((c) => c.kind === 'fsAbsent') ?? eigene[0]\n",
    ersetzen: '    return eigene[0]\n',
  },
  {
    id: 'fs-in-gruppe',
    datei: 'src/data/fs.ts',
    regel: 'Der Gruppenaufseher plant, leert und besetzt nur die Treffpunkte seiner Gruppe.',
    suchen: '  return onlyGroup === null || inst.grp === onlyGroup\n',
    ersetzen: '  return true\n',
  },
  {
    id: 'treffpunkt-gruppe-nur-ohne-zuteilen',
    datei: 'src/data/rechte.ts',
    regel: 'Wer zuteilt, plant die Treffpunkte aller Gruppen — auch wenn er zugleich eine Gruppe betreut.',
    suchen: '  return r.zuteilen ? null : r.gruppe\n',
    ersetzen: '  return r.gruppe\n',
  },
  {
    id: 'treffpunkt-freitext-ohne-stand',
    datei: 'src/planen/platz-anzeige.ts',
    regel: 'Ein Freitext-Leiter hat nichts zu bestätigen — sein Platz wartet nicht.',
    suchen: '    fsLeiterZuteilung(inst) ? stand(inst) : null,\n',
    ersetzen: '    stand(inst),\n',
  },
  {
    id: 'treffpunkt-konflikt-am-platz',
    datei: 'src/planen/FsPlan.tsx',
    regel: 'Wer abwesend oder doppelt eingeteilt ist, steht am Platz seines Treffpunkts rot da.',
    suchen: '{...leiterAnzeige(inst, zusage.treffpunkt, konfliktVon(inst), t)}',
    ersetzen: '{...leiterAnzeige(inst, zusage.treffpunkt, undefined, t)}',
  },
  {
    id: 'treffpunkt-anlegen-wer-plant',
    datei: 'src/planen/FsPlan.tsx',
    regel: 'Einen Treffpunkt für diese Woche legen Admin, Planer und Gruppenaufseher an.',
    suchen: '      {(rechte.zuteilen || rechte.gruppe !== null) && (\n',
    ersetzen: '      {(rechte.admin || rechte.gruppe !== null) && (\n',
  },
  {
    id: 'treffpunkt-gewaehlt-nach-kennung',
    datei: 'src/planen/planen-raster.ts',
    regel: 'Am Desktop ist genau der Treffpunkt hervorgehoben, der in der Spalte zugeteilt wird.',
    suchen: "sel.kind === 'fs' && ort.kind === 'fs' && sel.instId === ort.instId",
    ersetzen: "sel.kind === 'fs' && ort.kind === 'fs'",
  },
  {
    id: 'leiste-nur-bei-treffpunkten-der-woche',
    datei: 'src/planen/planen-raster.ts',
    regel: 'Besuche und Grundplan haben keine Woche — und keine Aktionsleiste.',
    suchen: "thema === 'predigtdienst' && aktiverFsBereich(state) === 'treffpunkte' ? 'treffpunkte' : null",
    ersetzen: "thema === 'predigtdienst' ? 'treffpunkte' : null",
  },
  {
    id: 'leiste-nur-mit-recht',
    datei: 'src/planen/planen-raster.ts',
    regel: 'Die Aktionsleiste hat nur, wer den Plan planen darf.',
    suchen: '  if (!darfPlanen(rechte, thema)) return null\n',
    ersetzen: '',
  },
  {
    id: 'spalte-treffpunkt-nur-beim-plan',
    datei: 'src/planen/planen-raster.ts',
    regel: 'Die Spalte zeigt einen Treffpunkt nur beim Plan der Treffpunkte.',
    suchen: "  return sel.kind === 'fs' ? art === 'treffpunkte' : art === 'zusammenkuenfte' && sel.tab === state.tab\n",
    ersetzen: "  return sel.kind === 'fs' ? true : art === 'zusammenkuenfte' && sel.tab === state.tab\n",
  },
  {
    id: 'treffpunkt-automatik-nur-eigene-gruppe',
    datei: 'src/planen/TreffpunkteAutomatikBlatt.tsx',
    regel: '„Automatisch" und „Leeren" wirken beim Gruppenaufseher nur auf seine Gruppe.',
    suchen: '  const onlyGroup = treffpunktGruppe(rechteVon(state))\n',
    ersetzen: '  const onlyGroup = null\n',
  },
  {
    id: 'senden-gruppe-zaehlt-nur-ihre',
    datei: 'src/planen/wochen-versand.ts',
    regel: 'Der Gruppenaufseher sieht beim Senden nur, was seine Gruppe betrifft — dieselbe Auswahl wie der Server.',
    suchen: '    return eigene ? alle.filter((o) => eigene.has(o.key)) : alle\n',
    ersetzen: '    return alle\n',
  },
  {
    id: 'senden-gruppe-zuletzt-eigene',
    datei: 'src/planen/wochen-versand.ts',
    regel: '„Zuletzt gesendet" meint beim Gruppenaufseher den Versand an seine Gruppe, nicht an die Woche.',
    suchen: '    return eigene ? zuletztGesendetFuer(state.sentLog, eigene) : zuletztGesendet(state.sentLog, week.start)\n',
    ersetzen: '    return zuletztGesendet(state.sentLog, week.start)\n',
  },
  {
    id: 'senden-zuletzt-genauer-schluessel',
    datei: 'src/data/plan-versand.ts',
    regel: 'Ein Aufgaben-Schlüssel ist kein Anfang eines anderen — der Versand an …|r10 ist keiner an …|r1.',
    suchen: "  const praefixe = [...taskKeys].map((k) => sentKey(k, ''))\n",
    ersetzen: '  const praefixe = [...taskKeys]\n',
  },
  {
    id: 'senden-gruppe-alle-satz',
    datei: 'src/planen/PlanSendenBlatt.tsx',
    regel: 'Hat der Gruppenaufseher alles gesendet, sagt der Satz es für seine Gruppe.',
    suchen: 'gruppe ? [t.fsSendenOffen, t.fsSendenAlle]',
    ersetzen: 'gruppe ? [t.fsSendenOffen, t.planSendenAlle]',
  },
  {
    id: 'senden-gruppe-nicht-auf-altem-stand',
    datei: 'src/planen/wochen-versand.ts',
    regel: 'Auch der Gruppenaufseher sendet nicht von der Momentaufnahme aus.',
    suchen: '  return gruppe !== null && !state.staleAt ? { gruppe } : null\n',
    ersetzen: '  return gruppe !== null ? { gruppe } : null\n',
  },
  {
    id: 'senden-gruppe-ohne-spur',
    datei: 'src/planen/PlanSendenBlatt.tsx',
    regel: 'Beim Gruppenaufseher steht im Blatt keine Spur der Zusammenkunft — sie betrifft ihn nicht.',
    suchen: '{!gruppe && <PlanSpur tab={mtab(state.tab)} />}',
    ersetzen: '{<PlanSpur tab={mtab(state.tab)} />}',
  },
  {
    id: 'aktueller-treffpunkt-gruppe',
    datei: 'src/planen/useAktuellerPlatz.ts',
    regel: 'Das Zuteilen zeigt beim Gruppenaufseher dieselbe Lage wie sein Plan — mit den Konflikten seiner Gruppe.',
    suchen: 'week.start, treffpunktGruppe(rechteVon(state)))',
    ersetzen: 'week.start)',
  },

  // ── Grundplan (T121, Phase 5e-2) ──────────────────────────────────────────
  {
    id: 'grundplan-nur-eigene-gruppe',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: 'Der Gruppenaufseher sieht im Grundplan nur die Regeln seiner Gruppe.',
    suchen: 'state.fsRules.filter((r) => onlyGroup === null || r.grp === onlyGroup)',
    ersetzen: 'state.fsRules.filter(() => true)',
  },
  {
    id: 'grundplan-geloeschte-gruppe-leer',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: 'Der Aufseher einer gelöschten Gruppe bekommt keinen Grundplan, in dem er für sie anlegen könnte.',
    suchen: '  if (onlyGroup !== null && !state.groups.some((g) => g.id === onlyGroup)) return null\n',
    ersetzen: '',
  },
  {
    id: 'grundplan-haeufigkeit-nur-wenn-selten',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: 'Wie oft eine Regel gilt, steht nur da, wo es nicht jede Woche ist.',
    suchen: '{regel.monthly > 0 && <span',
    ersetzen: '{<span',
  },
  {
    id: 'grundplan-ausser-nur-bei-gruppen',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: '„Außer bei Versammlungstreffpunkt" gibt es nur an einer Gruppenregel.',
    suchen: '      {regel.grp !== null && (\n        <AusserVersammlungFeld',
    ersetzen: '      {(\n        <AusserVersammlungFeld',
  },
  {
    id: 'grundplan-neu-ohne-ort-saal',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: 'Eine neue Regel ohne Ort nimmt den Saal dieser Versammlung.',
    suchen: "place: regel.place.trim() || state.congregation.hall",
    ersetzen: 'place: regel.place',
  },
  {
    id: 'grundplan-gruppe-wechselt-vorgabe',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: 'Mit der Gruppe einer neuen Regel wechselt die Vorgabe für „Außer bei Versammlungstreffpunkt".',
    suchen: 'setRegel((r) => ({ ...r, grp, skipCong: neueRegel(grp).skipCong }))',
    ersetzen: 'setRegel((r) => ({ ...r, grp }))',
  },
  {
    id: 'grundplan-aufseher-ohne-gruppenwahl',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: 'Der Gruppenaufseher legt im Grundplan in seiner Gruppe an — ohne Wahl.',
    suchen: '{anlegenIn === null && <GruppeFeld',
    ersetzen: '{<GruppeFeld',
  },
  {
    id: 'neue-regel-gruppe-ohne-versammlungstag',
    datei: 'src/data/fs.ts',
    regel: 'Eine neue Gruppenregel entfällt zunächst, wenn sich am selben Tag die Versammlung trifft.',
    suchen: "  return { grp, ...NEUER_TREFFPUNKT, place: '', monthly: 0, skipCong: grp !== null }\n",
    ersetzen: "  return { grp, ...NEUER_TREFFPUNKT, place: '', monthly: 0, skipCong: false }\n",
  },
  {
    id: 'programmpunkt-einfuegen-heisst-hinzufuegen',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Ein eigener Programmpunkt wird hinzugefügt, nicht „übernommen" (englisch hieße es „Take over").',
    suchen: '          {t.hinzufuegenKnopf}\n',
    ersetzen: '          {t.uebernehmen}\n',
  },
  // ── Gruppenbesuche von Hand (T121, Phase 5e-3) ────────────────────────────
  // Hier standen acht Einträge zu „Reihum verteilen" (Reihe, erster Samstag,
  // Abwesenheit, Wochenende, nächstgelegenes, Monate auslassen, Vorgabe des
  // Wochenendes, abgewählte Monate). Seit dem 13.10.2026 gibt es keine
  // Automatik mehr — nur den Vorschlag beim Anlegen.
  {
    id: 'gb-vorschlag-laengste-gruppe',
    datei: 'src/data/gruppenbesuche.ts',
    regel: 'Vorgeschlagen wird die Gruppe, die am längsten nicht dran war — noch nie besuchte zuerst.',
    suchen: "  const grp = groups.map((g) => g.id).sort((a, b) => (zuletzt.get(a) ?? '').localeCompare(zuletzt.get(b) ?? ''))[0]\n",
    ersetzen: '  const grp = groups.map((g) => g.id)[0]\n',
  },
  {
    id: 'gb-vorschlag-monat-danach',
    datei: 'src/data/gruppenbesuche.ts',
    regel: 'Vorgeschlagen wird die Woche einen Monat nach dem letzten Besuch.',
    suchen: '  const naechste = letzter ? gleichesWochenendeImNaechstenMonat(letzter.woche) : undefined\n',
    ersetzen: '  const naechste = letzter?.woche\n',
  },
  {
    id: 'gb-vorschlag-gleiches-wochenende',
    datei: 'src/data/gruppenbesuche.ts',
    regel: 'Einen Monat später heißt: dasselbe Wochenende im nächsten Monat, vom fünften das letzte.',
    suchen: '  return nr >= 0 && nr < 4 ? naechste[nr] : naechste.at(-1)\n',
    ersetzen: '  return naechste[0]\n',
  },
  {
    id: 'gb-vorschlag-nicht-vor-dieser-woche',
    datei: 'src/data/gruppenbesuche.ts',
    regel: 'Vorgeschlagen wird nie eine Woche vor dieser.',
    suchen: '    woche: naechste && naechste >= dieseWoche ? naechste : dieseWoche,\n',
    ersetzen: '    woche: naechste ?? dieseWoche,\n',
  },
  {
    id: 'gb-vorschlag-letzter-besucher',
    datei: 'src/data/gruppenbesuche.ts',
    regel: 'Vorgeschlagen wird der Besucher des letzten Besuchs, der einen hat.',
    suchen: '    pid: reihe.findLast((b) => b.pid !== null)?.pid ?? null,\n',
    ersetzen: '    pid: reihe.at(-1)?.pid ?? null,\n',
  },
  {
    id: 'gb-neu-besucher-nur-mit-recht',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Wer keine Treffpunkte mehr leiten darf, steht beim Anlegen nicht als Besucher da.',
    suchen: "  const [pid, setPid] = useState(kandidaten.some((p) => p.id === vorschlag.pid) ? (vorschlag.pid ?? '') : '')\n",
    ersetzen: "  const [pid, setPid] = useState(vorschlag.pid ?? '')\n",
  },
  {
    id: 'gb-neu-vorschau-ohne-offen',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Beim Anlegen steht nur, was auch danach nicht aufginge — ein freier Treffpunkt füllt sich, ein fehlender Besucher sperrt nur den Knopf.',
    suchen: "        (p) => p.art !== 'offen' && p.art !== 'besucher',\n",
    ersetzen: '        () => true,\n',
  },
  {
    id: 'gb-neu-vorschau',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Was auch nach dem Anlegen nicht aufginge, steht schon im Blatt — nicht erst an der Zeile.',
    suchen: '        <ProblemListe liste={hinweise} />\n',
    ersetzen: '',
  },
  {
    id: 'gb-neu-erst-mit-besucher',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Ohne Besucher und für eine Gruppe, die in der Woche schon besucht wird, legt „Hinzufügen" nichts an.',
    suchen: 'disabled={!pid || !grp || besucht(woche, grp)}',
    ersetzen: 'disabled={false}',
  },
  /* ---- Weitere Pläne planen (T121, Phase 5f, 13.10.2026) ---- */
  {
    id: 'wp-beginnen-gedrueckt-nichts',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Ein Tipp auf die gedrückte Gruppe bei „Beginnen mit" verteilt nicht neu — von Hand gesetzte Wochen bleiben.',
    suchen: "    if (grp && grp !== beginnt) dispatch({ type: 'wpGruppenVerteilen', planId: plan.id, abGruppe: grp })\n",
    ersetzen: "    if (grp) dispatch({ type: 'wpGruppenVerteilen', planId: plan.id, abGruppe: grp })\n",
  },
  {
    id: 'wp-beginnt-laufende',
    datei: 'src/data/weitere-plaene.ts',
    regel: '„Beginnen mit" zeigt die Gruppe der laufenden Woche oder des laufenden Monats, nicht die der ersten des Plans.',
    suchen: '  const erste = planSpannen(plan).find((s) => s >= spanneVon(taktVon(plan), tag))\n',
    ersetzen: '  const erste = planSpannen(plan)[0]\n',
  },
  {
    id: 'wp-takt-gedrueckt-nichts',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Ein Tipp auf den gedrückten Takt ändert den Plan nicht.',
    suchen: '            if (neu !== takt) aendern({ takt: neu })\n',
    ersetzen: '            aendern({ takt: neu })\n',
  },
  {
    id: 'wp-zeitraum-erst-uebernehmen',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Der Zeitraum gilt erst mit „Übernehmen" — unterwegs stünde er halb gesetzt da, und was aus ihm fiele, ginge mit.',
    suchen: '          onWahl={(von, bis) => setZeitraum({ von, bis })}\n',
    ersetzen: "          onWahl={(von, bis) => dispatch({ type: 'wpPlanAendern', id: plan.id, patch: { von, bis } })}\n",
  },
  {
    id: 'wp-zeitraum-unveraendert-nichts',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: '„Übernehmen" ohne Änderung schickt nichts.',
    suchen: '    if (zeitraum.von !== plan.von || zeitraum.bis !== plan.bis) {\n',
    ersetzen: '    if (true) {\n',
  },
  {
    id: 'wp-zeitraum-ende-getippt',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Der Kalender beginnt mit dem Ende, auf das man getippt hat — „Von" setzt den Anfang.',
    suchen: '          start={start}\n',
    ersetzen: '',
  },
  {
    id: 'wp-zeitraum-monat-des-endes',
    datei: 'src/bausteine/ZeitraumKalender.tsx',
    regel: 'Wer auf „Bis" tippt, sieht den Monat des Endes, nicht den des Anfangs.',
    suchen: "  const [monat, setMonat] = useState<Monat>(() => monatVon(start === 'bis' && bis ? bis : von))\n",
    ersetzen: '  const [monat, setMonat] = useState<Monat>(() => monatVon(von))\n',
  },
  {
    id: 'wp-vorschau-naechste-fuenf',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Die zugeklappte Vorschau zeigt die nächsten fünf ab der laufenden — Vergangenes erst mit „Alle anzeigen".',
    suchen: '  return kommende.length > 0 ? kommende.slice(0, VORSCHAU_SPANNEN) : [...spannen]\n',
    ersetzen: '  return [...spannen]\n',
  },
  {
    id: 'wp-vorschau-vorbei-alle',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Ist ein Plan vorbei, zeigt die Vorschau alle Wochen — sonst bliebe sie leer.',
    suchen: '  return kommende.length > 0 ? kommende.slice(0, VORSCHAU_SPANNEN) : [...spannen]\n',
    ersetzen: '  return kommende.slice(0, VORSCHAU_SPANNEN)\n',
  },
  {
    id: 'wp-abgeschlossen-nichts-mehr',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Ein abgeschlossener Plan ist gewesen: kein „Beginnen mit", kein Veröffentlichen, kein Hinweis, wer ihn sieht.',
    suchen: "  const laeuft = stand !== 'abgeschlossen'\n",
    ersetzen: '  const laeuft = true\n',
  },
  {
    id: 'wp-veroeffentlichen-handy-leiste',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Am Handy steht „Veröffentlichen" unten in der Leiste — nicht auch noch neben dem Titel.',
    suchen: '          {breit && veroeffentlichen}\n',
    ersetzen: '          {veroeffentlichen}\n',
  },
  {
    id: 'wp-unterzeile-ab-bis',
    datei: 'src/components/weitere-plaene-anzeige.ts',
    regel: 'In der Liste heißt ein Plan, der erst kommt, „ab …", ein laufender „bis …".',
    suchen: '  return plan.von > tag\n',
    ersetzen: '  return false\n',
  },
  {
    id: 'wp-spur-nie-veroeffentlicht',
    datei: 'src/planen/plan-spur.ts',
    regel: 'Ein Plan, der als Entwurf ablief, war nie veröffentlicht — der mittlere Schritt seiner Spur bleibt leer.',
    suchen: "        : ['voll', plan.entwurf ? 'leer' : 'voll', 'voll']\n",
    ersetzen: "        : ['voll', 'voll', 'voll']\n",
  },
  /* ---- Zusagen der Woche (T121, Phase 5g, 13.10.2026) ---- */
  {
    id: 'zusagen-lage-wie-im-plan',
    datei: 'src/data/zusagen.ts',
    regel: 'Ein Platz steht in den Zusagen in derselben Lage wie im Plan — wer abwesend ist, ist ein Problem, auch mit Zusage.',
    suchen: '    const lage = lageVon(slot, zusageStatus(confirmations, key), konflikt !== undefined)\n',
    ersetzen: '    const lage = lageVon(slot, zusageStatus(confirmations, key), false)\n',
  },
  {
    id: 'zusagen-ohne-vergangenes',
    datei: 'src/data/zusagen.ts',
    regel: 'Was vorbei ist, fehlt in den Zusagen — danach zählt keine Zusage mehr.',
    suchen: '    if (vorbei.has(tab)) return\n',
    ersetzen: '',
  },
  {
    id: 'zusagen-gesendet-aus-tagebuch',
    datei: 'src/data/zusagen.ts',
    regel: 'Wann die Nachricht hinausging, kommt aus dem Versand-Tagebuch.',
    suchen: '      gesendet: sentLog[tagebuch] ?? null,\n',
    ersetzen: '      gesendet: null,\n',
  },
  {
    id: 'zusagen-hilfsdienst-ersatz',
    datei: 'src/data/zusagen.ts',
    regel: 'Ein abgesagter Hilfsdienst heißt in den Zusagen „Ersatz gesucht" — dort sucht die App selbst.',
    suchen: "      hilfsdienst: platz.art === 'helper',\n",
    ersetzen: '      hilfsdienst: false,\n',
  },
  {
    id: 'zusagen-zahlen-ohne-vergangenes',
    datei: 'src/planen/plan-spur.ts',
    regel: 'Die Spur der Zusagen zählt, was die Liste zeigt: ohne die Zusammenkunft, die vorbei ist.',
    suchen: '    if (istAusgefallen(week, tab) || vorbei.has(tab)) continue\n',
    ersetzen: '    if (istAusgefallen(week, tab)) continue\n',
  },
  {
    id: 'zusagen-nur-wer-zuteilt',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'Die Zusagen der Woche sieht nur, wer zuteilt — der Gruppenaufseher plant die Treffpunkte.',
    suchen: "  if (state.tab === 'zusagen' && rechte.zuteilen) return <ZusagenAnsicht",
    ersetzen: "  if (state.tab === 'zusagen') return <ZusagenAnsicht",
  },
  {
    id: 'zusagen-zurueck-in-den-plan',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'Zurück schließt zuerst die Zusagen der Woche — in den Plan, nicht gleich zu Start.',
    suchen: '  return (tab === \'edit\' || tab === \'zusagen\') && rechte.zuteilen\n',
    ersetzen: '  return tab === \'edit\' && rechte.zuteilen\n',
  },
  {
    id: 'spur-zusagen-weg',
    datei: 'src/planen/WochenStand.tsx',
    regel: 'Der Schritt „Zusagen" der Spur führt zu den Zusagen der Woche.',
    suchen: 'spurDerWoche(zahlen, t, { zusagen: zuDenZusagen })',
    ersetzen: 'spurDerWoche(zahlen, t)',
  },
  {
    id: 'zusagen-namen-einmal',
    datei: 'src/planen/ZusagenAnsicht.tsx',
    regel: 'Wer zwei Aufgaben zugesagt hat, steht unter „Zugesagt" einmal.',
    suchen: 'namenSatz([...new Set(plaetze.map((p) => p.slot.name))], lang)',
    ersetzen: 'namenSatz(plaetze.map((p) => p.slot.name), lang)',
  },
  /* ---- Noch nicht angemeldet (T121, Phase 5g-2, 13.10.2026) ---- */
  // Der Haken „weiß Bescheid" zählt wie eine Zusage (entschieden am 14.10.2026).
  {
    id: 'bescheid-zaehlt-wie-zusage',
    datei: 'src/data/saal.ts',
    regel: 'Der Haken „weiß Bescheid" zählt im Schritt „Zusagen" der Spur wie eine Zusage — sonst würde er nie fertig.',
    suchen: "    const bescheid = zusage === 'offen' && persoenlich[sentKey(key, platz.slot?.name ?? '')] != null\n",
    ersetzen: '    const bescheid = false\n',
  },
  {
    id: 'bescheid-absage-schlaegt-haken',
    datei: 'src/data/saal.ts',
    regel: 'Eine Absage schlägt den Haken — sie ist ein Problem, keine Zusage.',
    suchen: "    const bescheid = zusage === 'offen' && persoenlich[sentKey(key, platz.slot?.name ?? '')] != null\n",
    ersetzen: "    const bescheid = persoenlich[sentKey(key, platz.slot?.name ?? '')] != null\n",
  },
  {
    id: 'bescheid-in-den-zusagen-der-woche',
    datei: 'src/planen/ZusagenAnsicht.tsx',
    regel: 'Die Spur der Zusagen der Woche zählt den Haken mit.',
    suchen: 'zahlenDerWoche(rawWeek, fsWeek, { services, confirmations, persoenlich, sentLog, zeiten }, fromIso(tag))',
    ersetzen: 'zahlenDerWoche(rawWeek, fsWeek, { services, confirmations, persoenlich: {}, sentLog, zeiten }, fromIso(tag))',
  },
  {
    id: 'bescheid-in-der-spur-des-plans',
    datei: 'src/planen/WochenStand.tsx',
    regel: 'Auch die Spur über dem Plan zählt den Haken mit.',
    suchen: 'wochenZahlen(week, fsWeek, tab, { services, confirmations, persoenlich, sentLog, zeiten }, fromIso(tag))',
    ersetzen: 'wochenZahlen(week, fsWeek, tab, { services, confirmations, persoenlich: {}, sentLog, zeiten }, fromIso(tag))',
  },
  {
    id: 'bescheid-nicht-unerreichbar',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Wem der Planer persönlich Bescheid gegeben hat, der steht nicht in der Meldung „nicht erreichbar".',
    suchen: ' && !bescheid.has(tagebuchSchluessel(entry.key, pend.name))',
    ersetzen: '',
  },
  {
    id: 'bescheid-nur-abgehakte-zeilen',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Gelesen werden nur die abgehakten Zeilen des Versand-Tagebuchs.',
    suchen: '&persoenlich_at=not.is.null`',
    ersetzen: '`',
  },
  {
    id: 'zusagen-ohne-konto-aus-tagebuch',
    datei: 'src/data/zusagen.ts',
    regel: 'Wer ohne Konto im Versand-Tagebuch steht, ist in den Zusagen als solcher erkannt — samt Haken.',
    suchen: '      ...(tagebuch in persoenlich ? { ohneKonto: { bescheid: persoenlich[tagebuch] ?? null } } : {}),\n',
    ersetzen: '',
  },
  {
    id: 'zusagen-ohne-konto-wartet-nicht',
    datei: 'src/planen/ZusagenAnsicht.tsx',
    regel: 'Wer kein Konto hat, steht nicht unter „Warten auf Zusage" — ihn erreicht keine Nachricht.',
    suchen: "  const warten = plaetze.filter((p) => p.lage === 'wartet' && !p.ohneKonto)\n",
    ersetzen: "  const warten = plaetze.filter((p) => p.lage === 'wartet')\n",
  },
  {
    id: 'persoenlich-nur-ohne-konto',
    datei: 'src/app/reducer.ts',
    regel: 'Abhaken geht nur an einer Zeile ohne Konto — wie in der Datenbank.',
    suchen: '      if (!(schluessel in state.persoenlich)) return state\n',
    ersetzen: '',
  },
  {
    id: 'persoenlich-wird-gespeichert',
    datei: 'src/app/persist.ts',
    regel: 'Ein Haken an „Noch nicht angemeldet" geht an die Datenbank (`persoenlich_bescheid`).',
    suchen: '      if (next.persoenlich !== prev.persoenlich) persoenlichBescheid(action.key, action.name, action.ja)\n',
    ersetzen: '',
  },
  {
    id: 'persoenlich-haken-geht-weg',
    datei: 'src/app/reducer.ts',
    regel: 'Einen Haken nimmt man auch wieder weg — dann steht die Zeile wieder offen.',
    suchen: '      const wann = action.ja ? new Date().toISOString() : null\n',
    ersetzen: '      const wann = new Date().toISOString()\n',
  },
  {
    id: 'zusagen-haken-zeigt-bescheid',
    datei: 'src/planen/ZusagenAnsicht.tsx',
    regel: 'Wem es schon jemand gesagt hat, der steht unter „Noch nicht angemeldet" abgehakt da.',
    suchen: '        checked={platz.ohneKonto?.bescheid != null}\n',
    ersetzen: '        checked={false}\n',
  },
  /* ---- Jetzt erinnern (T121, Phase 5g-3, 13.10.2026) ---- */
  {
    id: 'erinnern-nur-gemeldet',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Erinnert wird nur, wer von seinem Platz schon weiß — zuerst kommt „Plan senden".',
    suchen: '    if (!woche.schonGemeldet.has(tagebuchSchluessel(p.key, p.name))) return false\n',
    ersetzen: '',
  },
  {
    id: 'erinnern-einmal-am-tag',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Je Person und Tag höchstens eine Erinnerung — wer heute schon eine hatte, bleibt aus.',
    suchen: '    if (uid && schonErinnert.has(uid)) {\n',
    ersetzen: '    if (false) {\n',
  },
  {
    id: 'erinnern-sperre-schreiben',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Wer von Hand erinnert wurde, steht in der Sperre — der tägliche Lauf schickt heute keine zweite.',
    suchen:
      "    nachrichten.map((n) => ({ congregation_id: cong, user_id: n.empfaenger.userId, kind: 'self', sent_on: heute })),\n",
    ersetzen: '    [],\n',
  },
  {
    id: 'erinnern-kein-aufseher',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Aus den Zusagen der Woche erinnert, wer zuteilt — kein Gruppenaufseher.',
    suchen: "(payload.action === 'erinnern' || aufseherVon.size === 0)",
    ersetzen: '(aufseherVon.size === 0)',
  },
  {
    id: 'erinnern-ohne-treffpunkte',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Jetzt erinnern meint die Zusammenkünfte, die die Zusagen der Woche zeigen — keine Treffpunkte.',
    suchen: '  const offen = offeneDerWoche(weekStart, woche.week, [], woche.services',
    ersetzen: '  const offen = offeneDerWoche(weekStart, woche.week, woche.fsInsts, woche.services',
  },
  {
    id: 'erinnern-als-erinnerung',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Eine Erinnerung von Hand steht in der Glocke wie die des täglichen Laufs.',
    suchen: "    type: n.art === 'erinnerung' ? 'erinnerung' : 'zuteilung',\n",
    ersetzen: "    type: 'zuteilung',\n",
  },
  {
    id: 'naechste-erinnerung-nach-dem-lauf',
    datei: 'src/data/zusagen.ts',
    regel: 'Ist der tägliche Lauf heute schon vorbei, kommt die nächste Erinnerung frühestens morgen.',
    suchen: '  const ab = jetzt.getTime() < heute + ERINNERUNG_STUNDE_UTC * 36e5 ? heute : heute + 864e5\n',
    ersetzen: '  const ab = heute\n',
  },
  {
    id: 'erinnerung-stunde-wie-cron',
    datei: 'supabase/functions/_shared/erinnerung.ts',
    regel: 'Die App rechnet mit der Stunde, zu der der tägliche Lauf startet (`cron-reminders.sql`).',
    suchen: 'export const ERINNERUNG_STUNDE_UTC = 8\n',
    ersetzen: 'export const ERINNERUNG_STUNDE_UTC = 9\n',
  },
  {
    id: 'erinnern-knopf-nur-gesendet',
    datei: 'src/planen/ZusagenAnsicht.tsx',
    regel: '„Jetzt erinnern" steht erst da, wenn einer der Wartenden die Nachricht schon hat.',
    suchen: '  const kannErinnern = warten.some((p) => p.gesendet !== null)\n',
    ersetzen: '  const kannErinnern = true\n',
  },
  {
    id: 'erinnern-schon-heute-hinweis',
    datei: 'src/planen/wochen-versand.ts',
    regel: 'Hatten alle heute schon eine Erinnerung, sagt der Hinweis genau das.',
    suchen: '  return res.schonHeute > 0 ? t.toastSchonErinnert : t.toastNiemandZuErinnern\n',
    ersetzen: '  return t.toastNiemandZuErinnern\n',
  },

  /* ---- T121 Phase 6a: Personenliste und „Person anlegen" ---- */
  {
    id: 'personen-konto-schlaegt-link',
    datei: 'src/personen/person-lage.ts',
    regel: 'Angemeldet ist, wer ein verknüpftes Konto hat — auch wenn sein Link noch gilt.',
    suchen: "        stand: konten.length > 0 ? 'angemeldet' : mitLink.has(person.id) ? 'link' : 'ohne',",
    ersetzen: "        stand: mitLink.has(person.id) ? 'link' : konten.length > 0 ? 'angemeldet' : 'ohne',",
  },
  {
    id: 'personen-heute-abwesend',
    datei: 'src/personen/person-lage.ts',
    regel: 'Die Liste weiß, wer heute abwesend ist — die Auswahl „Abwesend" und der Zeitraum in der Zeile hängen daran.',
    suchen: '        abwesenheit: abwesenheitAm(quelle.absences, person.id, tag),',
    ersetzen: '        abwesenheit: undefined,',
  },
  {
    id: 'personen-nicht-angemeldet-mit-eingeladenen',
    datei: 'src/personen/person-filter.ts',
    regel: '„Noch nicht angemeldet" zeigt die Eingeladenen mit — nicht nur, wer noch keinen Code hat.',
    suchen: "      return lage.stand !== 'angemeldet'",
    ersetzen: "      return lage.stand === 'ohne'",
  },
  {
    id: 'personen-auswahl-zaehlt-unter-suche',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Die Zahlen der Auswahl zählen unter Suche und Filter — was diese ausschließen, zählt nicht mit.',
    suchen: '  const zahl = (auswahl: Auswahl) => basis.filter((e) => passtZurAuswahl(auswahl, e.lage)).length',
    ersetzen: '  const zahl = (auswahl: Auswahl) => eintraege.filter((e) => passtZurAuswahl(auswahl, e.lage)).length',
  },
  {
    id: 'personen-einladen-nur-ohne-einladung',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: '„Alle einladen" steht nur in der Auswahl „Nicht eingeladen" — „alle" sind dort genau die.',
    suchen: "      {angemeldet && filter.auswahl === 'ohne' && sichtbar.length > 0 && (",
    ersetzen: '      {angemeldet && sichtbar.length > 0 && (',
  },
  {
    id: 'personen-links-was-die-liste-zeigt',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: '„Links senden" geht genau an die, die die Liste zeigt — die Suche grenzt mit ein.',
    suchen: '          personen={sichtbar.map((e) => e.person)}',
    ersetzen: "          personen={eintraege.filter((e) => e.lage.stand === 'ohne').map((e) => e.person)}",
  },
  {
    id: 'personen-angemeldet-mit-rolle',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Wer angemeldet ist, steht mit seiner Rolle da; den Stand nennt die Zeile nur bei allen anderen.',
    suchen: "            [gruppenName, standWort && lage.stand !== 'angemeldet' ? standWort : t[ROLE_KEY[person.role]]]",
    ersetzen: '            [gruppenName, standWort ? standWort : t[ROLE_KEY[person.role]]]',
  },
  {
    id: 'personen-abwesend-als-problem',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Wer heute fehlt, steht in der Farbe der Probleme da.',
    suchen: "        <span className={abwesend ? 'klein-text is-problem' : 'klein-text'}>",
    ersetzen: "        <span className={'klein-text'}>",
  },
  {
    id: 'person-anlegen-keine-dublette',
    datei: 'src/personen/PersonAnlegenBlatt.tsx',
    regel: 'Ein Name, den es schon gibt, lässt sich nicht anlegen (T110).',
    suchen: "  const bereit = (name.fn !== '' || name.ln !== '') && dublette === undefined",
    ersetzen: "  const bereit = name.fn !== '' || name.ln !== ''",
  },
  {
    id: 'person-anlegen-namen-getrimmt',
    datei: 'src/personen/PersonAnlegenBlatt.tsx',
    regel: 'Leerzeichen um den Namen zählen nicht — weder als Name noch beim Speichern.',
    suchen: "  const name = { id: '', fn: fn.trim(), ln: ln.trim() }",
    ersetzen: "  const name = { id: '', fn, ln }",
  },

  /* ---- T121 Phase 6b: die Person ---- */
  {
    id: 'person-name-erst-beim-schliessen',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: 'Tippen im Namen schreibt nichts — der Name gilt erst beim Schließen des Blatts.',
    suchen: '        onChange={(e) => setzen(e.target.value)}',
    ersetzen: '        onChange={(e) => { setzen(e.target.value); update({ fn: e.target.value }) }}',
  },
  {
    id: 'person-name-doppelt-bleibt-draussen',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: 'Ein doppelter Name wird beim Schließen nicht übernommen — der alte bleibt, ein Hinweis sagt warum (T110).',
    suchen: "      if (dublette) dispatch({ type: 'showToast', text: fill(t.toastNameNichtGeaendert, { name: personLabel(dublette) }) })",
    ersetzen: "      if (false) dispatch({ type: 'showToast', text: fill(t.toastNameNichtGeaendert, { name: personLabel(dublette) }) })",
  },
  {
    id: 'person-name-leer-bleibt-draussen',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: 'Ein leerer Name wird nicht übernommen — die Person bleibt, wie sie war.',
    suchen: "      else if (leer) dispatch({ type: 'showToast', text: t.toastNameLeer })",
    ersetzen: "      else if (false) dispatch({ type: 'showToast', text: t.toastNameLeer })",
  },
  {
    id: 'person-chips-nur-gesetzte',
    datei: 'src/personen/bereiche.ts',
    regel: 'Als Chips stehen nur die Bereiche, die die Person hat.',
    suchen: '    .map((g) => ({ ...g, bereiche: g.bereiche.filter((b) => privWert(person.priv, b.key)) }))',
    ersetzen: '    .map((g) => g)',
  },
  {
    id: 'person-predigtdienst-eigene-gruppe',
    datei: 'src/personen/bereiche.ts',
    regel: 'Treffpunkte und Trolley stehen beim Predigtdienst, nicht bei den Zusammenkünften — jeder Bereich genau einmal.',
    suchen: '      bereiche: fest(QUALIFICATION_ORDER.filter((k) => !PREDIGTDIENST.has(k))).sort(nachLabel),',
    ersetzen: '      bereiche: fest(QUALIFICATION_ORDER).sort(nachLabel),',
  },
  {
    id: 'konto-spur-link',
    datei: 'src/personen/KontoCard.tsx',
    regel: 'Ein gültiger Link macht den Schritt „Link gesendet" voll — als Nächstes steht das Anmelden.',
    suchen: "lage: member || offen ? 'voll' : 'jetzt' },",
    ersetzen: "lage: member ? 'voll' : 'jetzt' },",
  },
  {
    id: 'auslastung-bis-zur-laufenden-woche',
    datei: 'src/data/auslastung.ts',
    regel: 'Die Auslastung bei der Person blickt zurück: die Wochen bis einschließlich der laufenden.',
    suchen: '    const woche = nachStart.get(montagNach(montag, i - anzahl + 1))',
    ersetzen: '    const woche = nachStart.get(montagNach(montag, i))',
  },
  {
    id: 'abwesenheiten-nur-der-person',
    datei: 'src/components/abwesenheiten.ts',
    regel: 'Bei einer Person stehen ihre Abwesenheiten — nicht die anderer.',
    suchen: '    absences.filter((a) => a.personId === personId),',
    ersetzen: '    absences,',
  },
  {
    id: 'abwesenheit-auf-die-gezeigte-person',
    datei: 'src/components/AbwesenheitenKarte.tsx',
    regel: 'Bei einer Person trägt „Abwesenheit eintragen" auf sie ein, nicht auf den Angemeldeten.',
    suchen: '  const personId = person ? person.id : state.personId',
    ersetzen: '  const personId = state.personId',
  },
  /* ---- Einstellungen: Übersicht (T121, Phase 6c-1, 14.10.2026) ---- */
  {
    id: 'zusammenkunft-schreibt-beide-zeiten',
    datei: 'src/einstellungen/ZusammenkunftBlatt.tsx',
    regel: 'Ein neuer Wochentag der Wochenmitte schreibt das Wochenende unverändert mit — beide stehen in einem Feld.',
    suchen: 'patch: { times: { ...zeiten, [welche]: { ...zeit, ...patch } } }',
    ersetzen: 'patch: { times: { [welche]: { ...zeit, ...patch } } }',
  },
  {
    id: 'saal-blatt-schreibt-die-anschrift',
    datei: 'src/einstellungen/EinstellungenScreen.tsx',
    regel: 'Das Blatt des Königreichssaals schreibt dessen Anschrift, nicht den Namen der Versammlung.',
    suchen: "const feld = blatt === 'saal' ? 'hall' : 'name'",
    ersetzen: "const feld = 'name'",
  },
  {
    id: 'versammlungs-text-eigene-richtung',
    datei: 'src/einstellungen/TextBlatt.tsx',
    regel: 'Name und Anschrift der Versammlung stehen im Feld in ihrer eigenen Schreibrichtung.',
    suchen: '          dir="auto"\n',
    ersetzen: '',
  },
  {
    id: 'einstell-wert-eigene-richtung',
    datei: 'src/einstellungen/EinstellZeile.tsx',
    regel: 'Ein Wert der Versammlung steht auch in seiner Zeile in der eigenen Schreibrichtung.',
    suchen: "dir={eigen ? 'auto' : undefined}",
    ersetzen: 'dir={undefined}',
  },
  {
    id: 'programmsprachen-versammlung-zuerst',
    // Seit Phase 10 eine Stelle für die Einstellungen und das Blatt „Programm holen".
    datei: 'src/i18n/langnames.ts',
    regel: 'Bei den Programmsprachen steht die Sprache der Versammlung vor den weiteren.',
    suchen: 'return [congLang, ...progLangs].map(',
    ersetzen: 'return [...progLangs, congLang].map(',
  },
  {
    id: 'sprache-hinzu-im-anderen-modus',
    datei: 'src/einstellungen/SprachenInhalt.tsx',
    regel: '„Sprache hinzufügen" öffnet das Sprachen-Blatt für eine weitere Sprache — sonst überschriebe es die der Versammlung.',
    suchen: "dispatch({ type: 'openLangSheet', mode: 'alt' })",
    ersetzen: "dispatch({ type: 'openLangSheet' })",
  },
  {
    id: 'wer-plant-auch-die-planer',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: '„Wer plant" nennt nicht nur die Admins, sondern auch alle, die planen dürfen.',
    suchen: '      return rechte.admin || rechte.planer\n',
    ersetzen: '      return rechte.admin\n',
  },
  {
    id: 'erinnerung-tage-aus-intl',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Die Tage der Erinnerung stehen in Worten mit der Mehrzahl ihrer Sprache — „1 Tag", „7 Tage".',
    suchen: "fill(t.remVorher, { dauer: zeitspanne(tage, 'day', lang) })",
    ersetzen: 'fill(t.remVorher, { dauer: String(tage) })',
  },
  {
    id: 'erinnerung-null-heisst-am-tag',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Null Tage vorher heißt „am Tag", nicht „0 Tage vorher".',
    suchen: 'return tage === 0 ? t.remAmTagKurz : ',
    ersetzen: 'return tage < 0 ? t.remAmTagKurz : ',
  },
  {
    id: 'einstellungen-desktop-zeigt-den-gewaehlten',
    datei: 'src/einstellungen/EinstellungenScreen.tsx',
    regel: 'Am Desktop ist der gewählte Abschnitt links als aktuell markiert.',
    suchen: "aria-current={abschnitt === gewaehlt ? 'true' : undefined}",
    ersetzen: 'aria-current={undefined}',
  },
  {
    id: 'einstellungen-zurueck-schliesst-unteransicht',
    datei: 'src/einstellungen/EinstellungenScreen.tsx',
    regel: 'Zurück am Handy schließt zuerst die Unteransicht der Einstellungen, erst dann den Bildschirm.',
    suchen: "  useBackDismiss(offen !== null, () => setOffen(null), 'unteransicht')\n",
    ersetzen: '',
  },
  /* ---- Einstellungen: Hilfsdienste (T121, Phase 6c-2, 14.10.2026) ---- */
  {
    id: 'dienst-verschieben-am-rand-bleibt',
    datei: 'src/data/dienste.ts',
    regel: 'Ein Dienst am Rand lässt sich nicht weiter schieben — die Liste bleibt, wie sie ist.',
    suchen: 'if (von < 0 || nach < 0 || nach >= services.length) return services',
    ersetzen: 'if (von < 0) return services',
  },
  {
    id: 'dienst-verschieben-speichert-positionen',
    datei: 'src/app/persist.ts',
    regel: 'Nach dem Verschieben bekommen beide Dienste ihre neue Position in der Datenbank — sonst stünde nach dem Laden die alte Folge da.',
    suchen:
      '// Zwei Dienste tauschen die Plätze — beide bekommen ihre neue Position.\n      geaenderteSchreiben(prev.services, next.services, (svc, pos) => saveService(congId, svc, pos))',
    ersetzen: '// Zwei Dienste tauschen die Plätze — beide bekommen ihre neue Position.',
  },
  {
    id: 'hilfsdienst-niemand-hervorgehoben',
    datei: 'src/einstellungen/HilfsdiensteInhalt.tsx',
    regel: 'Darf niemand einen Dienst übernehmen, hebt sich die Zahl ab — sein Platz bliebe sonst still offen (T79).',
    suchen: "className={anzahl === 0 ? 'klein-text hd-niemand' : 'klein-text'}",
    ersetzen: "className={'klein-text'}",
  },
  {
    id: 'hilfsdienst-gruppen-dienst-zaehlt-nicht',
    datei: 'src/einstellungen/HilfsdiensteInhalt.tsx',
    regel: 'Ein Gruppen-Dienst (Reinigung) braucht niemanden — er nennt die Rotation und hebt sich nie ab.',
    suchen: 'const anzahl = service.groups ? null : freigegeben(service)',
    ersetzen: 'const anzahl = freigegeben(service)',
  },
  {
    id: 'hilfsdienst-neu-oeffnet-sein-blatt',
    datei: 'src/einstellungen/HilfsdienstNeuBlatt.tsx',
    regel: 'Nach „Hilfsdienst hinzufügen" öffnet sich sein Blatt — dort steht, wer ihn übernehmen darf (T79).',
    suchen: "    dispatch({ type: 'openServiceSheet', key })\n",
    ersetzen: '',
  },
  {
    id: 'hilfsdienst-neu-braucht-namen',
    datei: 'src/einstellungen/HilfsdienstNeuBlatt.tsx',
    regel: 'Ohne Namen entsteht kein Hilfsdienst — der Knopf geht erst mit einem.',
    suchen: "const bereit = name.trim() !== ''",
    ersetzen: 'const bereit = true',
  },
  {
    id: 'hilfsdienst-oben-gesperrt',
    datei: 'src/einstellungen/HilfsdienstBlatt.tsx',
    regel: 'Der erste Dienst lässt sich nicht weiter nach oben schieben — der Knopf ist gesperrt.',
    suchen: 'gesperrt={position <= 0}',
    ersetzen: 'gesperrt={false}',
  },
  /* ---- Einstellungen: Gruppen (T121, Phase 6c-3, 14.10.2026) ---- */
  {
    id: 'gruppen-name-erst-beim-schliessen',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Tippen im Namen einer Gruppe schreibt nichts — der Name gilt erst beim Schließen.',
    suchen: 'onChange={(e) => setName(e.target.value)}',
    ersetzen: 'onChange={(e) => { setName(e.target.value); update({ name: e.target.value }) }}',
  },
  {
    id: 'gruppen-name-leer-bleibt-alt',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Ein leerer Gruppenname wird nicht übernommen — der alte bleibt, ein Hinweis sagt warum.',
    suchen: "  const fehler = leer ? t.toastNameLeer : dublette",
    ersetzen: "  const fehler = dublette",
  },
  {
    id: 'gruppen-name-doppelt-bleibt-alt',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Ein doppelter Gruppenname wird nicht übernommen — die geplante Reinigung kennt die Gruppe nur beim Namen.',
    suchen: "      if (fehler) dispatch({ type: 'showToast', text: fehler })\n      else update({ name: neu })",
    ersetzen: '      update({ name: neu })',
  },
  {
    id: 'gruppen-dublette-auch-uebersetzt',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Doppelt ist ein Gruppenname auch in der Schreibweise des Lesers („Group 2" neben „Gruppe 2").',
    suchen: '(schluessel(x.name) === gesucht || schluessel(lesen(x.name)) === gesucht)',
    ersetzen: '(schluessel(x.name) === gesucht)',
  },
  {
    id: 'gruppen-name-zieht-durch-reinigung',
    datei: 'src/app/reducer.ts',
    regel: 'Ein neuer Gruppenname zieht durch die geplante Reinigung — sie kennt die Gruppe nur beim Namen.',
    suchen: '            ? gruppeInWochenUmbenennen(state.weeks, state.services, vorher.name, neuerName)\n',
    ersetzen: '            ? state.weeks\n',
  },
  {
    id: 'gruppen-umbenennen-nur-gruppen-dienste',
    datei: 'src/data/dienste.ts',
    regel: 'Umbenannt wird nur an den Plätzen der Gruppen-Dienste, nicht in einem Dienst für Personen.',
    suchen: '  const keys = services.filter((s) => s.groups).map((s) => s.key)',
    ersetzen: '  const keys = services.map((s) => s.key)',
  },
  {
    id: 'hilfsdienst-suche-wie-personenliste',
    datei: 'src/einstellungen/HilfsdienstBlatt.tsx',
    regel: 'Die Suche im Blatt eines Dienstes findet wie die Personenliste auch „Vorname Nachname".',
    suchen: 'personen.filter((p) => passtOhneAuswahl(p, { ...KEIN_FILTER, q: suche }))',
    ersetzen: "personen.filter((p) => listName(p).toLowerCase().includes(suche.trim().toLowerCase()))",
  },
  {
    id: 'gruppen-name-unberuehrt-bleibt-kanonisch',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Wer den Namen nicht anfasst, lässt den gespeicherten stehen — „Gruppe 1" bleibt übersetzbar.',
    suchen: '    if (neu !== gelesen) {',
    ersetzen: '    if (neu === neu) {',
  },
  // Seit dem 14.10.2026 steht die Wahl an einer Stelle (`amtKandidaten`).
  {
    id: 'gruppen-aufseher-aelteste-und-dag',
    datei: 'src/data/helpers.ts',
    regel: 'Als Aufseher einer Gruppe stehen nur Älteste und Dienstamtgehilfen zur Wahl.',
    suchen: "  overseerId: (p) => p.role === 'aeltester' || p.role === 'dienstamtgehilfe',\n",
    ersetzen: '  overseerId: () => true,\n',
  },
  {
    id: 'gruppen-gehilfe-keine-schwester',
    datei: 'src/data/helpers.ts',
    regel: 'Als Gehilfe einer Gruppe steht jeder Bruder zur Wahl, keine Schwester.',
    suchen: "  assistantId: (p) => !p.female && p.role !== 'keine',\n",
    ersetzen: "  assistantId: (p) => p.role !== 'keine',\n",
  },
  {
    id: 'gruppen-gehilfe-nicht-keine',
    datei: 'src/data/helpers.ts',
    regel: 'Gehilfe wird kein Bruder mit der Rolle „Keine" — inaktive Schüler sind keine Verkündiger.',
    suchen: "  assistantId: (p) => !p.female && p.role !== 'keine',\n",
    ersetzen: '  assistantId: (p) => !p.female,\n',
  },
  // ── Eine Gruppe je Person (Betreiber, 14.10.2026) ────────────────────────
  // „Man leitet auch keine Gruppe, in der man nicht ist." Die Rechte fragen
  // nach *der* geleiteten Gruppe (`overseerGroup`); stimmt die Regel nicht,
  // plant ein Aufseher zweier Gruppen nur die erste.
  {
    id: 'gruppen-amt-nur-mitglieder',
    datei: 'src/data/helpers.ts',
    regel: 'Aufseher und Gehilfe stehen nur aus den Mitgliedern der Gruppe zur Wahl — niemand leitet zwei Gruppen.',
    suchen: '(p.grp === gruppe.id && AMT_MOEGLICH[amt](p))',
    ersetzen: 'AMT_MOEGLICH[amt](p)',
  },
  {
    id: 'gruppen-amt-inhaber-sichtbar',
    datei: 'src/data/helpers.ts',
    regel: 'Wer das Amt hat, bleibt im Feld stehen, auch wenn er nicht mehr passt — sonst zeigte es „—", während er die Gruppe plant.',
    suchen: 'persons.filter((p) => p.id === gruppe[amt] || (',
    ersetzen: 'persons.filter((p) => (',
  },
  {
    id: 'gruppen-amt-niemand-beides',
    datei: 'src/data/helpers.ts',
    regel: 'Niemand ist Aufseher und Gehilfe derselben Gruppe — wird der Gehilfe Aufseher, rückt er auf.',
    suchen: '  const ohne = (id: string | null): string | null => (personId !== null && id === personId ? null : id)\n',
    ersetzen: '  const ohne = (id: string | null): string | null => id\n',
  },
  {
    id: 'gruppen-wahl-hinweis',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Das Blatt der Gruppe sagt, dass nur ihre Mitglieder zur Wahl stehen — auch einer neuen, die noch niemanden hat.',
    suchen: '        <p id={wahlHinweisId} className="klein-text">\n          {t.gruppeWahlMitglieder}\n        </p>\n',
    ersetzen: '',
  },
  {
    id: 'gruppen-wahl-hinweis-am-feld',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Aufseher- und Gehilfenfeld verweisen auf den Hinweis — ein Vorleseprogramm liest ihn beim Feld vor.',
    suchen: '      aria-describedby={wahlHinweisId}\n',
    ersetzen: '',
  },
  {
    id: 'gruppenwechsel-beendet-amt',
    datei: 'src/app/reducer.ts',
    regel: 'Wer die Gruppe wechselt, ist in der alten weder Aufseher noch Gehilfe — und plant sie nicht mehr.',
    suchen: "      if ('grp' in action.patch) next.groups = aemterBeenden(state.groups, action.id, action.patch.grp ?? null)\n",
    ersetzen: '',
  },
  // Hier stand `gruppenwechsel-nur-bei-wechsel` („dieselbe Gruppe noch einmal
  // beendet nichts"): Die Probe meldete es unbewacht, weil die Bedingung seit
  // `bleibt` nichts mehr bewirkt — in der eigenen Gruppe bleibt das Amt ohnehin.
  // Sie ist gestrichen; der Fall steht weiter in `reducer.test.ts`.
  {
    id: 'gruppenwechsel-amt-in-neuer-gruppe-bleibt',
    datei: 'src/data/helpers.ts',
    regel: 'Wer in die Gruppe wechselt, die er schon leitet, behält dort das Amt — die Reparatur nimmt es ihm nicht.',
    suchen: 'g.id !== bleibt && (g.overseerId === personId || g.assistantId === personId)',
    ersetzen: '(g.overseerId === personId || g.assistantId === personId)',
  },
  {
    id: 'gruppenwechsel-gespeichert',
    datei: 'src/app/persist.ts',
    regel: 'Das beendete Amt geht in die Datenbank — sonst stünde der Aufseher nach dem Laden wieder da.',
    // Die Zeile darunter steht genauso beim Entfernen einer Gruppe — der
    // Kommentar davor macht die Stelle eindeutig.
    suchen:
      '      // nächsten Laden wieder als ihr Aufseher da und plante sie weiter.\n      geaenderteSchreiben(prev.groups, next.groups, (grp, pos) => saveGroupRow(congId, grp, pos))\n',
    ersetzen: '      // nächsten Laden wieder als ihr Aufseher da und plante sie weiter.\n',
  },
  {
    id: 'gruppenwechsel-hinweis-vorher',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: 'Beim Aufseher und beim Gehilfen steht unter der Gruppe, dass ein Wechsel das Amt beendet.',
    suchen:
      '        {amtHinweis && (\n          <p id={amtHinweisId} className="klein-text">\n            {amtHinweis}\n          </p>\n        )}\n',
    ersetzen: '',
  },
  {
    id: 'gruppenwechsel-hinweis-am-feld',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: 'Das Gruppenfeld verweist auf den Hinweis zum Amt — ein Vorleseprogramm liest ihn vor dem Wechsel.',
    suchen: '              aria-describedby={amtHinweis ? amtHinweisId : undefined}\n',
    ersetzen: '',
  },
  {
    id: 'person-weg-amt-weg',
    datei: 'src/app/reducer.ts',
    regel: 'Wer gelöscht wird, ist danach nirgends mehr Aufseher oder Gehilfe.',
    suchen: '    groups: aemterBeenden(state.groups, id),\n',
    ersetzen: '',
  },
  {
    id: 'gruppen-folgen-nennen-besuche',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Vor dem Entfernen einer Gruppe steht da, dass ihre Gruppenbesuche entfallen.',
    suchen: "  if (daten.gruppenbesuche.some((b) => b.grp === gruppeId)) folgen.push('besuche')\n",
    ersetzen: '',
  },
  {
    id: 'gruppen-folgen-plaene',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Vor dem Entfernen einer Gruppe steht da, dass ihre Zeiträume in den weiteren Plänen ohne Gruppe bleiben.',
    suchen: "  if (daten.planEintraege.some((e) => e.grp === gruppeId)) folgen.push('plaene')\n",
    ersetzen: '',
  },
  {
    id: 'hilfsdienst-hinweis-gruppen',
    datei: 'src/einstellungen/HilfsdienstBlatt.tsx',
    regel: 'Vor dem Entfernen der Reinigung nennt der Hinweis keine Freigaben bei Personen — sie hat keine — und sagt, dass sie nicht wiederkommt.',
    suchen: '{service.groups ? t.hdEntfernenHinweisGruppen : t.hdEntfernenHinweis}',
    ersetzen: '{t.hdEntfernenHinweis}',
  },
  {
    id: 'einstellungen-desktop-titel-einmal',
    datei: 'src/einstellungen/EinstellungenScreen.tsx',
    regel: 'Am Desktop steht der Titel eines Abschnitts einmal — nicht noch einmal über seiner Karte.',
    suchen: '    zusammenkuenfte: () => <ZusammenkuenfteKarte mitTitel={false} />,',
    ersetzen: '    zusammenkuenfte: () => <ZusammenkuenfteKarte />,',
  },
  {
    id: 'gruppen-neue-zaehlt-weiter',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Eine neue Gruppe (und ein neuer Trolley) bekommt die nächste Nummer — nicht wieder eine vergebene.',
    suchen: '  return liste.reduce((m, x) => Math.max(m, Number.parseInt(x.name.replace(/\\D/g, \'\'), 10) || 0), 0) + 1',
    ersetzen: '  return liste.length + 1',
  },
  {
    id: 'gruppen-name-eigene-richtung',
    datei: 'src/einstellungen/GruppenInhalt.tsx',
    regel: 'Der Name einer Gruppe ist frei und steht in seiner eigenen Schreibrichtung.',
    suchen: '              eigenerName\n',
    ersetzen: '',
  },
  {
    id: 'gruppen-tabelle-am-desktop',
    datei: 'src/einstellungen/EinstellungenScreen.tsx',
    regel: 'Am Desktop stehen die Gruppen als Tabelle: Gruppe, Aufseher, Gehilfe, Personen.',
    suchen: 'gruppen: () => <GruppenInhalt tabelle />,',
    ersetzen: 'gruppen: () => <GruppenInhalt />,',
  },
  /* ---- Einstellungen: Erinnerungen als Zeitleiste (T121, Phase 6c-4, 14.10.2026) ---- */
  {
    id: 'erinnerungen-zitiert-echten-titel',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: '„Plan gesendet" zitiert den Titel, unter dem die Mitteilung ankommt — in der Sprache des Lesers, keine Abschrift.',
    suchen: 'fill(t.erinPlanSofort, { titel: t.notifZuteilung })',
    ersetzen: "fill(t.erinPlanSofort, { titel: 'Neue Zuteilung' })",
  },
  {
    id: 'erinnerungen-bestandswert-als-dritte',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: 'Eine letzte Erinnerung über einem Tag steht als eigene Möglichkeit da und ist gedrückt — sonst sähe niemand, was gilt.',
    suchen: '  const tage = last > 1 ? [0, 1, last] : [0, 1]',
    ersetzen: '  const tage = [0, 1]',
  },
  {
    id: 'erinnerungen-gleiche-wahl-schreibt-nicht',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: 'Ein Tipp auf die schon gewählte letzte Erinnerung schreibt nichts.',
    suchen: "if (tage !== last) dispatch({ type: 'setReminder', key: 'last', value: tage })",
    ersetzen: "dispatch({ type: 'setReminder', key: 'last', value: tage })",
  },
  {
    id: 'erinnerungen-wahl-gross',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: 'Die Möglichkeiten der letzten Erinnerung beginnen in jeder Sprache groß (ru „За 1 день", sw „Mapema kwa siku 1").',
    suchen: '  const texte = { remAmTagKurz: t.remAmTagOption, remVorher: t.remVorherOption }',
    ersetzen: '  const texte = { remAmTagKurz: t.remAmTagOption, remVorher: (t as Dict).remVorher }',
  },
  {
    id: 'erinnerungen-grenze-wie-reducer',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: '+ sperrt bei der ersten Erinnerung an derselben Grenze, an der der Reducer klemmt (21 Tage).',
    suchen: 'max={ERINNERUNG_GRENZEN.first.max}',
    ersetzen: 'max={30}',
  },
  {
    id: 'erinnerungen-erste-schrittweise',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: '− und + verstellen die erste Erinnerung um einen Tag in die gedrückte Richtung.',
    suchen: 'delta: neu > first ? 1 : -1',
    ersetzen: 'delta: 1',
  },
  {
    id: 'erinnerungen-meldung-echter-titel',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: '„Sofort gemeldet" nennt den Entzug so, wie die Mitteilung heißt — in der Sprache des Lesers.',
    suchen: '<Meldung titel={t.notifEntzug} an={t.erinEntzugAn} />',
    ersetzen: '<Meldung titel="Zuteilung zurückgezogen" an={t.erinEntzugAn} />',
  },
  {
    id: 'erinnerung-setzen-geklemmt',
    datei: 'src/app/reducer.ts',
    regel: 'Ein gesetzter Erinnerungswert bleibt in den Grenzen der Datenbank (erste 1–21, letzte 0–7).',
    suchen: '      const value = Math.max(min, Math.min(max, gewuenscht))',
    ersetzen: '      const value = gewuenscht',
  },
  {
    id: 'erinnerung-setzen-gespeichert',
    datei: 'src/app/persist.ts',
    regel: 'Die Wahl der letzten Erinnerung wird gespeichert wie − und +.',
    suchen: "    case 'setReminder':\n",
    ersetzen: '',
  },
  {
    id: 'erinnerung-grenzen-wie-datenbank',
    datei: 'src/app/context.ts',
    regel: 'Die Grenzen der Erinnerungen sind die der Datenbank (`reminder_last between 0 and 7`).',
    suchen: '  last: { min: 0, max: 7 },',
    ersetzen: '  last: { min: 0, max: 9 },',
  },
  {
    id: 'einstellungen-erinnerungen-eingehaengt',
    datei: 'src/einstellungen/EinstellungenScreen.tsx',
    regel: 'Am Desktop zeigt der Abschnitt „Mitteilungen und Erinnerungen" die Zeitleiste der Erinnerungen.',
    suchen: 'erinnerungen: () => <ErinnerungenInhalt />,',
    ersetzen: 'erinnerungen: () => null,',
  },
  // ── Trolleys (T121, Phase 7) ──────────────────────────────────────────────
  {
    id: "trolley-fn-eintragen-recht",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Eintragen kann sich nur, wer das Trolley-Recht hat — die Function prüft es selbst, nicht die App.",
    suchen: "  if (!darfTrolley(a.ich)) return nein('kein-recht')\n  if (datum < heute) return nein('vorbei')",
    ersetzen: "  if (datum < heute) return nein('vorbei')",
  },
  {
    id: "trolley-fn-dazukommen-recht",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Dazukommen kann nur, wer das Trolley-Recht hat.",
    suchen: "  if (!darfTrolley(a.ich)) return nein('kein-recht')\n  const termin = await terminLesen(a.cong, id)",
    ersetzen: "  const termin = await terminLesen(a.cong, id)",
  },
  {
    id: "trolley-fn-partner-recht",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Als Partner einträgt man nur, wer selbst das Trolley-Recht hat.",
    suchen: "  if (partner && !darfTrolley(partnerRows[0])) return nein('partner-ohne-recht')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-vorbei",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Ein Tag, der vorbei ist, nimmt niemanden mehr auf.",
    suchen: "  if (datum < heute) return nein('vorbei')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-belegt",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Ein Trolley ist zur selben Zeit nur einmal unterwegs.",
    suchen: "  if (amTag.some((t) => t.trolley_id === trolleyId && ueberschneiden(t, neu))) return nein('belegt')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-doppelt",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Niemand ist zur selben Zeit an zwei Trolleys eingetragen.",
    suchen: "  if (schonUnterwegs(amTag, a.ich.id, neu)) return nein('doppelt')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-partner-doppelt",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Auch der Partner ist zur selben Zeit nicht schon woanders eingetragen.",
    suchen: "  if (partner && schonUnterwegs(amTag, partner, neu)) return nein('partner-doppelt')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-dazukommen-doppelt",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Wer zur selben Zeit schon eingetragen ist, kommt nirgends dazu.",
    suchen: "  if (schonUnterwegs(await termineAm(a.cong, termin.datum), a.ich.id, termin, termin.id)) return nein('doppelt')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-dazukommen-bedingt",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Dazukommen schreibt nur, solange noch niemand dazugekommen ist — von zweien zugleich gewinnt einer.",
    suchen: "&partner_id=is.null&select=",
    ersetzen: "&select=",
  },
  {
    id: "trolley-fn-dazukommen-eigener",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Zum eigenen Termin kommt man nicht dazu.",
    suchen: "  if (termin.person_id === a.ich.id) return nein('bad-request')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-austragen-nur-dabei",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Wer nicht im Termin steht, trägt niemanden aus.",
    suchen: "  if (bleibt === undefined) return nein('forbidden')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-austragen-bedingt",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Austragen trifft nur den gelesenen Stand — hat sich der Partner inzwischen geändert, trifft es nichts.",
    suchen: "    (termin.partner_id ? `&partner_id=eq.${wert(termin.partner_id)}` : '&partner_id=is.null') +",
    ersetzen: "",
  },
  {
    id: "trolley-fn-meldet-partner",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Wer als Partner eingetragen wird, bekommt „Für den Trolley eingetragen\".",
    suchen: "  if (partner) {",
    ersetzen: "  if (false) {",
  },
  {
    id: "trolley-fn-entfernen-nur-admin",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Einen Trolley entfernt nur der Admin.",
    suchen: "  if (!a.admin) return nein('forbidden')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-entfernen-ohne-person",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Ein Admin entfernt einen Trolley auch, wenn sein Konto keiner Person zugeordnet ist.",
    suchen: "    if (payload.aktion === 'entfernen') {",
    ersetzen: "    if (payload.aktion === 'entfernen' && mich.person_id) {",
  },
  {
    id: "trolley-fn-entfernen-nicht-selbst",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Wer einen Trolley entfernt, bekommt selbst keine Meldung darüber.",
    suchen: ".filter((pid): pid is string => pid !== null && pid !== a.ichId)",
    ersetzen: ".filter((pid): pid is string => pid !== null)",
  },
  {
    id: "trolley-uebergabe-zur-vollen-stunde",
    datei: "supabase/functions/_shared/trolley.ts",
    regel: "Wer um 11 übernimmt, wo einer um 11 aufhört, stört niemanden — die Grenze gehört keinem.",
    suchen: "  return a.datum === b.datum && a.von < b.bis && b.von < a.bis",
    ersetzen: "  return a.datum === b.datum && a.von <= b.bis && b.von <= a.bis",
  },
  {
    id: "trolley-halbe-stunden",
    datei: "supabase/functions/_shared/trolley.ts",
    regel: "Termine liegen im Raster: von 6 bis 22 Uhr, in halben Stunden.",
    suchen: "  return TROLLEY_ZEITEN.includes(von) && TROLLEY_ZEITEN.includes(bis) && von < bis",
    ersetzen: "  return von < bis",
  },
  {
    id: "trolley-partner-bleibt",
    datei: "supabase/functions/_shared/trolley.ts",
    regel: "Geht der, der eingetragen hat, bleibt der Partner — und sucht wieder einen.",
    suchen: "  return partner ? { person: partner } : null",
    ersetzen: "  return null",
  },
  {
    id: "trolley-hindernis-belegt",
    datei: "src/data/trolleys.ts",
    regel: "Dass der Trolley zu der Zeit schon unterwegs ist, steht schon vor dem Absenden da.",
    suchen: "  if (termine.some((t) => t.trolleyId === wunsch.trolleyId && ueberschneiden(t, wunsch))) return 'belegt'",
    ersetzen: "",
  },
  {
    id: "trolley-hindernis-partner-recht",
    datei: "src/data/trolleys.ts",
    regel: "Ein Partner ohne Trolley-Recht wird vor dem Absenden genannt.",
    suchen: "  if (wunsch.partner && !darfTrolley(wunsch.partner)) return 'partner-ohne-recht'",
    ersetzen: "",
  },
  {
    id: "trolley-eigene-ab-heute",
    datei: "src/data/trolleys.ts",
    regel: "Unter den eigenen Terminen steht nichts, was vorbei ist.",
    suchen: "  return termineSortiert(termine.filter((t) => t.datum >= tag && istDabei(t, pid)))",
    ersetzen: "  return termineSortiert(termine.filter((t) => istDabei(t, pid)))",
  },
  {
    id: "trolley-gesucht-ohne-eigene",
    datei: "src/data/trolleys.ts",
    regel: "Unter „Partner gesucht\" steht der eigene Termin nicht — zu sich selbst kommt man nicht dazu.",
    suchen: "  return termineSortiert(termine.filter((t) => t.datum >= tag && t.partner === null && t.pid !== pid))",
    ersetzen: "  return termineSortiert(termine.filter((t) => t.datum >= tag && t.partner === null))",
  },
  {
    id: "trolley-vorschlag-dieser-trolley",
    datei: "src/data/trolleys.ts",
    regel: "Der Vorschlag nach einem Tipp reicht bis zum nächsten Termin dieses Trolleys — ein anderer zählt nicht.",
    suchen: "    .filter((t) => t.trolleyId === trolleyId && t.datum === datum && minuten(t.von) > anfang)",
    ersetzen: "    .filter((t) => t.datum === datum && minuten(t.von) > anfang)",
  },
  {
    id: "trolley-kommende-ab-heute",
    datei: "src/data/trolleys.ts",
    regel: "Kommende Termine eines Trolleys zählen ab heute — was vorbei ist, geht beim Entfernen nicht verloren.",
    suchen: "  return termine.filter((t) => t.trolleyId === trolleyId && t.datum >= tag)",
    ersetzen: "  return termine.filter((t) => t.trolleyId === trolleyId)",
  },
  {
    id: "trolley-entfernt-nimmt-termine",
    datei: "src/app/reducer.ts",
    regel: "Ein entfernter Trolley nimmt seine Termine mit — wie in der Datenbank (on delete cascade).",
    suchen: "        trolleyTermine: state.trolleyTermine.filter((t) => t.trolleyId !== action.id),",
    ersetzen: "        trolleyTermine: state.trolleyTermine,",
  },
  {
    id: "trolley-person-weg-partner-sucht",
    datei: "src/app/reducer.ts",
    regel: "Geht der Partner, bleibt der Termin — der andere sucht wieder einen (on delete set null).",
    suchen: "          .map((t) => (t.partner === id ? { ...t, partner: null, gemeinsam: false } : t))",
    ersetzen: "          .map((t) => t)",
  },
  {
    id: "trolley-termine-sortiert",
    datei: "src/app/reducer.ts",
    regel: "Was die Function zurückgibt, steht nach Tag und Zeit — wie die Ansicht es liest.",
    suchen: "        trolleyTermine: action.termin ? termineSortiert([...ohne, action.termin]) : ohne,",
    ersetzen: "        trolleyTermine: action.termin ? [...ohne, action.termin] : ohne,",
  },
  {
    id: "trolley-name-nie-leer",
    datei: "src/app/reducer.ts",
    regel: "Ohne Namen ist es kein Trolley — der Zustand nimmt ihn nicht an.",
    suchen: "      if (!alt || action.patch.name?.trim() === '') return state",
    ersetzen: "      if (!alt) return state",
  },
  {
    id: "trolley-anlegen-gespeichert",
    datei: "src/app/persist.ts",
    regel: "Ein neuer Trolley wird gespeichert.",
    suchen: "    case 'trolleyAnlegen':\n",
    ersetzen: "",
  },
  {
    id: "trolley-aendern-gespeichert",
    datei: "src/app/persist.ts",
    regel: "Name, Ort und Hinweis eines Trolleys werden gespeichert.",
    suchen: "    case 'trolleyAendern':\n",
    ersetzen: "",
  },
  {
    id: "trolley-veraltet-laedt-nach",
    datei: "src/trolleys/useTrolleyAktion.ts",
    regel: "War jemand schneller, lädt die App still nach — die Ansicht zeigt, was jetzt gilt.",
    suchen: "    if (!erg.ok && VERALTET.has(erg.fehler) && state.userId) void loadAndHydrate(dispatch, state.userId, { silent: true })",
    ersetzen: "",
  },
  {
    id: "trolley-entfernen-weg-gilt",
    datei: "src/trolleys/useTrolleyAktion.ts",
    regel: "Ist der Trolley schon fort, ist das so gut wie entfernt.",
    suchen: "      if (!erg.ok && erg.fehler !== 'weg') return erg.fehler",
    ersetzen: "      if (!erg.ok) return erg.fehler",
  },
  {
    id: "trolley-reiter-nur-ansehen",
    datei: "src/planen/fs-bereiche.ts",
    regel: "Den Reiter „Trolleys\" gibt es nur beim Ansehen — die Trolleys plant niemand.",
    suchen: "  const trolleys = !planen && state.trolleys.length > 0",
    ersetzen: "  const trolleys = state.trolleys.length > 0",
  },
  {
    id: "trolley-blatt-name-doppelt",
    datei: "src/einstellungen/TrolleyBlatt.tsx",
    regel: "Ein doppelter Trolley-Name bleibt der alte — und ein Hinweis sagt warum.",
    suchen: "  const dublette = doppelterName(state.trolleys, trolley.id, name)",
    ersetzen: "  const dublette = undefined",
  },
  {
    id: "trolley-blatt-nur-geaendertes",
    datei: "src/einstellungen/TrolleyBlatt.tsx",
    regel: "Wer im Blatt nichts anfasst, schreibt nichts.",
    suchen: "    if (eingabe.ort.trim() !== trolley.ort) patch.ort = eingabe.ort.trim()",
    ersetzen: "    patch.ort = eingabe.ort.trim()",
  },
  {
    id: "trolley-blatt-folgen-nur-mit-terminen",
    datei: "src/einstellungen/TrolleyBlatt.tsx",
    regel: "Ohne kommende Termine nennt das Blatt keine Folgen des Entfernens — erfunden wird keine.",
    suchen: "        {kommende > 0 && (",
    ersetzen: "        {kommende >= 0 && (",
  },
  {
    id: "trolley-neu-naechste-zahl",
    datei: "src/einstellungen/TrolleysKarte.tsx",
    regel: "Ein neuer Trolley zählt weiter — nicht wieder bei 1.",
    suchen: "name: neuerTrolleyName(state.trolleys, t.privZeugnis)",
    ersetzen: "name: t.privZeugnis",
  },
  {
    id: "start-trolley-nach-dem-tag",
    datei: "src/dashboard/DashboardScreen.tsx",
    regel: "Auf Start stehen die eigenen Trolley-Termine nach dem Tag zwischen den Aufgaben.",
    suchen: "  zeilen.sort((a, b) => (a.tag ?? ohneTag).localeCompare(b.tag ?? ohneTag))",
    ersetzen: "",
  },
  {
    id: "aufgaben-trolley-nur-eigene",
    datei: "src/aufgaben/AufgabenScreen.tsx",
    regel: "In „Meine Aufgaben\" stehen nur die eigenen kommenden Trolley-Termine.",
    suchen: "  const termine = eigeneTermine(state.trolleyTermine, ich, fromIso(heute))",
    ersetzen: "  const termine = state.trolleyTermine",
  },
  {
    id: "erinnerung-trolley-beide",
    datei: "supabase/functions/send-reminders/index.ts",
    regel: "Am Vortag erinnert die App beide, die eingetragen sind — nicht nur den, der eingetragen hat.",
    suchen: "          [t.partner_id, t.person_id],",
    ersetzen: "",
  },
  {
    id: "probe-trolley-laeuft",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "Die Probe misst die Trolley-Fälle (71)–(79).",
    suchen: "  await trolleyProben(k)\n",
    ersetzen: "",
  },
  {
    id: "probe-trolley-urteil-nur-recht",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "Ein Urteil an der Function `trolley` ist nur der Erfolg oder die Abweisung über das Recht — `belegt`, `weg`, `no-person` heißen „Probe kaputt\".",
    suchen: "urteil: a.status < 400 || TROLLEY_RECHT.includes(fehler)",
    ersetzen: "urteil: true",
  },
  {
    id: "probe-trolley-71-mit-recht",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "(71) schreibt mit dem Trolley-Recht — sonst wiese schon der Trigger ab, und die Richtlinie bliebe ungemessen.",
    suchen: "    await trolleyTabellenProben(k, a, anlage.ok ? await recht(true) : anlage)",
    ersetzen: "    await trolleyTabellenProben(k, a, anlage)",
  },
  {
    id: "probe-trolley-71-wieder-weg",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "Kam (71) doch an, trägt die Function den Termin wieder aus — direkt löschen darf ihn niemand.",
    suchen: "      loeschen: () => mitglied.funktion('trolley', { aktion: 'austragen', id: a.direkt.id }),\n",
    ersetzen: "",
  },
  {
    id: "probe-trolley-74-wieder-weg",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "Kam (74) durch, wird der Termin wieder ausgetragen.",
    suchen: "    zurueck: () => mitglied.funktion('trolley', austragen(a.ohneRecht.id)),\n",
    ersetzen: "",
  },
  {
    id: "probe-trolley-raeumt-trolleys",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "Nach dem Lauf sind die Trolleys der Probe fort, ihre Termine per Kaskade mit.",
    suchen: "      ['die Trolleys samt ihren Terminen', () => planer.rest(`trolleys?id=like.${marke}*`, 'DELETE', undefined, 'return=minimal')],",
    ersetzen: "",
  },
  {
    id: "probe-trolley-recht-wie-vorher",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "Nach dem Lauf hat das Mitglied das Trolley-Recht wie vorher.",
    suchen: "      ['das Trolley-Recht des Mitglieds', () => planer.rest(`persons?id=eq.${mitglied.pid}`, 'PATCH', { priv: privVorher }, 'return=minimal')],",
    ersetzen: "",
  },
  // ── Repo-Review, Runde 1 (14.10.2026) ─────────────────────────────────────
  {
    id: "woche-schreiben-wurf-zweiter-versuch",
    datei: "supabase/functions/_shared/woche-schreiben.ts",
    regel: "Auch ein Netzfehler, der wirft, bekommt beim Schreiben einer Woche den zweiten Versuch.",
    suchen: "    } catch (err) {\n      console.error('wocheSchreiben:', err instanceof Error ? err.message : String(err))\n      return null\n    }",
    ersetzen: "    } catch (err) {\n      throw err\n    }",
  },
  {
    id: "einspringen-stand-der-woche",
    datei: "supabase/functions/substitute/index.ts",
    regel: "Einspringen schreibt die Woche nur auf dem gelesenen Stand — was der Admin dazwischen ändert, bleibt stehen.",
    suchen: "    const stand = weekRows[0]?.updated_at\n",
    ersetzen: "    const stand = (await rest.get<{ updated_at: string }[]>(`weeks?select=updated_at&congregation_id=eq.${wert(cong)}&start=eq.${wert(parts.woche)}`))[0]?.updated_at\n",
  },
  {
    id: "erinnerung-zusagen-je-woche",
    datei: "supabase/functions/send-reminders/index.ts",
    regel: "Der Erinnerungslauf liest die Zusagen nur der Wochen im Fenster, je Woche ihr Präfix — nicht die ganze Tabelle.",
    suchen: "        [...weeks.map((w) => wochenPraefixe(w.start)[0]), ...fsWeeks.map((w) => wochenPraefixe(w.start)[1])],\n",
    ersetzen: "        [''],\n",
  },
  {
    id: "import-jahreswechsel",
    datei: "supabase/functions/import-week/wochen-slug.ts",
    regel: "Die Woche über den Jahreswechsel („28-Dezember-2026-3-Januar-2027“) wird erkannt, nicht übersprungen.",
    suchen: "  for (const form of FORMEN) {",
    ersetzen: "  for (const form of FORMEN.slice(1)) {",
  },
  {
    id: "spanne-jahreswechsel-wirft-nicht",
    datei: "supabase/functions/_shared/i18n/translate.ts",
    regel: "Wirft formatRange bei einer Spanne über den Jahreswechsel, bleibt sie deutsch stehen, statt die Seite zu reißen.",
    suchen: "  try {\n    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).formatRange(a, b)\n  } catch {\n    return null\n  }",
    ersetzen: "  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).formatRange(a, b)",
  },
  {
    id: "fs-woche-mit-stand",
    datei: "src/lib/data.ts",
    regel: "Eine Treffpunkt-Woche wird nur auf dem Stand geschrieben, auf dem sie beruht — nichts eines anderen wird still zurückgenommen.",
    suchen: "          .eq('start', woche)\n          .eq('updated_at', stand)\n          .select('updated_at')\n          .maybeSingle()\n  if (error) {\n    // 23505",
    ersetzen: "          .eq('start', woche)\n          .select('updated_at')\n          .maybeSingle()\n  if (error) {\n    // 23505",
  },
  {
    id: "fs-woche-stand-geladen",
    datei: "src/lib/data.ts",
    regel: "Den Stand jeder geladenen Treffpunkt-Woche merkt sich der Ladevorgang — sonst legte der erste Schreibvorgang neu an.",
    suchen: "  fsStaendeSetzen(fsZeilen.flatMap(",
    ersetzen: "  fsStaendeSetzen([] || fsZeilen.flatMap(",
  },
  {
    id: "jahresspanne-intl",
    datei: "supabase/functions/_shared/i18n/translate.ts",
    regel: "Der Wochenkopf über den Jahreswechsel (mit Jahreszahlen) wird in den Intl-Sprachen übersetzt.",
    suchen: "    jahresSpannenRegel(locale),\n",
    ersetzen: "",
  },
  {
    id: "jahresspanne-woerterbuch",
    datei: "supabase/functions/_shared/i18n/translate.ts",
    regel: "Der Wochenkopf über den Jahreswechsel wird auch in den Wörterbuch-Sprachen (en/es/fr) übersetzt.",
    suchen: "    jahresSpannenRegel(LOCALES[code] ?? code),\n",
    ersetzen: "",
  },
  {
    id: "zurueck-verlaesst-feld",
    datei: "src/components/useBackDismiss.ts",
    regel: "Die Zurück-Taste verlässt erst das aktive Feld, dann schließt sie die Ebene — seine Eingabe geht nicht verloren.",
    suchen: "        feldVerlassen()\n",
    ersetzen: "",
  },
  {
    id: "wischen-verlaesst-feld",
    datei: "src/components/useSwipeWeek.ts",
    regel: "Vor dem Blättern per Wischen wird ein Feld im Streifen verlassen — seine Eingabe übernimmt noch die alte Woche.",
    suchen: "      if (aktiv instanceof HTMLElement && el.contains(aktiv)) aktiv.blur()\n",
    ersetzen: "",
  },
  {
    id: "einstellungen-nur-geaendertes",
    datei: "src/app/persist.ts",
    regel: "Die Einstellungen der Versammlung schreiben nur, was die Aktion geändert hat — kein älterer Stand überschreibt fremde Änderungen.",
    suchen: "  if (Object.keys(aenderung).length > 0) saveSettings(congId, aenderung)",
    ersetzen: "  saveSettings(congId, { reminders: next.reminders, congLang: next.congLang, progLangs: next.progLangs, auxClass: next.auxClass })",
  },
  {
    id: "stammdaten-nur-geaendertes",
    datei: "src/app/persist.ts",
    regel: "Die Stammdaten der Versammlung schreiben nur die geänderten Felder, gesammelt über die Tastenanschläge.",
    suchen: "      const info = geaenderteFelder(prev.congregation, next.congregation)\n",
    ersetzen: "      const info = next.congregation\n",
  },
  {
    id: "varianten-ueber-montag",
    datei: "src/app/reducer.ts",
    regel: "Nachgeladene Sprachvarianten finden ihre Woche über den Montag; gibt es sie nicht mehr, ändert sich nichts.",
    suchen: "      if (!action.start || !state.weeks.some((w) => w.start === action.start)) return state\n",
    ersetzen: "",
  },
  {
    id: "alle-seiten-holt-weiter",
    datei: "src/lib/data.ts",
    regel: "Wachsende Tabellen kommen über die Zeilengrenze von PostgREST hinweg vollständig an — Seite für Seite.",
    suchen: "    if (neu.length === 0 || zeilen.length >= gesamt) return { data: zeilen, error: null }",
    ersetzen: "    return { data: zeilen, error: null }",
  },
  {
    id: "datumswaehler-in-marke",
    datei: "src/components/DatePicker.tsx",
    regel: "Ein Klick in den offenen Kalender (Monatstitel, Wochentage, Fugen) klappt ihn nicht zu, auch wenn er in einer Marke steht.",
    suchen: ' onClick={(e) => e.preventDefault()}>',
    ersetzen: '>',
  },
  {
    id: "wochenpfeil-fokus-bleibt",
    datei: "src/components/WeekNav.tsx",
    regel: "Am Rand gesperrte Wochenpfeile behalten den Fokus — aria-disabled statt disabled.",
    suchen: '      <GesperrterKnopf className="rund-knopf week-arrow" label={t.a11yPrevWeek} gesperrt={!canPrev} onTipp={onPrev}>\n        <Zeichen name="zurueck" />\n      </GesperrterKnopf>',
    ersetzen: '      <button type="button" className="rund-knopf week-arrow" aria-label={t.a11yPrevWeek} disabled={!canPrev} onClick={onPrev}>\n        <Zeichen name="zurueck" />\n      </button>',
  },
  {
    id: "neuladen-verwirft-wartendes",
    datei: "src/app/persist.ts",
    regel: "Ein Neuladen verwirft, was gebündelt wartete — es beruht auf dem ersetzten Stand und schriebe still über das Geladene.",
    suchen: "  if (action.type === 'hydrate') wartendesVerwerfen()\n",
    ersetzen: "",
  },
  {
    id: 'woche-sofort-ueberholt-buendel',
    datei: 'src/app/persist.ts',
    regel: 'Eine sofort geschriebene Woche nimmt ihre wartende Fassung mit — die ältere geht nicht hinterher und nimmt die neue zurück.',
    suchen: '  weekSaves.sofort(week.start, { congId, week })\n',
    ersetzen: '  saveWeek(congId, week)\n',
  },
  {
    id: "treffpunkte-sofort-ueberholt-buendel",
    datei: "src/app/persist.ts",
    regel: "Eine sofort geschriebene Treffpunkt-Woche nimmt ihre wartende Fassung mit — ein eben getippter Ort nimmt den Leiter nicht zurück.",
    suchen: "  fsWeekSaves.sofort(week.start, { congId, insts: fsWeek })\n",
    ersetzen: "  saveFsWeek(congId, week.start, fsWeek)\n",
  },
  {
    id: "treffpunkt-ort-gebuendelt",
    datei: "src/app/persist.ts",
    regel: "Zeit und Ort eines Treffpunkts gehen gebündelt hinaus — einmal mit dem letzten Stand, nicht je Buchstabe.",
    suchen: "    case 'fsInstUpdate':\n      // Der Ort kommt je Tastenanschlag — gebündelt geht die Woche einmal\n      // hinaus statt einmal je Buchstabe.\n      fsWochePlanen(",
    ersetzen: "    case 'fsInstUpdate':\n      // Der Ort kommt je Tastenanschlag — gebündelt geht die Woche einmal\n      // hinaus statt einmal je Buchstabe.\n      fsWocheSpeichern(",
  },
  {
    id: "app-verlassen-schreibt",
    datei: "src/app/store.tsx",
    regel: "Geht die App in den Hintergrund, geht hinaus, was gebündelt wartet — am Handy hält das System den Zeitgeber an.",
    suchen: "      if (document.visibilityState === 'hidden') ausstehendesSchreiben()\n",
    ersetzen: "",
  },
  {
    id: "ladung-wartendes-geht-nicht-los",
    datei: "src/lib/data.ts",
    regel: "Eine Woche, die vor einem Neuladen in ihrer Kette wartete, geht danach nicht mit dem frischen Stand los.",
    suchen: "  if (geladen !== ladung) {\n    konfliktMelder?.()\n    return\n  }\n  const stand = wochenStand.get(woche)\n",
    ersetzen: "  const stand = wochenStand.get(woche)\n",
  },
  {
    id: "ladung-treffpunkte-wartendes",
    datei: "src/lib/data.ts",
    regel: "Eine Treffpunkt-Woche, die vor einem Neuladen in ihrer Kette wartete, geht danach nicht mit dem frischen Stand los.",
    suchen: "  if (geladen !== ladung) {\n    konfliktMelder?.()\n    return\n  }\n  const stand = fsWochenStand.get(woche)\n",
    ersetzen: "  const stand = fsWochenStand.get(woche)\n",
  },
  {
    id: "ladung-spaete-antwort",
    datei: "src/lib/data.ts",
    regel: "Eine Antwort, die erst nach einem Neuladen kommt, ersetzt den geladenen Stand nicht.",
    suchen: "  if (geladen === ladung) staende.set(woche, stand)\n",
    ersetzen: "  staende.set(woche, stand)\n",
  },
  {
    id: "zeitwahl-krumme-zeit",
    datei: "src/planen/ZeitWahl.tsx",
    regel: "Eine krumme Treffpunkt-Zeit steht so da, wie sie gilt — nicht als erste Zeit der Liste.",
    suchen: "      {zeitenZurWahl(FS_TIME_OPTIONS, value).map((tm) => (",
    ersetzen: "      {FS_TIME_OPTIONS.map((tm) => (",
  },
  {
    id: "senden-wartet-auf-woche",
    datei: "src/planen/wochen-versand.ts",
    regel: '„Plan senden" geht erst los, wenn die eben geänderte Woche geschrieben ist — die Function liest sie aus der Datenbank.',
    suchen: "    await wocheDraussen(kennung)\n",
    ersetzen: "",
  },
  {
    id: "woche-geschrieben-wartet",
    datei: "src/lib/data.ts",
    regel: "`wocheGeschrieben` wartet auf die Ketten der Woche — Zusammenkünfte und Treffpunkte.",
    suchen: "  await Promise.all([wochenKette.get(woche), fsWochenKette.get(woche)])\n",
    ersetzen: "  await Promise.all([])\n",
  },
  {
    id: "einspringen-stand-uebernehmen",
    datei: "src/lib/data.ts",
    regel: "Nach dem Einspringen kennt die App den Stand, den die Function geschrieben hat — die nächste Änderung meldet keinen falschen Konflikt.",
    suchen: "      standDerFunctionUebernehmen(data, geladen)\n      return\n    }\n    console.error('[substitute/take]'",
    ersetzen: "      return\n    }\n    console.error('[substitute/take]'",
  },
  {
    id: "freier-platz-stand-uebernehmen",
    datei: "src/lib/data.ts",
    regel: "Nach dem Übernehmen eines freien Platzes kennt die App den Stand, den die Function geschrieben hat.",
    suchen: "      standDerFunctionUebernehmen(data, geladen)\n      return\n    }\n    console.error('[substitute/fill]'",
    ersetzen: "      return\n    }\n    console.error('[substitute/fill]'",
  },
  {
    id: "fremder-stand-bleibt",
    datei: "src/lib/data.ts",
    regel: "Den Stand der Function übernimmt die App nur, wenn er auf ihrem eigenen aufbaut — sonst überschriebe sie, was ein anderer dazwischen schrieb.",
    suchen: "  if (wochenStand.get(woche) !== vorher) return\n",
    ersetzen: "",
  },
  {
    id: "einspringen-meldet-stand",
    datei: "supabase/functions/substitute/index.ts",
    regel: "Die Übernahme meldet den Stand vorher und nachher zurück.",
    suchen: "    return json({ ok: true, taken: true, woche: parts.woche, vorher: stand, stand: neuerStand })",
    ersetzen: "    return json({ ok: true, taken: true })",
  },
  {
    id: "person-sofort-ueberholt-buendel",
    datei: "src/app/persist.ts",
    regel: "Eine sofort geschriebene Person nimmt ihre wartende Fassung mit — die ältere geht nicht hinterher.",
    suchen: "  personSaves.sofort(person.id, { congId, person })\n",
    ersetzen: "  savePerson(congId, person)\n",
  },
  {
    id: "haushalt-raeumt-wartendes-ab",
    datei: "src/app/persist.ts",
    regel: "Wer einem Haushalt beitritt, verliert ihn nicht an eine wartende ältere Fassung seiner Person.",
    suchen: "        for (const p of geaendert) personSaves.cancel(p.id)\n",
    ersetzen: "",
  },
  {
    id: "trolley-entfernt-raeumt-buendel",
    datei: "src/app/persist.ts",
    regel: "Ein entfernter Trolley fällt aus dem wartenden Bündel — das Schreiben legte ihn sonst wieder an.",
    suchen: "    case 'trolleyEntfernt':\n",
    ersetzen: "",
  },
  {
    id: "variante-ohne-ende",
    datei: "src/data/localize.ts",
    regel: "Die Endzeit kommt aus der Versammlung, nicht aus der Sprachvariante — dort steht der feste Wert des Imports.",
    suchen: "  if (alt.date) target.date = alt.date\n",
    ersetzen: "  if (alt.date) target.date = alt.date\n  if (alt.end) target.end = alt.end\n",
  },
  {
    id: "treffpunkt-mitteilung-vorbei",
    datei: "src/data/planning.ts",
    regel: "Mitteilungen zu einem Treffpunkt verschwinden aus der Glocke, wenn seine Woche um ist.",
    suchen: "  const teile = schluesselTeile(key)\n  if (!teile) return false\n  if ('tab' in teile) {\n",
    ersetzen: "  const teile = schluesselTeile(key)\n  if (!teile || teile.art === 'fs') return false\n  if ('tab' in teile) {\n",
  },
  {
    id: "nachladen-schreibt-erst",
    datei: "src/app/hydrate.ts",
    regel: "Vor dem Nachladen geht hinaus, was gebündelt wartet — sonst verwürfe es das Laden.",
    suchen: "  ausstehendesSchreiben()\n  // Stiller Refresh",
    ersetzen: "  // Stiller Refresh",
  },
  {
    id: "trolley-termine-seitenweise",
    datei: "src/lib/data.ts",
    regel: "Die Trolley-Termine kommen über die Zeilengrenze von PostgREST hinweg vollständig an.",
    suchen: "    alleSeiten<TrolleyTerminRow>((von, bis) =>\n",
    ersetzen: "    ((seite) => seite(0, 999))((von, bis) =>\n",
  },
  /* ---- Logo in den Farben des Designs (T121, Phase 10a, 15.10.2026) ---- */
  {
    id: 'manifest-leiste-dunkel',
    datei: 'public/manifest.webmanifest',
    regel: 'Das Manifest färbt die Bedienleiste der installierten App in der Kachelfarbe — sonst weiße Knöpfe auf Weiß.',
    suchen: '  "theme_color": "#1c1e20",\n',
    ersetzen: '  "theme_color": "#ffffff",\n',
  },
  {
    id: 'manifest-startbild-kachel',
    datei: 'public/manifest.webmanifest',
    regel: 'Der Startbildschirm der installierten App trägt die Kachelfarbe — das randfüllende Icon geht darin auf.',
    suchen: '  "background_color": "#1c1e20",\n',
    ersetzen: '  "background_color": "#ffffff",\n',
  },
  {
    id: 'logo-datei-pult-minze',
    datei: 'public/logo.svg',
    regel: 'Das App-Icon trägt das Pult in Minze, wie die Darstellung.',
    suchen: '<circle cx="256" cy="140" r="30" fill="#86E0B8">',
    ersetzen: '<circle cx="256" cy="140" r="30" fill="#E7B04B">',
  },
  {
    id: 'logo-klein-datei-kachel',
    datei: 'public/logo-klein.svg',
    regel: 'Das Favicon trägt die Kachel in Graphit, wie die Karte der dunklen Darstellung.',
    suchen: '<rect width="512" height="512" rx="116" fill="#1C1E20">',
    ersetzen: '<rect width="512" height="512" rx="116" fill="#17302D">',
  },
  {
    id: 'logo-form-gross-wie-datei',
    datei: 'src/bausteine/logo-form.ts',
    regel: 'Die große Fassung in der App hat dieselben Plätze wie logo.svg.',
    suchen: '    [[171.33, 213.32], [224.43, 247.46], [287.57, 247.46], [340.67, 213.32]],\n',
    ersetzen: '    [[171.33, 213.32], [224.43, 247.46], [287.57, 247.46]],\n',
  },
  {
    id: 'anmeldung-logo-gross',
    datei: 'src/login/LoginKopf.tsx',
    regel: 'Die Anmeldung zeigt das Logo groß, mit 4, 6 und 8 Plätzen.',
    suchen: '      <Logo gross breite={150} className="login-logo" />\n',
    ersetzen: '      <Logo breite={150} className="login-logo" />\n',
  },
  /* ---- Code in der Anmelde-Mail, Sprachen (T121, Phase 10b, 15.10.2026) ---- */
  {
    id: 'anmeldemail-code-eingesetzt',
    datei: 'supabase/functions/_shared/anmelde-mail.ts',
    regel: 'Die Anmelde-Mail setzt den Code ein — kein „{code}" bleibt stehen.',
    suchen: '    code: werte.code,\n',
    ersetzen: '',
  },
  {
    id: 'send-invite-mail-code',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Die Mail des Admins trägt denselben Code wie der Zettel.',
    suchen: '        const mail = linkMail(lang, { name: person.fn, versammlung: versammlungName, url, code, gueltigBis: neu.gueltigBis })\n',
    ersetzen: "        const mail = linkMail(lang, { name: person.fn, versammlung: versammlungName, url, code: '', gueltigBis: neu.gueltigBis })\n",
  },
  {
    id: 'mailentwurf-code',
    datei: 'src/personen/link-mail.ts',
    regel: 'Die Mail aus dem eigenen Mail-Programm trägt den Code wie die des Servers.',
    suchen: 'code: link.code, gueltigBis',
    ersetzen: "code: '', gueltigBis",
  },
  {
    id: 'versammlungssprache-nicht-doppelt',
    datei: 'src/app/reducer.ts',
    regel: 'Wird eine weitere Programmsprache zur Sprache der Versammlung, ist sie keine weitere mehr.',
    suchen: '      const progLangs = state.progLangs.filter((c) => c !== action.code)\n',
    ersetzen: '      const progLangs = state.progLangs\n',
  },
  /* ---- „Alles Planen" (T121, Phase 10c, 15.10.2026) ---- */
  {
    id: 'grundplan-ganz-beim-planer',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'Der Planer pflegt den Grundplan aller Gruppen — auch wenn er zugleich Gruppenaufseher ist.',
    suchen: '          <FsRulesPanel onlyGroup={treffpunktGruppe(rechte)} />',
    ersetzen: '          <FsRulesPanel onlyGroup={rechte.admin ? null : rechte.gruppe} />',
  },
  {
    id: 'treffpunkt-anlegen-wahl-beim-planer',
    datei: 'src/planen/FsPlan.tsx',
    regel: 'Der Planer wählt beim Anlegen, für wen ein Treffpunkt gilt — auch als Gruppenaufseher.',
    suchen: '  const anlegenIn = treffpunktGruppe(rechte)\n',
    ersetzen: '  const anlegenIn = rechte.admin ? null : rechte.gruppe\n',
  },
  {
    id: 'vorrat-import-beim-planer',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Reichen die Programme nicht, holt auch der Planer sie von der Karte aus.',
    // Die Karte sieht nur, wer zuteilt (`DashboardScreen`); eine zweite Frage
    // nach dem Admin nähme dem Planer „Holen".
    suchen: '        {stand.vorratKnapp && (\n',
    ersetzen: '        {stand.vorratKnapp && state.planner && (\n',
  },
  // ── Planung: alle Wochen und „Holen" (T121, Phase 10) ─────────────────────
  {
    id: 'holen-erst-im-blatt',
    datei: 'src/planen/useWochenImport.ts',
    regel: '„Holen" hängt die Woche nicht an — das Blatt zeigt sie erst, übernommen wird dort.',
    suchen: '    if (res.ok) return res.week\n',
    ersetzen: "    if (res.ok) {\n      dispatch({ type: 'addImportedWeek', week: res.week })\n      return res.week\n    }\n",
  },
  {
    id: 'uebernehmen-zuteilen-neue-woche',
    datei: 'src/planen/useWochenImport.ts',
    regel: '„Übernehmen und zuteilen" öffnet die neue Woche — sie kommt ans Ende —, nicht die gezeigte.',
    suchen: '    const wi = state.weeks.length\n',
    ersetzen: '    const wi = state.week\n',
  },
  {
    id: 'uebernehmen-doppelt-kein-sprung',
    datei: 'src/planen/useWochenImport.ts',
    regel: 'Kam dieselbe Woche noch einmal, wird weder gesprungen noch zugeteilt — es gibt keine neue.',
    suchen: '    if (!zuteilen || !neu) return\n',
    ersetzen: '    if (!zuteilen) return\n',
  },
  {
    id: 'holen-abgebrochen-verfaellt',
    datei: 'src/planen/ProgrammHolen.tsx',
    regel: 'Wird das Blatt geschlossen, während geholt wird, kommt es mit dem Ergebnis nicht von selbst zurück.',
    suchen: '      if (lauf.current === nr) setStand(',
    ersetzen: '      if (nr > 0) setStand(',
  },
  {
    id: 'holen-offline-kein-blatt',
    datei: 'src/planen/ProgrammHolen.tsx',
    regel: 'Offline öffnet „Holen" kein Blatt — es sagt nur, dass gerade nichts geht.',
    suchen: '    if (!holenMoeglich()) return\n',
    ersetzen: '    holenMoeglich()\n',
  },
  {
    id: 'wochen-ab-heute',
    datei: 'src/planen/wochen-uebersicht.ts',
    regel: 'Vergangene Wochen stehen nicht unter den Wochen — am Montag rückt die Liste weiter.',
    suchen: '    if (sonntag === null || sonntag < heuteMs) return\n',
    ersetzen: '    if (sonntag === null) return\n',
  },
  {
    id: 'wochen-lage-probleme-vorn',
    datei: 'src/planen/wochen-uebersicht.ts',
    regel: 'Probleme stehen vor offenen Plätzen — dieselbe Rangfolge wie die Chips der Planungs-Karte.',
    suchen: "  if (probleme > 0) return { art: 'probleme', n: probleme }\n",
    ersetzen: '',
  },
  {
    id: 'wochen-holen-nach-der-letzten',
    datei: 'src/planen/wochen-uebersicht.ts',
    regel: '„Holen" nennt die Woche nach der spätesten geladenen — wie `import-week` sie wählt.',
    suchen: '  return letzte ? montagNach(letzte, 1) : montagVon(isoDay(heute))\n',
    ersetzen: '  return montagVon(isoDay(heute))\n',
  },
  {
    id: 'wochen-spalte-behaelt-reiter',
    datei: 'src/planen/WochenUebersicht.tsx',
    regel: 'In der Spalte neben dem Plan wechselt ein Tipp nur die Woche — Zusammenkunft oder Treffpunkte bleiben.',
    suchen: '    dispatch({ type: \'navigate\', screen: \'planen\', woche: { wi: k.wi, tab: spalte ? state.tab : k.stand.tab } })\n',
    ersetzen: "    dispatch({ type: 'navigate', screen: 'planen', woche: { wi: k.wi, tab: k.stand.tab } })\n",
  },
  {
    id: 'wochen-spalte-nur-wer-zuteilt',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'Die Wochen neben dem Plan bekommt nur, wer zuteilt — nicht der Gruppenaufseher.',
    suchen: '  const wochenSpalte = useMedia(WOCHEN_SPALTE_BREITE) && rechte.zuteilen\n',
    ersetzen: '  const wochenSpalte = useMedia(WOCHEN_SPALTE_BREITE)\n',
  },
  {
    id: 'planung-menue-nach-breite',
    datei: 'src/app/AppShell.tsx',
    regel: '„Planung" führt dorthin, wo die Wochen stehen: wo die Spalte passt, ins Planen, sonst auf ihre Seite.',
    suchen: "dispatch(planungsThema === 'zusammenkuenfte' ? zurPlanung(wochenSpalte) : zumPlanen(planungsThema))",
    ersetzen: "dispatch(planungsThema === 'zusammenkuenfte' ? zurPlanung(false) : zumPlanen(planungsThema))",
  },
  {
    id: 'leere-versammlung-beim-planer',
    datei: 'src/app/AppShell.tsx',
    regel: 'Die leere Versammlung steht auch dem Planer offen — er holt das erste Programm.',
    suchen: '  if (state.dataEmpty && !rechteVon(state).zuteilen) return <StatusView kind="empty" />\n',
    ersetzen: '  if (state.dataEmpty && !state.planner) return <StatusView kind="empty" />\n',
  },
  {
    id: 'schema-fs-weeks-trigger-planer',
    datei: 'supabase/schema.sql',
    regel: 'Der Trigger der Treffpunkt-Wochen lässt Admin und Planer alles ändern.',
    suchen: '  if auth.uid() is null or public.darf_zuteilen() then\n    return new;\n  end if;\n  if tg_op = \'UPDATE\' then\n    vorher := old.data;',
    ersetzen: '  if auth.uid() is null or public.is_planner() then\n    return new;\n  end if;\n  if tg_op = \'UPDATE\' then\n    vorher := old.data;',
  },
  {
    id: 'schema-fs-weeks-planer-loescht',
    datei: 'supabase/schema.sql',
    regel: 'Eine Treffpunkt-Woche ganz schreiben und löschen Admin und Planer.',
    suchen: '  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())\n  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());\n\ndrop policy if exists fs_weeks_einfuegen',
    ersetzen: '  using (congregation_id = public.my_congregation_id() and public.is_planner())\n  with check (congregation_id = public.my_congregation_id() and public.is_planner());\n\ndrop policy if exists fs_weeks_einfuegen',
  },
  {
    id: 'schema-gruppenbesuche-wer-plant',
    datei: 'supabase/schema.sql',
    regel: 'Gruppenbesuche planen Admin und Planer ganz.',
    suchen: '  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())\n  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());\n\ndrop policy if exists gruppenbesuche_besucher on',
    ersetzen: '  using (congregation_id = public.my_congregation_id() and public.is_planner())\n  with check (congregation_id = public.my_congregation_id() and public.is_planner());\n\ndrop policy if exists gruppenbesuche_besucher on',
  },
  {
    id: 'schema-plaene-wer-plant',
    datei: 'supabase/schema.sql',
    regel: 'Weitere Pläne legen Admin und Planer an und ändern sie.',
    suchen: '  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())\n  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());\n\ndrop policy if exists plan_eintraege_select',
    ersetzen: '  using (congregation_id = public.my_congregation_id() and public.is_planner())\n  with check (congregation_id = public.my_congregation_id() and public.is_planner());\n\ndrop policy if exists plan_eintraege_select',
  },
  {
    id: 'mrp-planer-holt-woche',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Die Mitgliedsrechte-Probe misst, dass der Planer eine Woche anlegt (40).',
    suchen: '  await neueWocheVersuch(k, neu)\n',
    ersetzen: '',
  },
  {
    id: 'mrp-verwaltung-beim-admin',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Die Mitgliedsrechte-Probe misst, dass Personen und Einstellungen beim Admin bleiben (80, 81).',
    suchen: '    await verwaltungProben(k, verwaltung)\n',
    ersetzen: '',
  },
]

/**
 * **Sitzt noch jeder Anker?** — die billige Vorprüfung, ohne einen einzigen
 * Test: je Eintrag die Datei lesen und zählen, wie oft `suchen` darin steht.
 *
 * Rückgabe: die Einträge, bei denen es **nicht** genau einmal ist, je mit der
 * gezählten Zahl. Leer heißt: Der Katalog zeigt überall noch dorthin, wo er
 * hinzeigen soll. Dieselbe Prüfung fährt `scripts/mutationsprobe.test.ts` im
 * normalen Testlauf — dort kostet sie Millisekunden und hält einen Umbau am
 * selben Tag an, statt erst beim nächsten Durchgang Wochen später.
 */
export function ankerFehler() {
  const fehler = []
  for (const m of KATALOG) {
    const treffer = lies(join(wurzel, m.datei)).split(m.suchen).length - 1
    if (treffer !== 1) fehler.push({ id: m.id, datei: m.datei, treffer })
  }
  return fehler
}

// ── Lauf ────────────────────────────────────────────────────────────────────

/**
 * Den vitest des Projekts finden (siehe `werkzeugPfad`) — oder abbrechen,
 * bevor die erste Datei angefasst ist. Bis zum 26.9.2026 stand hier ein fester
 * Pfad in `<wurzel>/node_modules`; im Worktree zeigte er ins Leere.
 */
function vitestPfad() {
  try {
    return werkzeugPfad(wurzel, 'vitest')
  } catch (err) {
    console.error(`\n${err.message}\n`)
    process.exit(2)
  }
}

/**
 * Einen vollen Testlauf machen — oder mit `datei` nur diese eine Testdatei:
 * den Ausgangsstand eines Wächters (siehe `waechterBefund`). Rückgabe: was
 * `spawnSync` liefert — gewertet wird es in `testlaufBefund`.
 *
 * vitest wählt `datei` per Teilzeichenkette aus. Kein Testpfad ist heute Teil
 * eines anderen (gemessen am 3.10.2026, 212 Dateien); träfe der Filter einmal
 * mehr als eine, würde die Prüfung nur strenger, nicht nachgiebiger.
 *
 * **Kein `process.exit()` hier drin:** Während des Laufs steht die Mutation im
 * Quelltext. Abbrechen darf erst `main()`, wenn sie zurückgenommen ist — bis
 * zum 26.9.2026 brach ein Startfehler hier ab und ließ sie stehen.
 *
 * **Eine Minute Frist je Test statt der fünf Sekunden von vitest.** Unter Last
 * — auf diesem Rechner fahren oft mehrere Sitzungen gleichzeitig volle Suiten —
 * brauchen die Proben, die den Quelltext von der Platte lesen, ein Vielfaches
 * (gemessen bis 50 s). Sie reißen die Frist, und `--bail=1` schreibt ihnen die
 * gerade gebrochene Regel gut. Gemessen am 26.9.2026 bei 87–100 % CPU:
 * `kontakt-betreff-kodiert` ergab „bewacht (tests/kein-alter-app-name.test.ts,
 * 50s)", mit einer Minute Frist `src/login/kontakt.test.ts`. Kosten hat die
 * Frist nur, wo ein Test wirklich hängt.
 */
function testlauf(vitest, datei = null) {
  const auswahl = datei ? [datei] : []
  return spawnSync(process.execPath, [vitest, 'run', ...auswahl, '--reporter=dot', '--bail=1', '--testTimeout=60000'], {
    cwd: wurzel,
    encoding: 'utf8',
    /*
     * `MUTATIONSPROBE` sagt dem Testlauf, dass er gerade **innerhalb** der
     * Probe läuft. Nur die Ankerprüfung (`mutationsprobe.test.ts`) tritt dann
     * zurück: Sie verlangt, dass jedes `suchen` genau einmal dasteht — und
     * genau das macht die Mutation ja zunichte. Ohne diese Weiche wäre sie bei
     * **jeder** Mutation der erste rote Test, `--bail=1` bräche dort ab, und
     * die Probe schriebe allen 192 Regeln „bewacht" gut, ohne eine einzige
     * gemessen zu haben (am 21.9.2026 genau so passiert, 14 von 14).
     */
    env: { ...process.env, CI: 'true', MUTATIONSPROBE: '1' },
    maxBuffer: 64 * 1024 * 1024,
  })
}

/**
 * Die Summenzeilen, die vitest ans Ende jedes Laufs schreibt, der Tests
 * gesammelt hat — auch nach einem Abbruch durch `--bail=1`:
 *
 *      Test Files  1 failed | 31 passed | 5 skipped (194)
 *           Tests  1 failed | 2272 passed | 25 skipped (2401)
 *
 * In Klammern steht die Gesamtzahl. Wo vitest keinen einzigen Test gesehen
 * hat, steht dort „no tests" — ohne Zahl.
 */
const TESTERGEBNIS = /^\s*(?:Test Files|Tests)\s+.*\(\d+\)\s*$/m

/**
 * **Hat vitest überhaupt getestet?** Nur dann sagt sein Rot etwas über die
 * Regel.
 *
 * Bis zum 26.9.2026 galt jeder Rückgabewert ≠ 0 als rot, also als „bewacht".
 * Im Worktree zeigte der Pfad zu vitest ins Leere, Node endete an „Cannot find
 * module" mit 1 — und die Probe schrieb jeder Regel „bewacht (unbekannt, 0s)"
 * gut, ohne dass ein einziger Test gelaufen war.
 *
 * Seither zählt ein Lauf nur, wenn vitest bis zu seinen Summenzeilen kam
 * (`TESTERGEBNIS`), gleich mit welchem Rückgabewert: Fehlen sie, hat nicht
 * vitest gesprochen, sondern etwas davor. Ebenso wenig zählt ein Lauf, der
 * nicht zu starten war (`error`, auch ein zu voller Puffer) oder abgeschossen
 * wurde (Signal).
 *
 * **„Cannot find module" auf stderr beweist hier allein nichts.** Anders als
 * tsc schreibt vitest seinen Fehlerbericht selbst nach stderr — `FAIL`-Zeilen,
 * Meldungen, Quelltextauszüge —, dazu die Konsolenausgaben der Tests. Ein
 * Test, der an einem fehlenden Modul scheitert, trägt die Wendung also auch
 * (gemessen am 26.9.2026) und ist ein gewöhnliches Rot. Sie nennt den Grund
 * nur, wo keine Summenzeile dasteht.
 *
 * **Entfärbt.** vitest färbt seine Ausgabe unter Windows auch in eine Pipe —
 * nur nicht, wenn `NO_COLOR` gesetzt ist oder ein Agent sie liest
 * (`CLAUDECODE`, `AI_AGENT`). Farbig fand `ersterWaechter` keinen Wächter, und
 * die Summenzeilen begännen mit Farbcodes statt mit „Test Files": Gemessen am
 * 26.9.2026 ohne diese drei Variablen, also wie im eigenen Terminal,
 * `import-bibellesung` → „bewacht (unbekannt, 31s)"; unter dem Agenten stand
 * an derselben Stelle `parse.test.ts`.
 *
 * `lauf` ist, was `spawnSync` zurückgibt. Rein, damit `mutationsprobe.test.ts`
 * jeden dieser Fälle nachstellen kann, ohne vitest zu starten. Ergebnis:
 * `{ rot, waechter }` — oder `{ fehler }` mit dem Grund, warum der Lauf nichts
 * aussagt. `waechter` ist die erste rote Testdatei; `null` bei Grün und dort,
 * wo vitest keine nennt (ein unbehandelter Fehler macht den Lauf rot, ohne dass
 * ein Test scheitert).
 */
export function testlaufBefund(lauf) {
  if (lauf.error) return { fehler: `Der Testlauf scheiterte: ${lauf.error.message}` }
  if (lauf.status === null) return { fehler: `Der Testlauf wurde abgebrochen (${lauf.signal}).` }

  const stderr = stripVTControlCharacters(lauf.stderr ?? '')
  const ausgabe = `${stripVTControlCharacters(lauf.stdout ?? '')}${stderr}`
  if (!TESTERGEBNIS.test(ausgabe)) {
    const fehlt = stderr.split(/\r?\n/).find((z) => z.includes('Cannot find module'))
    if (fehlt) return { fehler: `vitest ist nicht gelaufen — Node fand ein Modul nicht:\n  ${fehlt.trim()}` }
    return {
      fehler: `vitest endete mit ${lauf.status}, aber ohne ein einziges Testergebnis — getestet hat es nicht:\n${auszug(ausgabe)}`,
    }
  }

  const rot = lauf.status !== 0
  return { rot, waechter: rot ? ersterWaechter(ausgabe) : null }
}

/**
 * **Belegt das Rot die Regel?** Nur, wenn sein Wächter ohne Mutation grün ist.
 *
 * Gemeldet wird die Datei, deren Test zuerst rot wird — nicht die, die es
 * wegen der Mutation wird. Ist eine Datei schon ohne Mutation rot, wird sie es
 * bei jeder, und vitest startet sie ab dem zweiten Lauf sogar zuerst: Zuletzt
 * Rotes kommt nach vorn (`BaseSequencer.sort`), `--bail=1` bricht dort ab.
 * Gemessen am 3.10.2026: drei Tests ohne Mutation rot, und die Probe meldete
 * „10/10 Regeln bewacht" — acht durch `src/app/reducer.test.ts`, für Regeln in
 * `PlanungsKarte.tsx`, `persist.ts` und `useAbwesend.ts`. Nach dem Grünmachen
 * nannte jede Regel ihren eigenen Wächter.
 *
 * `mutiert` ist der Befund des Laufs mit Mutation, `ausgang` der desselben
 * Wächters allein **ohne** Mutation, beide aus `testlaufBefund`. `ausgang`
 * zählt nur, wenn `mutiert` rot ist; nennt `mutiert` keinen Wächter, ist es
 * der Lauf über alle Testdateien. Ergebnis: `mutiert`, wenn sein Befund gilt —
 * sonst `{ fehler }`.
 */
export function waechterBefund(mutiert, ausgang) {
  if (!mutiert.rot) return mutiert
  const wer = mutiert.waechter ?? 'der Lauf über alle Testdateien'
  if (ausgang.fehler) {
    return { fehler: `Ob ${wer} auch ohne Mutation rot ist, ließ sich nicht prüfen:\n${ausgang.fehler}` }
  }
  if (ausgang.rot) {
    return {
      fehler:
        `Ausgangsstand rot — erst grün machen: ${wer} ist auch ohne Mutation rot,\n` +
        'sein Rot belegt die Regel nicht. Alle roten Dateien zeigt `npx vitest run --testTimeout=60000`.',
    }
  }
  return mutiert
}

/**
 * **Ein Lauf, der nichts gemessen hat, beendet die Probe** — mit 2 wie jeder
 * andere Fall, in dem sie nicht messen kann. Weiterzumachen hieße, die
 * nächsten Regeln genauso zu „messen".
 */
function nichtGemessen(zweifel, sekunden) {
  console.log(`NICHT GEMESSEN (${sekunden}s)`)
  console.error(`\n${zweifel}\n`)
  console.error('Die Mutation ist zurückgenommen. Abbruch, statt der Regel ein Ergebnis gutzuschreiben.')
  process.exit(2)
}

/** Aus der Ausgabe (ohne Farbcodes) die erste rote Testdatei ziehen — als Beleg, WER bewacht. */
function ersterWaechter(ausgabe) {
  const treffer = /(?:FAIL|❯|×)\s+([\w./-]+\.test\.tsx?)/.exec(ausgabe)
  return treffer?.[1] ?? null
}

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

function main() {
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

  /*
   * Vorprüfung über den GANZEN Katalog, nicht nur die Auswahl: Ein Eintrag, der
   * seine Stelle verloren hat, soll auch dann auffallen, wenn gerade ein anderer
   * gemessen wird.
   *
   * Gemeldet werden **alle** verrutschten Einträge auf einmal, nicht nur der
   * erste. Nach einem Umbau sind es selten einzelne — am 21.9.2026 waren es 16
   * (T112) —, und wer sie einen nach dem anderen erfährt, sucht sie einen nach
   * dem anderen.
   */
  const verrutscht = ankerFehler()
  if (verrutscht.length > 0) {
    console.error(
      `\n${verrutscht.length} von ${KATALOG.length} Einträgen finden ihre Stelle nicht mehr:\n`,
    )
    for (const f of verrutscht) {
      console.error(`  ${f.id.padEnd(34)} ${f.treffer}× in ${f.datei}`)
    }
    console.error(
      `\nErwartet ist genau 1×. Die Stellen haben sich verschoben. Einträge nachziehen\n` +
        `(oder streichen, wenn die Regel weggefallen ist) — nicht stillschweigend\n` +
        `überspringen: Solange einer bricht, misst die Probe gar nichts.\n`,
    )
    process.exit(2)
  }

  if (nurListe) {
    for (const m of auswahl) console.log(`${m.id.padEnd(32)} ${m.regel}`)
    console.log(`\n${auswahl.length} Einträge.`)
    process.exit(0)
  }

  // Nach `--liste`, das ohne vitest auskommt — und vor der ersten Mutation.
  const vitest = vitestPfad()

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

  /*
   * Der Ausgangsstand je Wächter (siehe `waechterBefund`), einmal je Durchgang.
   *
   * Je Wächter statt einmal die ganze Suite vorab: Ein Wächter allein kostet
   * 1–3 s, die Suite 41 s (gemessen am 3.10.2026, 212 Dateien, ohne
   * Fremdlast) — vorab fiele das bei jedem Aufruf an, auch für eine einzige
   * Regel. Und geprüft wird genau, was die Probe behauptet: dass DIESE Datei
   * der Mutation wegen rot wird.
   */
  const ausgaenge = new Map()
  const ausgangVon = (waechter) => {
    if (!ausgaenge.has(waechter)) ausgaenge.set(waechter, testlaufBefund(testlauf(vitest, waechter)))
    return ausgaenge.get(waechter)
  }

  const ergebnisse = []
  for (const [i, m] of auswahl.entries()) {
    const pfad = join(wurzel, m.datei)
    // Roh zum Zuruecklegen, mit LF zum Suchen — siehe `lies`.
    laufendeDatei = pfad
    laufenderInhalt = readFileSync(pfad, 'utf8')

    process.stdout.write(`[${i + 1}/${auswahl.length}] ${m.id} … `)
    writeFileSync(pfad, lies(pfad).replace(m.suchen, m.ersetzen))
    const start = Date.now()
    const lauf = testlauf(vitest)
    zuruecksetzen()

    // Den Wächter erst jetzt fragen: ohne Mutation — darum geht es.
    const befund = testlaufBefund(lauf)
    const urteil = waechterBefund(befund, befund.rot ? ausgangVon(befund.waechter) : undefined)
    const sekunden = Math.round((Date.now() - start) / 1000)
    if (urteil.fehler) nichtGemessen(urteil.fehler, sekunden)
    const { rot, waechter } = urteil
    ergebnisse.push({ ...m, rot, waechter })
    console.log(rot ? `bewacht (${waechter ?? 'unbekannt'}, ${sekunden}s)` : `UNBEWACHT (${sekunden}s)`)
  }

  const offen = ergebnisse.filter((e) => !e.rot)
  console.log(`\n${ergebnisse.length - offen.length}/${ergebnisse.length} Regeln bewacht.`)
  if (ausgaenge.size > 0) console.log(`Ausgangsstand: ${ausgaenge.size} Wächter ohne Mutation geprüft, alle grün.`)

  if (offen.length > 0) {
    console.log('\nUnbewacht — diese Regeln kann man entfernen, ohne dass ein Test es merkt:\n')
    for (const e of offen) console.log(`  ${e.id.padEnd(32)} ${e.datei}\n${' '.repeat(36)}${e.regel}`)
    process.exit(1)
  }
}

/**
 * **Nur losmessen, wenn jemand das Skript wirklich gestartet hat.**
 *
 * `scripts/mutationsprobe.test.ts` importiert diese Datei wegen `ankerFehler`.
 * Ohne diese Weiche liefe beim Import die ganze Probe an — mitten im Testlauf,
 * Quelldateien umschreibend, mit einem zweiten vitest darin.
 *
 * Der Pfadvergleich statt `import.meta.main`: Das gibt es erst ab Node 24.2,
 * und wo es fehlt, wäre es `undefined` — die Probe täte dann beim Aufruf
 * stillschweigend nichts. Unter Windows wird die Groß-/Kleinschreibung
 * ignoriert, sonst entschiede die Schreibweise des Aufrufs darüber, ob
 * gemessen wird.
 */
function selbstGestartet() {
  const eintrag = process.argv[1]
  if (!eintrag) return false
  const a = resolve(eintrag)
  const b = fileURLToPath(import.meta.url)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

if (selbstGestartet()) main()
