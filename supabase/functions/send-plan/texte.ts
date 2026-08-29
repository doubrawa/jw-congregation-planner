/**
 * Titel der Plan-Benachrichtigungen je Sprache.
 *
 * Wie in `send-reminders` und `substitute` eine eigene, kleine Liste statt des
 * App-Wörterbuchs: die Function wird getrennt deployt und würde sonst die ganze
 * i18n-Schicht mitziehen.
 *
 * Warum das hier stehen **muss**: Ein Push ist fertiger Text, sobald er das
 * Gerät erreicht — der Service Worker zeigt Titel und Rumpf unverändert an, die
 * App ist gar nicht beteiligt. Was hier fehlt, geht auf Deutsch hinaus und ist
 * beim Empfänger nicht mehr zu heilen. Die Glocke in der App darf dagegen
 * kanonisch deutsch in der Datenbank stehen; sie wird beim Anzeigen übersetzt
 * (NOTIF_TITLE_KEY in src/i18n/ui.ts).
 *
 * Die Sprache steht am Push-Abo (push_subscriptions.lang), also je Gerät.
 * Fehlt sie (Abos von vor migration-014), gilt Deutsch.
 *
 * Der **Rumpf** wird nicht hier übersetzt: er besteht aus ` · `-Atomen (Termin,
 * Aufgabe), die der Fragment-Übersetzer erledigt.
 */

export interface PlanTexte {
  /** „Plan senden": die eigenen Aufgaben einer Woche, an die eingeteilte Person. */
  zuteilung: string
  /** Eine bereits bestätigte Zuteilung wurde zurückgezogen oder verlegt. */
  entzug: string
}

/** Kanonisch deutsch — zugleich der Schlüssel, unter dem die Glocke übersetzt. */
export const TITEL_ZUTEILUNG = 'Neue Zuteilung'
export const TITEL_ENTZUG = 'Zuteilung zurückgezogen'

const DE: PlanTexte = { zuteilung: TITEL_ZUTEILUNG, entzug: TITEL_ENTZUG }

const TEXTE: Record<string, PlanTexte> = {
  de: DE,
  en: { zuteilung: 'New assignment', entzug: 'Assignment withdrawn' },
  es: { zuteilung: 'Nueva asignación', entzug: 'Asignación retirada' },
  fr: { zuteilung: 'Nouvelle attribution', entzug: 'Attribution retirée' },
  it: { zuteilung: 'Nuovo incarico', entzug: 'Incarico ritirato' },
  pt: { zuteilung: 'Nova designação', entzug: 'Designação retirada' },
  nl: { zuteilung: 'Nieuwe toewijzing', entzug: 'Toewijzing ingetrokken' },
  pl: { zuteilung: 'Nowe zadanie', entzug: 'Zadanie wycofane' },
  ru: { zuteilung: 'Новое задание', entzug: 'Задание отменено' },
  uk: { zuteilung: 'Нове завдання', entzug: 'Завдання скасовано' },
  ro: { zuteilung: 'Sarcină nouă', entzug: 'Sarcină retrasă' },
  el: { zuteilung: 'Νέος διορισμός', entzug: 'Ο διορισμός αποσύρθηκε' },
  cs: { zuteilung: 'Nový úkol', entzug: 'Úkol byl zrušen' },
  sk: { zuteilung: 'Nová úloha', entzug: 'Úloha bola zrušená' },
  hu: { zuteilung: 'Új feladat', entzug: 'Feladat visszavonva' },
  hr: { zuteilung: 'Novi zadatak', entzug: 'Zadatak povučen' },
  sr: { zuteilung: 'Novi zadatak', entzug: 'Zadatak povučen' },
  bg: { zuteilung: 'Ново назначение', entzug: 'Назначението е оттеглено' },
  sv: { zuteilung: 'Ny uppgift', entzug: 'Uppgiften har dragits tillbaka' },
  da: { zuteilung: 'Ny opgave', entzug: 'Opgaven er trukket tilbage' },
  fi: { zuteilung: 'Uusi tehtävä', entzug: 'Tehtävä peruttu' },
  no: { zuteilung: 'Ny oppgave', entzug: 'Oppgaven er trukket tilbake' },
  tr: { zuteilung: 'Yeni görev', entzug: 'Görev geri alındı' },
  zh: { zuteilung: '新的分配', entzug: '分配已取消' },
  ja: { zuteilung: '新しい割り当て', entzug: '割り当てが取り消されました' },
  ko: { zuteilung: '새 임무', entzug: '임무가 취소되었습니다' },
  id: { zuteilung: 'Tugas baru', entzug: 'Tugas ditarik' },
  tl: { zuteilung: 'Bagong atas', entzug: 'Binawi ang atas' },
  vi: { zuteilung: 'Nhiệm vụ mới', entzug: 'Nhiệm vụ đã bị rút lại' },
  sw: { zuteilung: 'Mgawo mpya', entzug: 'Mgawo umeondolewa' },
  ar: { zuteilung: 'تعيين جديد', entzug: 'تم سحب التعيين' },
  he: { zuteilung: 'שיבוץ חדש', entzug: 'השיבוץ בוטל' },
  fa: { zuteilung: 'وظیفهٔ جدید', entzug: 'وظیفه لغو شد' },
  ur: { zuteilung: 'نئی ذمہ داری', entzug: 'ذمہ داری واپس لے لی گئی' },
}

/** Texte für eine Sprache; unbekannte Codes fallen auf Deutsch zurück. */
export function planTexte(lang: string | null | undefined): PlanTexte {
  return TEXTE[lang ?? ''] ?? DE
}
