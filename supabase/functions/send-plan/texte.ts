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
 * Fehlt sie, gilt Deutsch.
 *
 * Der **Rumpf** wird nicht hier übersetzt: er besteht aus ` · `-Atomen (Termin,
 * Aufgabe), die der Fragment-Übersetzer erledigt.
 */

import { texteFuer } from '../_shared/texte.ts'

export interface PlanTexte {
  /** „Plan senden": die eigenen Aufgaben einer Woche, an die eingeteilte Person. */
  zuteilung: string
  /** Eine bereits bestätigte Zuteilung wurde zurückgezogen oder verlegt. */
  entzug: string
  /**
   * Eine Schicht im Zeugnisgeben fällt aus — gestrichen, auf einen anderen
   * Wochentag gelegt oder ihr Termin gelöscht (5.10.2026). „Schicht" heißt in
   * jeder Sprache wie in den Texten der App (`ozTermineHint`).
   */
  ausfall: string
  /** Uhrzeit oder Ort einer Schicht haben sich geändert (5.10.2026). */
  geaendert: string
}

/** Kanonisch deutsch — zugleich der Schlüssel, unter dem die Glocke übersetzt. */
export const TITEL_ZUTEILUNG = 'Neue Zuteilung'
export const TITEL_ENTZUG = 'Zuteilung zurückgezogen'
export const TITEL_AUSFALL = 'Schicht fällt aus'
export const TITEL_GEAENDERT = 'Schicht geändert'

const DE: PlanTexte = {
  zuteilung: TITEL_ZUTEILUNG,
  entzug: TITEL_ENTZUG,
  ausfall: TITEL_AUSFALL,
  geaendert: TITEL_GEAENDERT,
}

