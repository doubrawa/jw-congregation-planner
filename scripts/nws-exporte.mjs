/**
 * **Die Exporte von New World Scheduler lesen** — die Personenliste (CSV) und
 * die Wochenübersicht eines Monats (Word).
 *
 * NWS legt seine Daten verschlüsselt ab, und der Schlüssel dazu liegt nicht
 * mehr offen auf dem Rechner. Lesbar ist, was NWS selbst exportiert: die
 * Personen als CSV und die Wochenübersicht als docx — mit allen Zuteilungen
 * beider Zusammenkünfte, den Hilfsdiensten und der Reinigung. Abwesenheiten
 * exportiert NWS nicht.
 *
 * Gelesen wird in die Formen, die die Importe schon kennen:
 * `wochenAusUebersicht` in die Zwischenform von `sammleNwsWochen`
 * (wochenplanung-importieren.mjs), `personenAlsNws` in die Felder der
 * NWS-Personentabelle, aus denen `baueStammdaten` (build-personen-sql.mjs in
 * nws-export) die Personen der App ableitet. Reine Funktionen bis auf
 * `docxDokument`.
 *
 * Die Wochenübersicht ist auf Deutsch exportiert: Abschnitte und Zeilen werden
 * an ihren deutschen Beschriftungen erkannt. Was hier unbekannt ist, bricht ab,
 * statt still wegzufallen.
 */

import fs from 'node:fs'
import zlib from 'node:zlib'
import { decodeEntities } from '../supabase/functions/import-week/text.ts'

/* ===================== CSV ================================================= */

/**
 * CSV nach RFC 4180 — Felder in Anführungszeichen dürfen Kommas, Zeilenumbrüche
 * und verdoppelte Anführungszeichen enthalten (NWS schreibt Notizen so). Ein BOM
 * am Anfang fällt weg. Liefert je Zeile ein Objekt über die Kopfzeile.
 */
export function csvLesen(text) {
  // Ein BOM am Anfang (U+FEFF) gehört nicht zum Namen der ersten Spalte.
  const s = String(text).charCodeAt(0) === 0xfeff ? String(text).slice(1) : String(text)
  const zeilen = []
  let feld = ''
  let zeile = []
  let inQuote = false
  const zeileFertig = () => {
    zeile.push(feld)
    feld = ''
    if (zeile.some((f) => f !== '')) zeilen.push(zeile)
    zeile = []
  }
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuote) {
      if (c !== '"') feld += c
      else if (s[i + 1] === '"') {
        feld += '"'
        i++
      } else inQuote = false
    } else if (c === '"') inQuote = true
    else if (c === ',') {
      zeile.push(feld)
      feld = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      zeileFertig()
    } else feld += c
  }
  if (feld !== '' || zeile.length) zeileFertig()
  const [kopf = [], ...rest] = zeilen
  return rest.map((z) => Object.fromEntries(kopf.map((k, i) => [k, z[i] ?? ''])))
}

/**
 * Die Personenliste hat Personen und diese Spalten — sonst Abbruch. Eine
 * fehlende Spalte läse sich sonst bei jeder Person still als leer.
 */
function spaltenPruefen(zeilen, spalten) {
  if (!zeilen.length) throw new Error('Personenliste: keine Personen.')
  const fehlt = spalten.filter((s) => !Object.hasOwn(zeilen[0], s))
  if (fehlt.length) throw new Error(`Personenliste: Spalte fehlt — ${fehlt.join(', ')}.`)
}

/* ===================== docx (ZIP) ========================================== */

/**
 * Eine Datei aus einem ZIP-Archiv — ein docx ist eines. `null`, wenn es sie
 * nicht gibt.
 *
 * Gelesen über das zentrale Verzeichnis am Ende, nicht über die lokalen Köpfe:
 * Schreibt ein Programm die Größe erst hinter die Daten (Bit 3), steht sie nur
 * dort. Gespeichert (0) und Deflate (8) — mehr verwendet Word nicht.
 */
