/**
 * **Was die Laufzeit-Messung lädt** (T167): Zustände der Entwicklerseite
 * `/demo.html` und die Fassungen, in denen jeder gemessen wird — Breite,
 * Sprache, Darstellung, Schriftstufe.
 *
 * Ein Zustand ist ein Hash der Seite (`parseDebugHash` in
 * `tests/testdaten/demo-start.ts`). Dass jeder Bildschirm, jeder Reiter und
 * jede Rolle darin vorkommt und jeder Schalter verstanden wird, prüft
 * `laufzeit-auftraege.test.ts` gegen die App — eine Liste, in die sich Neues
 * selbst eintragen müsste, liefe sonst still auseinander.
 */

/** Je Zustand ein Hash ohne Sprache (`l`), Darstellung (`t`) und Schriftstufe (`fs`). */
export const ZUSTAENDE = [
  // Verkündiger (pl=0) — p9 ist Verkündiger, p12 hat eine Tauschanfrage offen,
  // p7 sieht freie Plätze, p1 ist Gruppenaufseher.
  's=login',
  's=login&ohnevers=1',
  's=start&pl=0&me=p9',
  's=start&pl=0&me=p12',
  's=start&pl=0&me=p9&vorlage=1',
  's=aufgaben&pl=0&me=p9',
  's=freie&pl=0&me=p7',
  's=mitteilungen&pl=0&me=p9',
  's=profil&pl=0&me=p9',
  's=profil&pl=0&me=p9&konto=1',
  's=programm&tab=mid&pl=0&me=p9',
  's=programm&tab=we&pl=0&me=p9',
  's=programm&tab=fs&fb=treffpunkte&pl=0&me=p9',
  's=programm&tab=fs&fb=gruppenbesuche&pl=0&me=p9',
  's=programm&tab=fs&fb=trolleys&pl=0&me=p9',
  's=programm&tab=wp&pl=0&me=p9',
  's=planen&tab=fs&pl=0&me=p1',
  's=programm&tab=mid&stale=5',
  's=programm&tab=mid&stale=5&langsam=1&me=p9',
  // Admin (ohne pl) — p6 ist Dienstamtgehilfe und plant mit.
  's=start&me=p9',
  's=aufgaben&me=p9',
  's=planung&me=p6',
  's=wochen&me=p6',
  's=planen&tab=mid',
  's=planen&tab=we',
  's=planen&tab=fs',
  's=planen&tab=zusagen&me=p6',
  's=planen&tab=fs&fb=gruppenbesuche&me=p6',
  's=planen&tab=fs&fb=grundplan&me=p6',
  's=planen&tab=wp&me=p6',
  's=auswertung&me=p6&uhr=2026-10-12',
  's=personen',
  's=personen&p=p1',
  's=personen&konto=1',
  's=personen&p=p1&konto=1',
  's=einstellungen',
  's=mitteilungen&me=p6',
  's=profil&me=p6&konto=1',
  // Planer (pl=2): plant alles, Personen und Einstellungen nicht.
  's=start&pl=2&me=p6',
  's=planen&tab=mid&pl=2&me=p6',
  's=planung&pl=2&me=p6',
  's=personen&pl=2&me=p6',
  's=einstellungen&pl=2&me=p6',
]

/**
 * **Die Blätter** (T173): Was ein Tipp öffnet, sieht die Messung nur, wenn sie
 * es öffnet — über den Hash (`blatt=`, `tests/testdaten/demo-start.ts`) oder
 * per Klick, wo das Blatt seinen Zustand im Baustein hält (Programm, Plan
 * senden, Drucken). `warten` muss danach dastehen, sonst ist der Lauf nicht
 * bereit: Bliebe das Blatt zu, mäße die Messung still den Bildschirm darunter.
 * Die Klicks sind Klassen, keine Wörter — sie gelten in jeder Sprache.
 *
 * @type {{ name: string, zustand: string, klicks?: string[], warten: string }[]}
 */
export const BLATT_ZUSTAENDE = [
  { name: 'Aufgabe', zustand: 's=aufgaben&pl=0&me=p9&blatt=aufgabe', warten: '[role="dialog"] .aufgabe-handlungen' },
  { name: 'Absage', zustand: 's=aufgaben&pl=0&me=p9&blatt=absage', warten: '.sheet-inhalt.absage' },
  { name: 'Tauschen', zustand: 's=aufgaben&pl=0&me=p12&blatt=tausch', warten: '.tausch-blatt' },
  { name: 'S-89', zustand: 's=aufgaben&pl=0&me=p9&blatt=s89', warten: '.s89-box' },
  { name: 'Zuteilen', zustand: 's=planen&tab=mid&me=p9&blatt=zuteilen', warten: '.zuteilen-zeile' },
  { name: 'Sprache', zustand: 's=einstellungen&blatt=sprache', warten: '.lang-list' },
  { name: 'Woche einrichten', zustand: 's=planen&tab=mid', klicks: ['.meeting-tab--icon'], warten: '.einrichten-karte' },
  { name: 'Programm', zustand: 's=planen&tab=mid', klicks: ['.meeting-tab--icon', '.einrichten-verweis'], warten: '.sheet-inhalt.programm' },
  {
    name: 'Programmpunkt',
    zustand: 's=planen&tab=mid',
    klicks: ['.meeting-tab--icon', '.einrichten-verweis', '.programm-zeile.is-bearbeitbar'],
    warten: '.sheet-inhalt.programmpunkt',
  },
  { name: 'Automatisch', zustand: 's=planen&tab=mid', klicks: ['.aktion-neben'], warten: '.sheet-inhalt.automatisch' },
  { name: 'Plan senden', zustand: 's=planen&tab=mid', klicks: ['.aktion-haupt'], warten: '.sheet-inhalt.senden' },
  { name: 'Drucken', zustand: 's=programm&tab=mid&pl=0&me=p9', klicks: ['.druck-knopf'], warten: '.druck-optionen' },
]