const TEXTE: Record<string, PlanTexte> = {
  de: DE,
  en: {
    zuteilung: 'New assignment',
    entzug: 'Assignment withdrawn',
    ausfall: 'Shift cancelled',
    geaendert: 'Shift changed',
  },
  es: {
    zuteilung: 'Nueva asignación',
    entzug: 'Asignación retirada',
    ausfall: 'Turno cancelado',
    geaendert: 'Turno modificado',
  },
  fr: {
    zuteilung: 'Nouvelle attribution',
    entzug: 'Attribution retirée',
    ausfall: 'Créneau annulé',
    geaendert: 'Créneau modifié',
  },
  it: {
    zuteilung: 'Nuovo incarico',
    entzug: 'Incarico ritirato',
    ausfall: 'Turno annullato',
    geaendert: 'Turno modificato',
  },
  pt: {
    zuteilung: 'Nova designação',
    entzug: 'Designação retirada',
    ausfall: 'Turno cancelado',
    geaendert: 'Turno alterado',
  },
  nl: {
    zuteilung: 'Nieuwe toewijzing',
    entzug: 'Toewijzing ingetrokken',
    ausfall: 'Tijdvak vervalt',
    geaendert: 'Tijdvak gewijzigd',
  },
  pl: {
    zuteilung: 'Nowy przydział',
    entzug: 'Zadanie wycofane',
    ausfall: 'Dyżur odwołany',
    geaendert: 'Dyżur zmieniony',
  },
  ru: {
    zuteilung: 'Новое назначение',
    entzug: 'Задание отменено',
    ausfall: 'Смена отменена',
    geaendert: 'Смена изменена',
  },
  uk: {
    zuteilung: 'Нове призначення',
    entzug: 'Завдання скасовано',
    ausfall: 'Зміну скасовано',
    geaendert: 'Зміну оновлено',
  },
  ro: {
    zuteilung: 'Însărcinare nouă',
    entzug: 'Sarcină retrasă',
    ausfall: 'Tură anulată',
    geaendert: 'Tură modificată',
  },
  el: {
    zuteilung: 'Νέα ανάθεση',
    entzug: 'Η ανάθεση αποσύρθηκε',
    ausfall: 'Η βάρδια ακυρώνεται',
    geaendert: 'Η βάρδια άλλαξε',
  },
  cs: {
    zuteilung: 'Nové přidělení',
    entzug: 'Úkol byl zrušen',
    ausfall: 'Směna odpadá',
    geaendert: 'Směna změněna',
  },
  sk: {
    zuteilung: 'Nové pridelenie',
    entzug: 'Úloha bola zrušená',
    ausfall: 'Smena odpadá',
    geaendert: 'Smena zmenená',
  },
  hu: {
    zuteilung: 'Új kiosztás',
    entzug: 'Feladat visszavonva',
    ausfall: 'A beosztás elmarad',
    geaendert: 'A beosztás megváltozott',
  },
  hr: {
    zuteilung: 'Nova dodjela',
    entzug: 'Zadatak povučen',
    ausfall: 'Smjena otkazana',
    geaendert: 'Smjena promijenjena',
  },
  sr: {
    zuteilung: 'Novo zaduženje',
    entzug: 'Zadatak povučen',
    ausfall: 'Smena otkazana',
    geaendert: 'Smena promenjena',
  },
  bg: {
    zuteilung: 'Ново назначение',
    entzug: 'Назначението е оттеглено',
    ausfall: 'Смяната отпада',
    geaendert: 'Смяната е променена',
  },
  sv: {
    zuteilung: 'Ny tilldelning',
    entzug: 'Uppgiften har dragits tillbaka',
    ausfall: 'Passet är inställt',
    geaendert: 'Passet har ändrats',
  },
  da: {
    zuteilung: 'Ny tildeling',
    entzug: 'Opgaven er trukket tilbage',
    ausfall: 'Vagten er aflyst',
    geaendert: 'Vagten er ændret',
  },
  fi: {
    zuteilung: 'Uusi tehtävä',
    entzug: 'Tehtävä peruttu',
    ausfall: 'Vuoro peruttu',
    geaendert: 'Vuoro muuttunut',
  },
  no: {
    zuteilung: 'Ny tildeling',
    entzug: 'Oppgaven er trukket tilbake',
    ausfall: 'Vakten er avlyst',
    geaendert: 'Vakten er endret',
  },
  tr: {
    zuteilung: 'Yeni görev',
    entzug: 'Görev geri alındı',
    ausfall: 'Nöbet iptal edildi',
    geaendert: 'Nöbet değişti',
  },
  zh: {
    zuteilung: '新分配',
    entzug: '分配已取消',
    ausfall: '班次已取消',
    geaendert: '班次已变更',
  },
  ja: {
    zuteilung: '新しい割り当て',
    entzug: '割り当てが取り消されました',
    ausfall: 'シフトが中止になりました',
    geaendert: 'シフトが変更されました',
  },
  ko: {
    zuteilung: '새 임명',
    entzug: '임명이 취소되었습니다',
    ausfall: '순번이 취소되었습니다',
    geaendert: '순번이 변경되었습니다',
  },
  id: {
    zuteilung: 'Penetapan baru',
    entzug: 'Tugas ditarik',
    ausfall: 'Giliran dibatalkan',
    geaendert: 'Giliran diubah',
  },
  tl: {
    zuteilung: 'Bagong atas',
    entzug: 'Binawi ang atas',
    ausfall: 'Kanselado ang shift',
    geaendert: 'Binago ang shift',
  },
  vi: {
    zuteilung: 'Phân công mới',
    entzug: 'Phân công đã bị rút lại',
    ausfall: 'Ca đã bị hủy',
    geaendert: 'Ca đã thay đổi',
  },
  sw: {
    zuteilung: 'Mgawo mpya',
    entzug: 'Mgawo umeondolewa',
    ausfall: 'Zamu imeghairishwa',
    geaendert: 'Zamu imebadilishwa',
  },
  ar: {
    zuteilung: 'تعيين جديد',
    entzug: 'تم سحب التعيين',
    ausfall: 'تم إلغاء النوبة',
    geaendert: 'تم تغيير النوبة',
  },
  he: {
    zuteilung: 'מטלה חדשה',
    entzug: 'השיבוץ בוטל',
    ausfall: 'המשמרת בוטלה',
    geaendert: 'המשמרת שונתה',
  },
  fa: {
    zuteilung: 'وظیفهٔ جدید',
    entzug: 'وظیفه لغو شد',
    ausfall: 'نوبت لغو شد',
    geaendert: 'نوبت تغییر کرد',
  },
  ur: {
    zuteilung: 'نئی ذمہ داری',
    entzug: 'ذمہ داری واپس لے لی گئی',
    ausfall: 'باری منسوخ ہو گئی',
    geaendert: 'باری تبدیل ہو گئی',
  },
}

/** Texte für eine Sprache; unbekannte Codes fallen auf Deutsch zurück. */
export const planTexte = texteFuer(TEXTE, DE)