export function zipEintrag(buf, name) {
  let ende = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      ende = i
      break
    }
  }
  if (ende < 0) throw new Error('Kein ZIP-Archiv (kein Ende des zentralen Verzeichnisses).')
  const anzahl = buf.readUInt16LE(ende + 10)
  let p = buf.readUInt32LE(ende + 16)
  for (let n = 0; n < anzahl; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP: zentrales Verzeichnis beschädigt.')
    const methode = buf.readUInt16LE(p + 10)
    const groesse = buf.readUInt32LE(p + 20)
    const nameLaenge = buf.readUInt16LE(p + 28)
    const weiter = 46 + nameLaenge + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
    if (buf.toString('utf8', p + 46, p + 46 + nameLaenge) === name) {
      const lokal = buf.readUInt32LE(p + 42)
      if (buf.readUInt32LE(lokal) !== 0x04034b50) throw new Error(`ZIP: lokaler Kopf von ${name} fehlt.`)
      const start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28)
      const daten = buf.subarray(start, start + groesse)
      if (methode === 0) return Buffer.from(daten)
      if (methode === 8) return zlib.inflateRawSync(daten)
      throw new Error(`ZIP: Kompression ${methode} wird nicht unterstützt (${name}).`)
    }
    p += weiter
  }
  return null
}

/** Der Text eines Word-Dokuments (`word/document.xml`). */
export function docxDokument(pfad) {
  const xml = zipEintrag(fs.readFileSync(pfad), 'word/document.xml')
  if (!xml) throw new Error(`${pfad}: kein Word-Dokument (word/document.xml fehlt).`)
  return xml.toString('utf8')
}

/* ===================== Namen =============================================== */

/** Zeichen ohne Breite: weicher Trennstrich, U+200B bis U+200D, Wortverbinder (U+2060), BOM. */
const OHNE_BREITE = new RegExp(`[${[0xad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff].map((c) => String.fromCharCode(c)).join('')}]`, 'g')

/**
 * Ein Name so, wie er verglichen wird: Leerraum jeder Art zu einem Leerzeichen,
 * ohne Rand, weiche Trennstriche und Zeichen ohne Breite entfernt. NWS führt
 * Vornamen vereinzelt mit einem Leerzeichen am Ende, und der Export setzt
 * Vor- und Nachname mit einem Leerzeichen dazwischen zusammen — ungeglättet
 * fände sich die Person nie.
 */
export function namensForm(text) {
  // `\s` erfasst das geschützte Leerzeichen (U+00A0), U+2007 und U+202F mit.
  return String(text ?? '').replace(OHNE_BREITE, '').replace(/\s+/g, ' ').trim()
}

/**
 * Text → NWS-`PersonID` über die Personenliste: Vor- und Nachname, wie die
 * Wochenübersicht sie meistens schreibt (der Nachname mit NWS-Zähler), oder der
 * Anzeigename, den sie bei manchen nimmt. Ein Text, der zu zwei Personen passt,
 * ergibt `null` — geraten wird nicht.
 */
export function exportNamensAufloeser(zeilen) {
  spaltenPruefen(zeilen, ['PersonID', 'FirstName', 'LastName', 'DisplayName'])
  const nachText = new Map()
  const merken = (text, id) => {
    const k = namensForm(text)
    if (!k) return
    if (!nachText.has(k)) nachText.set(k, new Set())
    nachText.get(k).add(id)
  }
  for (const z of zeilen) {
    const id = String(z.PersonID ?? '').trim()
    if (!id) continue
    merken(`${z.FirstName ?? ''} ${z.LastName ?? ''}`, id)
    merken(z.DisplayName, id)
  }
  const treffer = (text) => nachText.get(namensForm(text))
  return {
    idZu: (text) => {
      const ids = treffer(text)
      return ids && ids.size === 1 ? [...ids][0] : null
    },
    mehrdeutig: (text) => (treffer(text)?.size ?? 0) > 1,
    /** Jeder Text, unter dem die Liste eine Person führt, geglättet. */
    namen: new Set(nachText.keys()),
  }
}

/* ===================== Personen ============================================ */

