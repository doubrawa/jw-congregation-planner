import zlib from 'node:zlib'

/**
 * **Eine Wochenübersicht, wie NWS sie exportiert — aus Platzhaltern gebaut.**
 *
 * Die Proben für `nws-exporte.mjs` und für den Import aus den Exporten brauchen
 * ein Word-Dokument. Ein echtes aus NWS trägt die Namen der Versammlung, und das
 * Repository ist öffentlich. Hier entsteht dieselbe Form mit Namen wie
 * „Probe Eins": je Abschnitt eine Tabelle, ein Absatz je Zeile in einer Zelle,
 * Text in mehreren Läufen (`w:r`), wie Word ihn zerlegt.
 *
 * Abgelesen am echten Export (November und Dezember 2026). Die Beschriftungen
 * müssen dieselben bleiben, denn an ihnen erkennt der Leser Abschnitte und
 * Plätze.
 */

/** Inhalt einer Zelle: ein Text oder mehrere Absätze. */
export type Zelle = string | string[]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Ein Absatz; Word trennt den Text oft in Läufe — hier am ersten Leerzeichen. */
function absatz(text: string): string {
  const i = text.indexOf(' ')
  const laeufe = i > 0 ? [text.slice(0, i), text.slice(i)] : [text]
  const r = laeufe.map((t) => `<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`).join('')
  return `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${r}</w:p>`
}

function zelle(inhalt: Zelle): string {
  const absaetze = typeof inhalt === 'string' ? [inhalt] : inhalt
  return `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>${absaetze.map(absatz).join('')}</w:tc>`
}

/** Eine Tabelle aus Zeilen von Zellen. */
export function tabelle(zeilen: Zelle[][]): string {
  const tr = zeilen.map((z) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${z.map(zelle).join('')}</w:tr>`).join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${tr}</w:tbl>`
}

/**
 * Der Kopf einer Woche wie im Export: „Wochenübersicht", der Zeitraum (darunter
 * eine Besonderheit wie „Kreisaufseher") und die Versammlung.
 */
export function wochenKopf(...absaetze: string[]): string {
  return tabelle([['Wochenübersicht', absaetze, 'Probeversammlung']])
}

/** Ein Abschnitt mit Titelzeile — alle außer der Zusammenkunft unter der Woche, die keine hat. */
export function abschnitt(titel: string, zeilen: Zelle[][]): string {
  return tabelle([[titel], ...zeilen])
}

/** `word/document.xml` aus Tabellen — dazwischen ein leerer Absatz, wie Word sie trennt. */
export function dokument(tabellen: string[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    `${tabellen.join('<w:p/>')}<w:sectPr/></w:body></w:document>`
  )
}

interface Eintrag {
  name: string
  daten: string | Buffer
  /** 8 = Deflate (wie Word), 0 = ungepackt. */
  methode?: 0 | 8
  /** Größe und Prüfsumme erst hinter den Daten (Bit 3) — im lokalen Kopf stehen dann Nullen. */
  nachgestellt?: boolean
}

/** Ein ZIP-Archiv — ein docx ist eines. */
export function zipArchiv(eintraege: Eintrag[]): Buffer {
  const teile: Buffer[] = []
  const verzeichnis: Buffer[] = []
  let versatz = 0
  for (const e of eintraege) {
    const roh = Buffer.isBuffer(e.daten) ? e.daten : Buffer.from(e.daten, 'utf8')
    const methode = e.methode ?? 8
    const gepackt = methode === 8 ? zlib.deflateRawSync(roh) : roh
    const crc = zlib.crc32(roh)
    const name = Buffer.from(e.name, 'utf8')
    const bit3 = e.nachgestellt ? 0x08 : 0

    const lokal = Buffer.alloc(30)
    lokal.writeUInt32LE(0x04034b50, 0)
    lokal.writeUInt16LE(20, 4)
    lokal.writeUInt16LE(bit3, 6)
    lokal.writeUInt16LE(methode, 8)
    if (!e.nachgestellt) {
      lokal.writeUInt32LE(crc, 14)
      lokal.writeUInt32LE(gepackt.length, 18)
      lokal.writeUInt32LE(roh.length, 22)
    }
    lokal.writeUInt16LE(name.length, 26)
    const nachsatz = Buffer.alloc(e.nachgestellt ? 16 : 0)
    if (e.nachgestellt) {
      nachsatz.writeUInt32LE(0x08074b50, 0)
      nachsatz.writeUInt32LE(crc, 4)
      nachsatz.writeUInt32LE(gepackt.length, 8)
      nachsatz.writeUInt32LE(roh.length, 12)
    }
    teile.push(lokal, name, gepackt, nachsatz)

    const zentral = Buffer.alloc(46)
    zentral.writeUInt32LE(0x02014b50, 0)
    zentral.writeUInt16LE(20, 4)
    zentral.writeUInt16LE(20, 6)
    zentral.writeUInt16LE(bit3, 8)
    zentral.writeUInt16LE(methode, 10)
    zentral.writeUInt32LE(crc, 16)
    zentral.writeUInt32LE(gepackt.length, 20)
    zentral.writeUInt32LE(roh.length, 24)
    zentral.writeUInt16LE(name.length, 28)
    zentral.writeUInt32LE(versatz, 42)
    verzeichnis.push(zentral, name)
    versatz += lokal.length + name.length + gepackt.length + nachsatz.length
  }
  const zv = Buffer.concat(verzeichnis)
  const ende = Buffer.alloc(22)
  ende.writeUInt32LE(0x06054b50, 0)
  ende.writeUInt16LE(eintraege.length, 8)
  ende.writeUInt16LE(eintraege.length, 10)
  ende.writeUInt32LE(zv.length, 12)
  ende.writeUInt32LE(versatz, 16)
  return Buffer.concat([...teile, zv, ende])
}

/** Ein docx mit diesen Tabellen — dazu, was Word sonst noch hineinlegt. */
export function wochenuebersichtDocx(tabellen: string[]): Buffer {
  return zipArchiv([
    { name: '[Content_Types].xml', daten: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'word/document.xml', daten: dokument(tabellen) },
    { name: 'word/styles.xml', daten: '<?xml version="1.0"?><w:styles/>' },
  ])
}
