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
  pl: { zuteilung: 'Nowy przydział', entzug: 'Zadanie wycofane' },
  ru: { zuteilung: 'Новое назначение', entzug: 'Задание отменено' },
  uk: { zuteilung: 'Нове призначення', entzug: 'Завдання скасовано' },
  ro: { zuteilung: 'Însărcinare nouă', entzug: 'Sarcină retrasă' },
  el: { zuteilung: 'Νέα ανάθεση', entzug: 'Η ανάθεση αποσύρθηκε' },
  cs: { zuteilung: 'Nové přidělení', entzug: 'Úkol byl zrušen' },
  sk: { zuteilung: 'Nové pridelenie', entzug: 'Úloha bola zrušená' },
  hu: { zuteilung: 'Új kiosztás', entzug: 'Feladat visszavonva' },
  hr: { zuteilung: 'Nova dodjela', entzug: 'Zadatak povučen' },
  sr: { zuteilung: 'Novo zaduženje', entzug: 'Zadatak povučen' },
  bg: { zuteilung: 'Ново назначение', entzug: 'Назначението е оттеглено' },
  sv: { zuteilung: 'Ny tilldelning', entzug: 'Uppgiften har dragits tillbaka' },
  da: { zuteilung: 'Ny tildeling', entzug: 'Opgaven er trukket tilbage' },
  fi: { zuteilung: 'Uusi tehtävä', entzug: 'Tehtävä peruttu' },
  no: { zuteilung: 'Ny tildeling', entzug: 'Oppgaven er trukket tilbake' },
  tr: { zuteilung: 'Yeni görev', entzug: 'Görev geri alındı' },
  zh: { zuteilung: '新分配', entzug: '分配已取消' },
  ja: { zuteilung: '新しい割り当て', entzug: '割り当てが取り消されました' },
  ko: { zuteilung: '새 임명', entzug: '임명이 취소되었습니다' },
  id: { zuteilung: 'Penetapan baru', entzug: 'Tugas ditarik' },
  tl: { zuteilung: 'Bagong atas', entzug: 'Binawi ang atas' },
  vi: { zuteilung: 'Phân công mới', entzug: 'Phân công đã bị rút lại' },
  sw: { zuteilung: 'Mgawo mpya', entzug: 'Mgawo umeondolewa' },
  ar: { zuteilung: 'تعيين جديد', entzug: 'تم سحب التعيين' },
  he: { zuteilung: 'מטלה חדשה', entzug: 'השיבוץ בוטל' },
  fa: { zuteilung: 'وظیفهٔ جدید', entzug: 'وظیفه لغو شد' },
  ur: { zuteilung: 'نئی ذمہ داری', entzug: 'ذمہ داری واپس لے لی گئی' },
}

/** Texte für eine Sprache; unbekannte Codes fallen auf Deutsch zurück. */
export const planTexte = texteFuer(TEXTE, DE)