/** CSV-Spalte → Feld der NWS-Personentabelle; gemessen an 113 Personen, Feld für Feld gleich. */
export const PERSONEN_FLAGS = {
  bk: 'UseForChairman', cb: 'UseForWeekendChairman', bm: 'UseForPrayers', bl: 'UseForAuxiliaryCounselor',
  bo: 'UseForTreasuresTalk', bp: 'UseForTreasuresGems', bq: 'UseForTreasuresBR',
  br: 'UseForApplyIC', bs: 'UseForApplyRV', bt: 'UseForApplyBS', ee: 'UseForApplyExplaining',
  bv: 'UseForApplyStudentTalk', bu: 'UseForApplyAssistant', bw: 'UseForLivingParts',
  bx: 'UseForCBS', by: 'UseForCBSReader', cq: 'UseForConductFSGroups', cp: 'UseForPublicWitnessing',
  ch: 'UseForDuty1', ci: 'UseForDuty2', dk: 'UseForDuty3', cj: 'UseForDuty4', ck: 'UseForDuty5', cl: 'UseForDuty6',
}

/** Dienstvorrecht wie NWS es zählt (`u`): Ältester 2, Dienstamtgehilfe 1, Verkündiger 0. */
const VORRECHT = { E: 2, MS: 1, PUB: 0, UBP: 3, No: 4 }
/** Verantwortung in der Gruppe (`x`). */
const VERANTWORTUNG = { Overseer: 1, Assistant: 2, None: 0 }
const GESCHLECHT = { Male: 0, Female: 1 }
const JA_NEIN = { True: true, False: false }

/** Die Spalten, aus denen `personenAlsNws` liest. */
const PERSONEN_SPALTEN = [
  'PersonID', 'FirstName', 'LastName', 'DisplayName', 'FamilyID', 'Gender', 'Privilege',
  'GroupResponsibility', 'FieldServiceGroupID', 'GroupName', 'Active', 'CLMStudent', ...Object.values(PERSONEN_FLAGS),
]

/** Eine Zahl, wo NWS eine führt — „0" ist dann falsch wie in NWS selbst (kein Haushalt). */
const zahl = (s) => (/^\d+$/.test(String(s).trim()) ? Number(String(s).trim()) : String(s).trim())

/**
 * Ein Wert aus einer festen Menge; ein unbekannter bricht ab. Still als „nein"
 * oder Verkündiger gelesen, verlöre nach einem geänderten Export jede Person
 * ihre Bereiche, und das Zurücksetzen spielte es ohne Meldung ein. Gemessen am
 * 2.11.2026 kamen nur diese Werte vor.
 */
function wert(menge, z, spalte) {
  const v = String(z[spalte]).trim()
  if (!Object.hasOwn(menge, v)) throw new Error(`Personenliste: unbekannter Wert „${v}" in ${spalte} (PersonID ${z.PersonID}).`)
  return menge[v]
}

/**
 * Die Personenliste in den Feldern der NWS-Personentabelle (`Persons_7.5.json`),
 * dazu die Gruppen (`FieldServiceGroups_7.5.json`: `ID`, Name in `a`).
 *
 * `Active` steht dort umgekehrt: NWS führt `ab: false` nur bei Inaktiven. Mit
 * `ab: true` für Aktive bleibt jede Prüfung `ab !== false` gleich.
 */
export function personenAlsNws(zeilen) {
  spaltenPruefen(zeilen, PERSONEN_SPALTEN)
  const persons = zeilen.map((z) => {
    const p = {
      ID: zahl(z.PersonID),
      a: z.FirstName,
      b: z.LastName,
      d: z.DisplayName,
      f: zahl(z.FamilyID),
      t: wert(GESCHLECHT, z, 'Gender'),
      u: wert(VORRECHT, z, 'Privilege'),
      x: wert(VERANTWORTUNG, z, 'GroupResponsibility'),
      ax: zahl(z.FieldServiceGroupID),
      ab: wert(JA_NEIN, z, 'Active'),
      ag: wert(JA_NEIN, z, 'CLMStudent'),
    }
    for (const [feld, spalte] of Object.entries(PERSONEN_FLAGS)) p[feld] = wert(JA_NEIN, z, spalte)
    return p
  })
  const gruppen = new Map()
  for (const z of zeilen) {
    const id = zahl(z.FieldServiceGroupID)
    if (id !== '' && !gruppen.has(id)) gruppen.set(id, String(z.GroupName).trim())
  }
  return { persons, groups: [...gruppen].map(([ID, a]) => ({ ID, a })) }
}

