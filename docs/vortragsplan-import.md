# Vortragsplan importieren — Format Version 1

Die öffentlichen Vorträge plant der Vortragskoordinator in einem eigenen
Programm, oft Monate voraus. Damit sie in der App im Programm der Wochen stehen,
gibt das Programm eine XML-Datei in diesem Format aus, und ein Planer übernimmt
sie unter **Zusammenkünfte › Planen › Wochenende › Vortragsplan**.

Übernommen werden je Woche: **Redner, Versammlung, Thema und Lied.** Mehr nicht.
Von auswärtigen Rednern dürfen nur Name und Versammlung in die Cloud. Die App
liest die Datei auf dem Gerät des Planers; alles, was die Datei sonst noch
enthält (Telefon, E-Mail, Adresse …), verlässt das Gerät nicht. Die Vorschau
nennt diese Felder unter „Nicht übernommen".

Ein Beispiel liegt daneben: [vortragsplan-beispiel.xml](vortragsplan-beispiel.xml).

## Aufbau

```xml
<?xml version="1.0" encoding="UTF-8"?>
<vortragsplan version="1" von="2026-11-01" bis="2026-11-30">
  <vortrag datum="2026-11-08">
    <redner>Max Mustermann</redner>
    <versammlung>Musterstadt</versammlung>
    <thema>Demo-Thema 1</thema>
    <lied>151</lied>
  </vortrag>
  <vortrag datum="2026-11-15">
    <redner eigener="true">Peter Beispiel</redner>
    <thema>Demo-Thema 2</thema>
  </vortrag>
</vortragsplan>
```

| Element / Attribut | Pflicht | Inhalt |
| --- | --- | --- |
| `<vortragsplan>` | ja | Wurzel der Datei. |
| `version` | ja | `1`. Eine andere Version weist die App ab. |
| `von`, `bis` | nein | Zeitraum, den die Datei abdeckt (`JJJJ-MM-TT`). Siehe „Was entfällt". Ohne Angabe gilt der erste bis letzte Vortrag. |
| `<vortrag>` | — | Ein öffentlicher Vortrag. Beliebig viele. |
| `datum` | ja | Tag des Vortrags (`JJJJ-MM-TT`). Die App ordnet ihn der Woche Montag bis Sonntag zu, in der er liegt. |
| `<redner>` | ja | Name des Redners. |
| `eigener` | nein | `true` für einen Redner der eigenen Versammlung (auch `1` oder `ja`). |
| `<versammlung>` | beim Gastredner | Heimatversammlung des Gastredners. Beim eigenen Redner wird sie übergangen. |
| `<thema>` | nein | Thema des Vortrags. |
| `<lied>` | nein | Nummer des Lieds vor dem Vortrag, bis zu drei Ziffern. |

Kodierung: UTF-8. Eine andere Kodierung geht, wenn die XML-Deklaration sie nennt
(`encoding="windows-1252"`). Namensräume sind erlaubt, die App liest die
lokalen Namen.

## Regeln beim Übernehmen

- **Ein Vortrag je Woche.** Stehen zwei Vorträge in derselben Woche, übernimmt
  die App keinen von beiden, nennt sie als Fehler und lässt die Woche, wie sie
  ist.
- **Eigener Redner:** Die App sucht die Person mit genau diesem Namen (wie in der
  App: Vorname Nachname; Groß- und Kleinschreibung zählen nicht). Gefunden,
  bekommt er Aufgabe, Zusage und Erinnerung wie bei jeder Zuteilung. Nicht
  gefunden, steht nur der Name im Programm, und die Vorschau sagt es.
- **Wochen, die es in der App noch nicht gibt,** werden vorgemerkt. Der Vortrag
  wird eingetragen, sobald das Programm der Woche geholt ist.
- **Vorträge, deren Tag vorbei ist,** bleiben unberührt. Die Datei darf sie
  enthalten.
- **Sonderwochen** bleiben unberührt: Besuch des Kreisaufsehers, Kongress,
  Gedächtnismahl am Wochenende, eine ausgefallene Zusammenkunft. Die Vorschau
  nennt sie.
- **Das Planungsprogramm ist führend.** Ein erneuter Import überschreibt, was in
  der App am Vortrag geändert wurde.
- **Was entfällt:** Steht im Zeitraum der Datei (`von` bis `bis`) in der App ein
  Vortrag, den die Datei nicht mehr nennt, wird er entfernt. Maßgeblich ist der
  Tag der Zusammenkunft am Wochenende, nicht die Woche: Eine Datei bis Montag,
  30. November, lässt den Vortrag vom Sonntag, 6. Dezember, stehen. Wer nur
  einen Monat ausgibt, ändert also nur diesen Monat.
- **Fehlerhafte Vorträge** (Datum ungültig, Redner fehlt, Gastredner ohne
  Versammlung, Lied keine Nummer) übernimmt die App nicht; die Vorschau nennt
  sie mit ihrem Datum. Ihre Woche bleibt, wie sie ist — ein Fehler in der Datei
  ist keine Absage. Der Rest der Datei wird trotzdem übernommen.

Vor dem Übernehmen zeigt die App eine Vorschau: neu, geändert, unverändert,
entfällt, nicht übernommen. Erst „Übernehmen" schreibt.
