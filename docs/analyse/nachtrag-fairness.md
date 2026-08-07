# Nachtrag: Fairness der automatischen Zuteilung (T58)

Vorgabe des Betreibers: Aufgaben, Hilfsdienste und Treffpunkte müssen über
lange Zeiträume gleichmäßig verteilt werden — auch in Sonderfällen. Genannt:
wer **neu** ist und keine Vergangenheit hat, und wer aus dem **Urlaub**
zurückkommt, darf nicht mit Zuteilungen überschüttet werden, nur weil seine
Strichliste leer ist.

Alle Zahlen unten sind gemessen, nicht geschätzt. Die Messungen stecken als
Tests in `src/data/autoassign.grenzfaelle.test.ts` (22 Fälle) und sind
sabotage-geprüft: jede Zusicherung wird rot, wenn man die zugehörige Korrektur
entfernt.

---

## 1. Was gemessen wurde — und was dabei herauskam

**Aufbau.** Acht bis fünfzehn Personen, 40–60 Wochen Planung am Stück, ein
Neuling tritt mitten hinein oder jemand fällt zwölf Wochen aus. Gezählt wird,
was er danach bekommt — gegen den Schnitt der übrigen.

### Treffpunkte: der Fehler war gravierend

Neuling ab Woche 40, acht Stammleiter, zwei Treffpunkte je Woche:

| | erste 5 Wochen | Stamm im selben Zeitraum |
| --- | --- | --- |
| **vorher** | **10 von 10 Leitungen** | **0** |

Der Neuling bekam jede einzelne Leitung, bis er aufgeholt hatte. Ursache: er
stand mit 0 gegen Stammleute mit einem ganzen Jahr Historie und gewann jeden
Lastvergleich.

### Aufgaben und Hilfsdienste: unauffällig

Derselbe Aufbau für Programmpunkte: 4 Zuteilungen in fünf Wochen gegen einen
Schnitt von 2,9 — leicht erhöht, danach unterdurchschnittlich, in Summe
ausgeglichen. Grund ist das enge Fenster: `LOAD_RADIUS` misst nur ±2 Wochen,
ein Rückstand ist nach zwei Zuteilungen aufgeholt.

**Daraus folgt die eigentliche Einsicht:** Nicht die Zuteilungsart entscheidet,
sondern die **Breite des Lastfensters**. Je weiter es zurückreicht, desto
größer der scheinbare Rückstand eines Neulings.

---

## 2. Was geändert wurde

### Lastfenster der Treffpunkte: 52 → 12 Wochen

Gemessen mit acht Stammleitern, Neuling ab Woche 40, gezählt über 20 Wochen:

| Fenster | Neuling | Stamm-Schnitt | Verteilung der neun |
| --- | --- | --- | --- |
| 52 Wochen | **12** | 3,5 | 4 4 3 4 3 3 4 3 **12** |
| 26 Wochen | 6 | 4,3 | 4 5 4 4 4 4 5 4 **6** |
| **12 Wochen** | **5** | 4,4 | 4 5 5 4 4 4 5 4 **5** |

Die Fairness über lange Zeiträume trägt ohnehin nicht dieses Fenster, sondern
die **Wartezeit**, die über alle geladenen Wochen misst — dieselbe
Arbeitsteilung wie bei den Aufgaben.

### Wochen-Deckel: höchstens eine Leitung je Person und Woche

Enger Kreis (vier Leiter, drei Treffpunkte je Woche), Neuling ab Woche 25:

| | Doppelungen in 40 Wochen | Verlauf des Neulings |
| --- | --- | --- |
| ohne Deckel | **4** | 1 **3 3** 0 1 |
| mit Deckel | **0** | 1 1 1 1 1 |

Der Lastvergleich sagt nur, *wer* als Nächstes dran ist — nicht, wie oft
hintereinander. Der Deckel weicht, wenn sonst ein Platz offen bliebe.

---

## 3. Was verworfen wurde — und warum das hier steht

Zwischenzeitlich stand eine **Einstiegslast** im Code: wer keine Historie hat,
startet nicht bei 0, sondern beim Wert des Feldes. Zwei Anläufe, beide
gemessen:

- **Median des Feldes** — genau falsch herum. Ausgewählt wird das *Minimum*;
  wer in der Mitte einsteigt, ist nie das Minimum. Der Neuling bekam über
  zwanzig Wochen **gar nichts** (`4 5 5 4 4 4 5 4 0`).
- **Minimum des Feldes** — richtig gedacht, aber bei einem 12-Wochen-Fenster
  **wirkungslos**. Gegenprobe mit und ohne, im engen Kreis: identische Zahlen
  (Neuling 10, Stamm 9 9 9 8; Verlauf 1 1 1 1 1). Der Wochen-Deckel begrenzt
  ihn ohnehin auf eine Leitung je Woche, und die Wartezeit ordnet den Rest.

Deshalb ist die Einstiegslast **entfernt**. Ein Mechanismus, der nichts
bewirkt, aber im Kommentar erklärt, wie er eine Überschüttung verhindert, ist
schlimmer als keiner — er täuscht Absicherung vor und lädt dazu ein, das
Fenster später wieder zu verbreitern.

**Wenn das Fenster je wieder wachsen soll**, kommt sie zurück (Minimum, nicht
Median) — und muss dann neu gemessen werden. Die Tabelle oben ist die Vorlage
dafür.

---

## 4. Was die Tests abdecken

`src/data/autoassign.grenzfaelle.test.ts`:

| Bereich | Fälle |
| --- | --- |
| **Wochen-Deckel** | enger Kreis über 40 Wochen; Neuling im engen Kreis |
| **Neuling** | Treffpunkte (Einordnung, erste Wochen, kein Häufen), Aufgaben (erste Wochen, halbes Jahr) |
| **Urlaubsrückkehr** | Treffpunkte 12 Wochen weg; Aufgaben 12 Wochen weg; kurze Abwesenheit |
| **Langzeit** | Treffpunkte ein Jahr (glatte und ungerade Teilung), Aufgaben ein Jahr, Hilfsdienste im engen Kreis |
| **Randfälle** | ein einziger Kandidat, gar keine Kandidaten, alle abwesend, zwei Treffpunkte am selben Tag, seltene Qualifikation, Gastredner-Platz bleibt frei |

Zwei Zusicherungen prüfen bewusst **beide** Richtungen: der Neuling darf weder
das Anderthalbfache des Stamms bekommen noch weniger als die Hälfte. Der erste
Anlauf (Median) scheiterte an der zweiten — ohne sie wäre der Fehler
durchgegangen.

---

## 5. Offen

- **`fsAutoAssign` und `autoAssignMeeting` haben getrennte Fairness-Rechnungen.**
  Das ist gewollt (T-Vorgabe: Treffpunkte bleiben eine eigene Größe), führt aber
  dazu, dass zwei Stellen dieselbe Staffelung — Last, Wartezeit, Hash —
  unabhängig voneinander pflegen. Wer eine ändert, muss an die andere denken.
- **Die Strichlisten zählen über Anzeigenamen**, nicht über Person-Ids. Zwei
  Personen desselben Namens teilen sich damit eine Auslastung → [T57](todo.md).
- **Hilfsdienste** haben kein eigenes Neuling-Szenario in den Tests: sie laufen
  über dieselbe `workloadOf`-Rechnung wie die Aufgaben und damit über dasselbe
  enge Fenster. Ein eigener Fall wäre erst nötig, wenn `LOAD_RADIUS` für
  Hilfsdienste je davon abweicht.