/* ===================== Wochenübersicht ===================================== */

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

/** Monat und Jahr aus dem Dateinamen („… November 2026 Wochenübersicht.docx"). */
export function monatAusDateiname(name) {
  const m = new RegExp(`(${MONATE.join('|')})\\s+(\\d{4})`).exec(name)
  return m ? { monat: MONATE.indexOf(m[1]) + 1, jahr: Number(m[2]) } : null
}

/**
 * Montag einer Woche aus ihrem Kopf („November 02-08", „November 30-Dezember 06")
 * und dem Monat der Datei. Die erste Woche einer Januar-Datei kann im Dezember
 * des Vorjahres beginnen.
 */
export function montagAusKopf(kopf, jahr, monat) {
  const m = /^(\p{L}+)\s+(\d{1,2})/u.exec(namensForm(kopf))
  const kopfMonat = m ? MONATE.indexOf(m[1]) + 1 : 0
  if (kopfMonat < 1) throw new Error(`Wochenkopf nicht lesbar: „${kopf}"`)
  const j = monat === 1 && kopfMonat === 12 ? jahr - 1 : jahr
  const iso = `${j}-${String(kopfMonat).padStart(2, '0')}-${m[2].padStart(2, '0')}`
  if (new Date(`${iso}T12:00:00Z`).getUTCDay() !== 1) throw new Error(`Wochenkopf „${kopf}" beginnt nicht an einem Montag (${iso}).`)
  return iso
}

/**
 * Eine Zelle: ihre Absätze als Texte (ein Absatz je Zeile in der Zelle).
 * Entitäten in einem Durchlauf (`decodeEntities`) — NWS schreibt „&amp;"
 * zwischen zwei Namen.
 */
function zelle(xml) {
  const absaetze = (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) =>
    [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
      .map((m) => (m[1] !== undefined ? decodeEntities(m[1]) : ' '))
      .join('')
      .trim(),
  )
  const text = absaetze.filter(Boolean)
  return { text: text.join(' '), absaetze: text }
}

