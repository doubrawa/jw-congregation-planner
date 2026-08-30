/**
 * Texte der Push-Erinnerungen je Sprache.
 *
 * Eigene, kleine Liste statt des App-Wörterbuchs: die Function wird getrennt
 * deployt und würde sonst die gesamte i18n-Schicht der App mitziehen. Nur die
 * zwei Zeilen, die tatsächlich verschickt werden, stehen hier.
 *
 * Warum überhaupt serverseitig übersetzt wird: Eine Push-Nachricht ist fertiger
 * Text, sobald sie das Gerät erreicht — anders als die Glocke in der App, die
 * beim Anzeigen übersetzt wird. Vorher gingen alle Erinnerungen auf Deutsch
 * heraus, egal welche Sprache der Empfänger eingestellt hatte.
 *
 * Die Sprache steht am Push-Abo (push_subscriptions.lang), also je Gerät —
 * dort, wo sie gewählt wurde. Fehlt sie (Abos von vor migration-014), gilt
 * Deutsch wie bisher.
 */

import { texteFuer } from '../_shared/texte.ts'

export interface PushTexte {
  /** Titel der persönlichen Erinnerung an eine offene Zuteilung. */
  erinnerung: string
  /** Titel der Sammelmeldung an die Planer über nicht erreichbare Personen. */
  unerreichbar: string
}

/*
 * Kanonisch deutsch — und zugleich der Schlüssel, unter dem die **Glocke** die
 * Zeile übersetzt (NOTIF_TITLE_KEY in src/i18n/ui.ts). Beide Meldungen stehen
 * inzwischen in beiden Kanälen: als Push (hier je Sprache) und als
 * Glocken-Zeile (kanonisch deutsch in der Datenbank).
 *
 * Als benannte Konstanten und nicht bloß als Feld von `DE`, damit
 * `mitteilungs-titel.test.ts` sie im Quelltext findet — dieselbe Machart wie in
 * `substitute/texte.ts` und `send-plan/texte.ts`. `index.ts` schreibt beide
 * Titel über diese Konstanten in die Glocke; stünde dort noch das Literal,
 * gäbe es den kanonisch deutschen Text zweimal.
 */
export const TITEL_ERINNERUNG = 'Erinnerung: Zuteilung bestätigen'
export const TITEL_UNERREICHBAR = 'Unbestätigte Zuteilungen (nicht erreichbar)'

const DE: PushTexte = {
  erinnerung: TITEL_ERINNERUNG,
  unerreichbar: TITEL_UNERREICHBAR,
}