/**
 * Je Bildschirmart ein Zustand mit viel Text — er läuft im vollen Satz in jeder
 * weiteren Sprache (Wortlängen, Schrift, Leserichtung) und wärmt vor jedem
 * Satz den Dev-Server an.
 */
export const SPRACH_ZUSTAENDE = [
  's=start&me=p9',
  's=planen&tab=mid',
  's=profil&pl=0&me=p9&konto=1',
  's=personen&p=p1',
  's=programm&tab=fs&fb=trolleys&pl=0&me=p9',
  's=auswertung&me=p6&uhr=2026-10-12',
]

/** Die App-Sprachen außer Deutsch und Arabisch — die fährt jeder Satz mit allen Zuständen. */
export const WEITERE_SPRACHEN = ['en', 'es', 'fr', 'it', 'pl', 'ru', 'uk', 'ro', 'tr', 'fa']

/** Die Breiten von schmalem Handy bis breitem Bildschirm. */
export const BREITEN = [320, 375, 768, 1024, 1180, 1440]

/**
 * `versammlung` ist die Sprache der Versammlung (jw.org-Code, `c=` im Hash) —
 * in ihr stehen die Programmtexte, ausgezeichnet mit ihrem `lang`.
 *
 * @typedef {{ breite: number, sprache: string, darstellung: 'hell' | 'dunkel', schrift: string, versammlung: string }} Fassung
 * @typedef {Fassung & { zustand: string, blatt?: string, klicks?: string[], warten?: string }} Auftrag
 */

/** @returns {Fassung} */
export const fassung = (
  /** @type {number} */ breite,
  /** @type {string} */ sprache,
  /** @type {'hell' | 'dunkel'} */ darstellung,
  /** @type {string} */ schrift,
  versammlung = 'de',
) => ({ breite, sprache, darstellung, schrift, versammlung })

/**
 * **Die Sätze.** `kern` läuft nach jedem Push in der CI und soll wenige Minuten
 * dauern: jeder Zustand am schmalsten Handy mit der größten Schrift, am breiten
 * Bildschirm und von rechts nach links. `voll` fährt man von Hand.
 *
 * Von rechts nach links mit **russischer Versammlung** (T173): Arabische
 * Oberfläche und kyrillisches Programm unterscheiden sich in der Schrift, und
 * so sieht die Sprachprüfung beide Richtungen — Oberfläche im `lang` des
 * Programms und Programm ohne sein `lang`.
 *
 * @type {Record<string, { fassungen: Fassung[], sprachen: string[] }>}
 */
export const SAETZE = {
  kern: {
    fassungen: [fassung(320, 'de', 'dunkel', '1.45'), fassung(1440, 'de', 'hell', '1'), fassung(375, 'ar', 'hell', '1', 'ru')],
    sprachen: [],
  },
  voll: {
    fassungen: [
      ...BREITEN.map((b) => fassung(b, 'de', 'hell', '1')),
      fassung(320, 'de', 'dunkel', '1.45'),
      fassung(768, 'de', 'dunkel', '1.45'),
      fassung(1440, 'de', 'dunkel', '1.45'),
      fassung(375, 'ar', 'hell', '1', 'ru'),
      fassung(1024, 'ar', 'hell', '1'),
      fassung(375, 'de', 'hell', '1', 'ar'),
    ],
    sprachen: WEITERE_SPRACHEN,
  },
}

/**
 * Die Aufträge eines Satzes, gefiltert über `nur` (ein regulärer Ausdruck auf
 * den Namen des Auftrags, etwa `personen` oder `320 px`).
 *
 * @param {string} satz
 * @param {string} [nur]
 * @returns {Auftrag[]}
 */
export function auftraege(satz, nur) {
  const s = SAETZE[satz]
  if (!s) throw new Error(`Unbekannter Satz „${satz}" — ${Object.keys(SAETZE).join(' oder ')}.`)
  /** @type {Auftrag[]} */
  const liste = ZUSTAENDE.flatMap((zustand) => s.fassungen.map((f) => ({ zustand, ...f })))
  for (const { name, ...blatt } of BLATT_ZUSTAENDE) for (const f of s.fassungen) liste.push({ ...blatt, blatt: name, ...f })
  for (const sprache of s.sprachen) for (const zustand of SPRACH_ZUSTAENDE) liste.push({ zustand, ...fassung(375, sprache, 'hell', '1') })
  if (!nur) return liste
  const muster = new RegExp(nur)
  return liste.filter((a) => muster.test(auftragsName(a)))
}

/** Der Hash, mit dem die Entwicklerseite einen Auftrag lädt. */
export const hashVon = (/** @type {Auftrag} */ a) => `${a.zustand}&l=${a.sprache}&c=${a.versammlung}&t=${a.darstellung}&fs=${a.schrift}`

/** Wie ein Auftrag in Berichten heißt — die deutsche Versammlung ohne Zusatz. */
export const auftragsName = (/** @type {Auftrag} */ a) =>
  `${a.zustand}${a.blatt ? ` › ${a.blatt}` : ''} · ${a.breite} px · ${a.sprache}${a.versammlung === 'de' ? '' : ` · Versammlung ${a.versammlung}`} · ${a.darstellung} · Stufe ${a.schrift}`