/** Die Tabellen des Dokuments als Zeilen von Zellen. Verschachtelte Tabellen kommen nicht vor. */
function tabellenVon(xml) {
  return (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []).map((tbl) => {
    if (tbl.indexOf('<w:tbl>', 1) > 0) throw new Error('Wochenübersicht: verschachtelte Tabelle — unbekanntes Format.')
    return (tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).map((r) => (r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map(zelle))
  })
}

const leer = (z) => !z || !z.text || z.text === '·'

/** Die Abschnitte einer Woche — jede Tabelle nach dem Wochenkopf ist einer. */
const ABSCHNITTE = new Set([
  'Zusammenkunft unter der Woche', 'Dienste unter der Woche', 'Zusammenkunft am Wochenende',
  'Dienste am Wochenende', 'Reinigung', 'Predigtdienst',
])

/** Hilfsdienst-Beschriftung → kanonischer Dienstschlüssel (`DUTY_KEY` im Import). */
const HELFER = { Saalordner: 'saal', Türordner: 'eingang', Rundgangsordner: 'rund', Mikrofone: 'mik', 'Audio/Video': 'ton', Zoomordner: 'zoom' }

function neueWoche() {
  return {
    mid: {
      chairman: null, openingPrayer: null, closingPrayer: null, auxCounselor: null,
      treasuresTalk: null, spiritualGems: null, bibleReading: null,
      apply: [], living: [], cbs: null, cbsReader: null, helpers: {}, cleaning: null,
      ablauf: [], kreisaufseher: null,
    },
    we: { chairman: null, watchtowerReader: null, speaker: null, openingSong: null, closingSong: null, helpers: {}, cleaning: null },
  }
}

/** „A & B & C" → [A, B, C]. */
const namenListe = (z) => (leer(z) ? [] : z.text.split(/\s*&\s*/).map(namensForm).filter(Boolean))

/**
 * Ein Programmpunkt, wie die Wochenübersicht ihn schreibt: „7. Titel (13 Min.)".
 *
 * **Die Nummer sagt, woher der Punkt kommt.** NWS nummeriert die Punkte des
 * Arbeitshefts durch; einen eigenen Punkt der Versammlung schreibt es ohne
 * Nummer — einen eingeschobenen („Kreiskongress Wiederholung") ebenso wie einen
 * Punkt des Hefts, dem die Versammlung ein eigenes Thema gegeben hat. Dann fehlt
 * dessen Nummer in der Zählung (gemessen an den Exporten vom 2.11.2026).
 * Minuten ohne Angabe bleiben `null`.
 */
export function programmPunkt(text) {
  const m = /^(?:(\d+)\.\s*)?(.*?)\s*(?:\((\d+)\s*Min\.\))?$/.exec(namensForm(text))
  return { nr: m?.[1] ? Number(m[1]) : null, titel: m?.[2] ?? '', min: m?.[3] ? Number(m[3]) : null }
}

function mitte(w, zeilen, name) {
  let abschnitt = ''
  let haupt = -1
  for (const z of zeilen) {
    const t0 = z[0]?.text ?? ''
    if (t0 === 'Vorsitzender') {
      w.chairman = leer(z[1]) ? null : name(z[1].text)
      if (z[2]?.text === 'Anfangsgebet') w.openingPrayer = leer(z[3]) ? null : name(z[3].text)
      continue
    }
    if (z[2]?.text === 'Schlussgebet') {
      w.closingPrayer = leer(z[3]) ? null : name(z[3].text)
      continue
    }
    if (z.length === 1) {
      if (!/^(Schätze aus Gottes Wort|Uns im Dienst verbessern|Unser Leben als Christ)$/.test(t0)) {
        throw new Error(`Wochenübersicht: unbekannter Abschnitt „${t0}".`)
      }
      abschnitt = t0
      continue
    }
    if (!t0 && z.some((c) => c.text === 'Hauptsaal')) {
      haupt = z.findIndex((c) => c.text === 'Hauptsaal')
      continue
    }
    // Bibellesung und Schülerteile führen eine Spalte je Raum; der Hauptsaal
    // zählt, ohne Raumzeile die letzte Spalte.
    const imHauptsaal = z.length > 2 ? z[haupt > 0 ? haupt : z.length - 1] : z[1]
    if (abschnitt === 'Schätze aus Gottes Wort') {
      if (/^1\./.test(t0)) w.treasuresTalk = leer(z[1]) ? null : name(z[1].text)
      else if (/^2\./.test(t0)) w.spiritualGems = leer(z[1]) ? null : name(z[1].text)
      else if (/Bibellesung/.test(t0)) w.bibleReading = leer(imHauptsaal) ? null : name(imHauptsaal.text)
      else throw new Error(`Wochenübersicht: unbekannter Programmpunkt „${t0}" unter „Schätze aus Gottes Wort".`)
      continue
    }
    if (abschnitt === 'Uns im Dienst verbessern') {
      const [student = null, assistant = null] = namenListe(imHauptsaal).map(name)
      w.apply.push({ student, assistant })
      continue
    }
    if (abschnitt === 'Unser Leben als Christ') {
      // Der Ablauf des Abschnitts geht mit: Hier ändert die Versammlung ihr
      // Programm — ein eingeschobener Punkt, ein eigenes Thema, andere Minuten,
      // in der Woche des Kreisaufsehers sein Vortrag statt des Bibelstudiums.
      const punkt = programmPunkt(t0)
      if (/Versammlungsbibelstudium/.test(t0)) {
        const rollen = z[1]?.absaetze ?? []
        const namen = z[2]?.absaetze ?? []
        rollen.forEach((r, i) => {
          if (r === 'Leiter') w.cbs = namen[i] ? name(namen[i]) : null
          if (r === 'Leser') w.cbsReader = namen[i] ? name(namen[i]) : null
        })
        w.ablauf.push({ ...punkt, art: 'vbs' })
        continue
      }
      const wer = z.length > 2 ? z[2] : z[1]
      // Der Vortrag des Kreisaufsehers steht anstelle des Bibelstudiums. Er ist
      // ein Gast: sein Name bleibt Text und kommt an keine Person.
      const ka = /^KA:\s*(.*)$/.exec(wer?.text ?? '')
      if (ka) {
        w.kreisaufseher = namensForm(ka[1]) || null
        w.ablauf.push({ ...punkt, art: 'ka' })
        continue
      }
      w.living.push(leer(wer) ? null : name(wer.text))
      w.ablauf.push({ ...punkt, art: 'teil' })
      continue
    }
    throw new Error(`Wochenübersicht: Zeile „${t0}" außerhalb eines Abschnitts.`)
  }
}

function helfer(zeilen, name, uebersprungen) {
  const out = {}
  for (const z of zeilen) {
    for (let i = 0; i + 1 < z.length; i += 2) {
      const beschriftung = z[i].text
      if (!beschriftung) continue
      const key = HELFER[beschriftung]
      if (!key) {
        if (!/^Benutzerdefiniert \d+$/.test(beschriftung)) throw new Error(`Wochenübersicht: unbekannter Dienst „${beschriftung}".`)
        if (!leer(z[i + 1])) uebersprungen.dienste++
        continue
      }
      const namen = namenListe(z[i + 1])
      if (namen.length) out[key] = namen.map(name)
    }
  }
  return out
}

function wochenende(we, zeilen, name, person) {
  let thema = null
  for (const z of zeilen) {
    const t0 = z[0]?.text ?? ''
    // Das Thema des Kreisaufsehers endet in NWS auf „ |" (Export vom 2.11.2026),
    // als stünde dahinter noch etwas — ein leerer Rest, kein Teil des Themas.
    if (t0 === 'Öffentlicher Vortrag') thema = leer(z[1]) ? null : z[1].text.replace(/\s*\|\s*$/, '') || null
    else if (t0 === 'Vortragsredner') {
      const [roh = '', herkunft = ''] = z[1]?.absaetze ?? []
      const text = namensForm(roh)
      if (!text || text === '·') continue
      // Ein Bruder der Versammlung wird an seine Person gebunden; jeder andere
      // ist ein Gast und steht als Freitext da.
      const bekannt = person(text)
      we.speaker = {
        name: bekannt ?? text,
        external: !bekannt,
        herkunft: herkunft.replace(/^\(|\)$/g, '').trim() || null,
        theme: null,
        number: null,
      }
    } else if (t0 === 'Vorsitzender') we.chairman = leer(z[1]) ? null : name(z[1].text)
    else if (t0 === 'Wachtturm-Leser') we.watchtowerReader = leer(z[1]) ? null : name(z[1].text)
  }
  if (we.speaker) we.speaker.theme = thema
}

/** „PDG-N …" der wöchentlichen Reinigung (sonst der Zwischenreinigung) → „Gruppe N". */
function reinigung(zeilen) {
  const gruppe = {}
  for (const z of zeilen) {
    for (let i = 0; i + 1 < z.length; i += 2) {
      const nr = /PDG-(\d+)/.exec(z[i + 1]?.text ?? '')
      if (nr) gruppe[z[i].text] = `Gruppe ${nr[1]}`
    }
  }
  return gruppe['Wöchentliche Reinigung'] ?? gruppe.Zwischenreinigung ?? null
}

/**
 * Die Wochen einer Wochenübersicht in der Zwischenform von `sammleNwsWochen`:
 * Montag → `{ mid, we }`, jeder Platz ein Name oder `null`.
 *
 * `person(text)` liefert den Namen, unter dem die Person in der App steht, oder
 * `null`; dann bleibt der Text aus dem Export stehen (der Import meldet ihn).
 * Beim Redner entscheidet es, ob er ein Gast ist.
 *
 * Dazu je Woche `besonderheit` — die zweite Kopfzeile, etwa „Kreisaufseher" —
 * und gezählt, was der Import nicht übernimmt. Unter der Woche steht der Ablauf
 * von „Unser Leben als Christ" in `ablauf` (`programmPunkt` je Zeile, mit `art`
 * „teil", „vbs" oder „ka"); `living` trägt die Namen der Zeilen „teil" in
 * derselben Folge, `kreisaufseher` den Namen hinter „KA:".
 */
export function wochenAusUebersicht(xml, { jahr, monat, person }) {
  const name = (text) => person(namensForm(text)) ?? namensForm(text)
  const wochen = new Map()
  const uebersprungen = { dienste: 0 }
  let woche = null
  for (const zeilen of tabellenVon(xml)) {
    if (zeilen[0]?.[0]?.text === 'Wochenübersicht') {
      const kopf = zeilen[0][1]?.absaetze ?? []
      const montag = montagAusKopf(kopf[0] ?? '', jahr, monat)
      woche = { ...neueWoche(), besonderheit: kopf.slice(1).join(' ') || null }
      wochen.set(montag, woche)
      continue
    }
    if (!woche) throw new Error('Wochenübersicht: Tabelle vor dem ersten Wochenkopf.')
    // Die Zusammenkunft unter der Woche hat keine Titelzeile — sie beginnt mit dem Vorsitz.
    const hatTitel = zeilen[0]?.length === 1
    const titel = hatTitel ? zeilen[0][0].text : 'Zusammenkunft unter der Woche'
    if (!ABSCHNITTE.has(titel)) throw new Error(`Wochenübersicht: unbekannter Abschnitt „${titel}".`)
    const rest = hatTitel ? zeilen.slice(1) : zeilen
    if (titel === 'Zusammenkunft unter der Woche') mitte(woche.mid, rest, name)
    else if (titel === 'Dienste unter der Woche') woche.mid.helpers = helfer(rest, name, uebersprungen)
    else if (titel === 'Zusammenkunft am Wochenende') wochenende(woche.we, rest, name, person)
    else if (titel === 'Dienste am Wochenende') woche.we.helpers = helfer(rest, name, uebersprungen)
    // Die Reinigung hängt an der Zusammenkunft unter der Woche, wie beim Import aus den NWS-Tabellen.
    else if (titel === 'Reinigung') woche.mid.cleaning = reinigung(rest)
  }
  return { wochen, uebersprungen }
}

/* ===================== Predigtdienst (Treffpunkte) ========================= */

/** Spalte der Tabelle „Predigtdienst" → Wochentag in der Zählung der App (0 = So … 6 = Sa). */
const WOCHENTAGE = { Montag: 1, Dienstag: 2, Mittwoch: 3, Donnerstag: 4, Freitag: 5, Samstag: 6, Sonntag: 0 }

/** Ein ISO-Datum, um `tage` verschoben — über UTC-Mittag, damit keine Zeitzone einen Tag verschiebt. */
function tagNach(iso, tage) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + tage)
  return d.toISOString().slice(0, 10)
}