const TEXTE: Record<string, PushTexte> = {
  de: DE,
  en: { erinnerung: 'Reminder: confirm your assignment', unerreichbar: 'Unconfirmed assignments (not reachable)' },
  es: { erinnerung: 'Recordatorio: confirma tu asignación', unerreichbar: 'Asignaciones sin confirmar (no localizables)' },
  fr: { erinnerung: 'Rappel : confirmez votre attribution', unerreichbar: 'Attributions non confirmées (injoignables)' },
  it: { erinnerung: 'Promemoria: conferma il tuo incarico', unerreichbar: 'Incarichi non confermati (non raggiungibili)' },
  pt: { erinnerung: 'Lembrete: confirma a tua designação', unerreichbar: 'Designações por confirmar (não contactáveis)' },
  nl: { erinnerung: 'Herinnering: bevestig je toewijzing', unerreichbar: 'Onbevestigde toewijzingen (niet bereikbaar)' },
  pl: { erinnerung: 'Przypomnienie: potwierdź swoje zadanie', unerreichbar: 'Niepotwierdzone zadania (brak kontaktu)' },
  ru: { erinnerung: 'Напоминание: подтвердите задание', unerreichbar: 'Неподтверждённые задания (нет связи)' },
  uk: { erinnerung: 'Нагадування: підтвердьте завдання', unerreichbar: 'Непідтверджені завдання (немає зв’язку)' },
  ro: { erinnerung: 'Memento: confirmă-ți însărcinarea', unerreichbar: 'Însărcinări neconfirmate (fără contact)' },
  el: { erinnerung: 'Υπενθύμιση: επιβεβαιώστε την ανάθεσή σας', unerreichbar: 'Μη επιβεβαιωμένες αναθέσεις (χωρίς επικοινωνία)' },
  cs: { erinnerung: 'Připomínka: potvrď svůj úkol', unerreichbar: 'Nepotvrzené úkoly (nedostupní)' },
  sk: { erinnerung: 'Pripomienka: potvrď svoju úlohu', unerreichbar: 'Nepotvrdené úlohy (nedostupní)' },
  hu: { erinnerung: 'Emlékeztető: erősítsd meg a feladatod', unerreichbar: 'Meg nem erősített feladatok (nem elérhető)' },
  hr: { erinnerung: 'Podsjetnik: potvrdi svoj zadatak', unerreichbar: 'Nepotvrđeni zadaci (nedostupni)' },
  sr: { erinnerung: 'Podsetnik: potvrdi svoje zaduženje', unerreichbar: 'Nepotvrđena zaduženja (nedostupni)' },
  bg: { erinnerung: 'Напомняне: потвърди назначението си', unerreichbar: 'Непотвърдени назначения (няма връзка)' },
  sv: { erinnerung: 'Påminnelse: bekräfta din uppgift', unerreichbar: 'Obekräftade uppgifter (ej nåbara)' },
  da: { erinnerung: 'Påmindelse: bekræft din opgave', unerreichbar: 'Ubekræftede opgaver (kan ikke kontaktes)' },
  fi: { erinnerung: 'Muistutus: vahvista tehtäväsi', unerreichbar: 'Vahvistamattomat tehtävät (ei tavoiteta)' },
  no: { erinnerung: 'Påminnelse: bekreft oppgaven din', unerreichbar: 'Ubekreftede oppgaver (ikke tilgjengelige)' },
  tr: { erinnerung: 'Hatırlatma: görevini onayla', unerreichbar: 'Onaylanmamış görevler (ulaşılamıyor)' },
  zh: { erinnerung: '提醒：请确认你的任务', unerreichbar: '未确认的任务（无法联系）' },
  ja: { erinnerung: 'リマインダー：割り当てを確認してください', unerreichbar: '未確認の割り当て（連絡不可）' },
  ko: { erinnerung: '알림: 임명을 확인해 주세요', unerreichbar: '확인되지 않은 임명 (연락 불가)' },
  id: { erinnerung: 'Pengingat: konfirmasi tugasmu', unerreichbar: 'Tugas belum dikonfirmasi (tidak terjangkau)' },
  tl: { erinnerung: 'Paalala: kumpirmahin ang iyong atas', unerreichbar: 'Hindi pa nakumpirmang atas (hindi maabot)' },
  vi: { erinnerung: 'Nhắc nhở: hãy xác nhận nhiệm vụ', unerreichbar: 'Nhiệm vụ chưa xác nhận (không liên lạc được)' },
  sw: { erinnerung: 'Ukumbusho: thibitisha mgawo wako', unerreichbar: 'Migawo isiyothibitishwa (hawapatikani)' },
  ar: { erinnerung: 'تذكير: أكِّد تعيينك', unerreichbar: 'تعيينات غير مؤكَّدة (تعذَّر الوصول)' },
  fa: { erinnerung: 'یادآوری: وظیفهٔ خود را تأیید کنید', unerreichbar: 'وظایف تأییدنشده (در دسترس نیستند)' },
  he: { erinnerung: 'תזכורת: אשר את המטלה שלך', unerreichbar: 'מטלות שלא אושרו (לא ניתן ליצור קשר)' },
  ur: { erinnerung: 'یاد دہانی: اپنی ذمہ داری کی تصدیق کریں', unerreichbar: 'غیر تصدیق شدہ ذمہ داریاں (رابطہ ممکن نہیں)' },
}

/** Texte für eine Sprache; unbekannt oder fehlend → Deutsch. */
export const pushTexte = texteFuer(TEXTE, DE)

/** Nur für Tests/Prüfungen: welche Sprachen abgedeckt sind. */
export const PUSH_SPRACHEN = Object.keys(TEXTE)