/**
 * Die Treffpunkte einer Wochenübersicht (Tabelle „Predigtdienst"): je Termin der
 * Tag, die Uhrzeit, wie der Export sie schreibt, Ort, Zusatz und Leiter.
 *
 * Je Woche eine Zeile unter den Spalten Montag … Sonntag; in einer Zelle je
 * Termin die Absätze „Zeit[ (Zusatz)]", der Ort und „Leiter: Name" (abgelesen am
 * Export vom 2.11.2026 — der Zusatz nennt dort eine Gruppe, „PDG-3 …").
 *
 * **Die Uhrzeit steht ohne Vor- oder Nachmittag:** „2:30" ist 14:30. Sie bleibt
 * hier, wie sie dasteht (`zeitRoh`); welche es ist, entscheidet
 * `uhrzeitAufloesen`. Was sich nicht einordnen lässt, bricht ab, statt still
 * einen Termin zu verlieren.
 */
export function treffpunkteAusUebersicht(xml, { jahr, monat }) {
  const out = []
  let montag = null
  for (const zeilen of tabellenVon(xml)) {
    if (zeilen[0]?.[0]?.text === 'Wochenübersicht') {
      montag = montagAusKopf(zeilen[0][1]?.absaetze?.[0] ?? '', jahr, monat)
      continue
    }
    if (zeilen[0]?.length !== 1 || zeilen[0][0].text !== 'Predigtdienst') continue
    if (!montag) throw new Error('Wochenübersicht: Predigtdienst vor dem ersten Wochenkopf.')
    const tage = (zeilen[1] ?? []).map((z) => z.text)
    for (const t of tage) if (!(t in WOCHENTAGE)) throw new Error(`Predigtdienst ${montag}: unbekannte Spalte „${t}".`)
    for (const z of zeilen.slice(2)) {
      z.forEach((inhalt, i) => {
        if (leer(inhalt)) return
        const wd = WOCHENTAGE[tage[i]]
        let termin = null
        for (const absatz of inhalt.absaetze) {
          const zeit = /^(\d{1,2}:\d{2})(?:\s*\(([^)]*)\))?$/.exec(absatz)
          if (zeit) {
            termin = { montag, datum: tagNach(montag, (wd + 6) % 7), wd, zeitRoh: zeit[1], etikett: (zeit[2] ?? '').trim(), ort: '', leiter: null }
            out.push(termin)
          } else if (!termin) throw new Error(`Predigtdienst ${montag}, ${tage[i]}: Text vor der ersten Uhrzeit.`)
          else if (absatz.startsWith('Leiter:')) termin.leiter = namensForm(absatz.slice('Leiter:'.length)) || null
          else if (!termin.ort) termin.ort = absatz
          else throw new Error(`Predigtdienst ${montag}, ${tage[i]}: unbekannte Zeile im Termin um ${termin.zeitRoh}.`)
        }
      })
    }
  }
  return out
}

/**
 * Die Uhrzeit eines Termins aus dem Export („2:30") in der Form der App
 * („14:30"). Der Export lässt Vor- und Nachmittag weg, entschieden wird deshalb
 * am **Grundplan**: Führt er an diesem Wochentag genau eine der beiden
 * Uhrzeiten, gilt sie (`quelle: 'grundplan'`). Sonst nach der Tageszeit, zu der
 * Treffpunkte stattfinden — vor 7 Uhr keiner, „2:30" ist dann 14:30; ab 7 bleibt
 * es der Vormittag (`quelle: 'tageszeit'`, der Import zählt diese Fälle). Ab 12
 * Uhr ist die Angabe eindeutig.
 *
 * @param {{ wd: number, time: string }[]} regeln  der Grundplan (`fs_rules`, `time` als „HH:MM[:SS]")
 */
export function uhrzeitAufloesen(zeitRoh, wd, regeln) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(zeitRoh))
  if (!m || Number(m[1]) > 23) throw new Error(`Predigtdienst: keine Uhrzeit „${zeitRoh}".`)
  const h = Number(m[1])
  const als = (stunde) => `${String(stunde).padStart(2, '0')}:${m[2]}`
  if (h >= 12) return { zeit: als(h), quelle: 'eindeutig' }
  const imPlan = [als(h), als(h + 12)].filter((z) => regeln.some((r) => r.wd === wd && String(r.time).slice(0, 5) === z))
  if (imPlan.length === 1) return { zeit: imPlan[0], quelle: 'grundplan' }
  return { zeit: als(h < 7 ? h + 12 : h), quelle: 'tageszeit' }
}

/* ===================== Programm der Leben-und-Dienst-Zusammenkunft ========= */

/**
 * Die Tage der Zusammenkunft unter der Woche (ISO), aus dem Export „Programm der
 * Leben-und-Dienst-Zusammenkunft". Nur sie: Die Zuteilungen stehen vollständiger
 * in der Wochenübersicht, der Tag aber nur hier. Er weicht ab, wenn die
 * Zusammenkunft verlegt ist — in der Woche des Kreisaufsehers auf den Dienstag
 * (8.12.2026 statt Freitag).
 *
 * Jede Woche ist eine Tabelle, ihre Kopfzeile beginnt mit dem Tag
 * („2026.12.08 | HESEKIEL 3-4"). Findet sich keiner, bricht es ab.
 */
export function tageAusLebenUndDienst(xml) {
  const tage = []
  for (const zeilen of tabellenVon(xml)) {
    const m = /^(\d{4})\.(\d{2})\.(\d{2})\b/.exec(zeilen[0]?.[0]?.text ?? '')
    if (!m) continue
    const tag = `${m[1]}-${m[2]}-${m[3]}`
    const d = new Date(`${tag}T12:00:00Z`)
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== tag) throw new Error(`Leben und Dienst: kein Datum „${zeilen[0][0].text}".`)
    tage.push(tag)
  }
  if (!tage.length) throw new Error('Leben und Dienst: keine Woche gefunden — unbekanntes Format.')
  return tage
}
