# roots App – Querschnitt und Verwaltung mit Daten — heuristic audit

**Auditor:** Claude (ux-audit skill)
**Date:** 2026-11-02
**Screens reviewed:** 14
**User goal:** Vorstand, Kassenwart und Power-User sollen in der Verwaltung ihres Vereins Mitglieder, Beiträge, Kontakte und Rechnungen finden, prüfen und ändern können, ohne Eingaben zu verlieren, ohne versehentlich Geld- oder E-Mail-Aktionen auszulösen und ohne zu raten, was ein Knopf tut.

## Summary

Die App hat ein starkes, konsequent gebautes Fundament: ein Seitenkopf, eine Speicherleiste, ein Bestätigungsdialog und eine Listenkomponente für alle Module. Ein zweiter Durchgang mit einem Verein mit echten Daten zeigt das größte Risiko dort, wo es um Menschen und Geld geht: Kündigen, Pausieren, Mitgliedskarte neu ausstellen und „Erinnerung an alle Überfälligen“ laufen mit einem Klick, ohne Rückfrage, ohne Anzahl und ohne Vorschau. Außerdem gehen Eingaben verloren: Serverfehler leeren Formulare, Drawer schließen ohne Rückfrage, und eine Aktion in der rechten Spalte einer Detailseite verwirft ungespeicherte Änderungen links. Im Dark Mode sind Eingabefelder in Drawern unsichtbar, und die Kontakt-Detailseite läuft auf dem Desktop seitlich über. Zuerst beheben: Rückfragen mit Anzahl für Massen-E-Mails und Mitgliedschaftsänderungen, den Formularzustand bei Fehlern erhalten, das --input-Token im Dark Mode anheben.

## Findings by screen

### 1. Startseite „Heute“ einer neuen Org

#### 1.1 🟡 Eine neue Org landet auf vier leeren Karten ohne nächsten Schritt (`heute-neue-org-ohne-naechsten-schritt`)

- **Heuristic:** FTU.1 (Next action obvious) + FTU.4 (Empty states do work) + [Fogg (Prompt unclear)](https://behaviormodel.org/)
- **Severity:** 2 (Minor)
- **Screen:** `01-heute.jpg`
- **Region:** x=22%, y=35%, w=76%, h=28%
- **What we see:** „Heute“ zeigt bei einer leeren Org „No open tasks“, „No events planned“, „Nothing overdue“ und „All read“. Nichts davon führt zu einer Aktion. Der einzige Einstieg sind die Sprout-Vorschläge, die einen eigenen KI-Schlüssel voraussetzen.
- **Why it matters:** Der erste Eindruck ist ein Raster aus „nichts“. Ehrenamtliche ohne Einweisung wissen nicht, ob sie mit Kontakten, Mitgliedern oder der Website anfangen sollen, und 14 Module in der Sidebar machen die Wahl nicht leichter.
- **Recommendation:** Solange die Org kaum Daten hat, oben auf „Heute“ eine Checkliste „Erste Schritte“ zeigen (Logo und Name, Kontakte importieren, Team einladen, erstes Event), deren Punkte sich selbst abhaken und die danach verschwindet. Leere Karten bekommen einen Link zur ersten Aktion („Event anlegen“).

#### 1.2 🟡 14 Module stehen ungruppiert in einer Liste unter „Modules“ (`sidebar-vierzehn-module-flach`)

- **Heuristic:** [Hick's Law](https://lawsofux.com/hicks-law/) + [Miller's Law](https://lawsofux.com/millers-law/) + [Gestalt (Proximity)](https://en.wikipedia.org/wiki/Principles_of_grouping)
- **Severity:** 2 (Minor)
- **Screen:** `01-heute.jpg`
- **Region:** x=0%, y=17%, w=20%, h=61%
- **What we see:** Die Sidebar listet Contacts, Memberships, Events, Shifts, People, Courses, Finance, Communication, Automations, Projects, Rentals, Knowledge, Reports und Website gleichrangig unter der Überschrift „Modules“. Jede Org bekommt derzeit jedes Modul.
- **Why it matters:** Eine Kassenwartin, die nur Beiträge braucht, muss jedes Mal 14 Einträge überfliegen. „Modules“ ist außerdem ein technisches Wort, das den Nutzern nichts sagt.
- **Recommendation:** In wenige Gruppen mit sprechenden Überschriften teilen (z. B. Menschen: Kontakte, Mitglieder, Personal · Veranstalten: Events, Schichten, Kurse, Vermietung · Geld: Finanzen, Berichte · Außenwirkung: Kommunikation, Website · Werkzeuge: Projekte, Wissen, Automationen). Mittelfristig Module pro Person ausblenden lassen.

#### 1.3 ⚪ Die Suche zeigt „⌘K“ auch unter Windows und Linux (`heute-cmdk-auch-auf-windows`)

- **Heuristic:** [Jakob's Law](https://lawsofux.com/jakobs-law/) + [Nielsen #2 (Match between system and the real world)](https://www.nngroup.com/articles/ten-usability-heuristics/)
- **Severity:** 1 (Cosmetic)
- **Screen:** `01-heute.jpg`
- **Region:** x=0%, y=1%, w=20%, h=4%
- **What we see:** In der Sidebar steht fest „⌘K“ (command-search.tsx:89 und Tooltip Zeile 86), obwohl der Handler auch Strg+K annimmt.
- **Why it matters:** Vereinsrechner laufen oft mit Windows: Das Mac-Symbol sagt dort nichts, und die schnelle Suche bleibt unentdeckt.
- **Recommendation:** Die Plattform im Client prüfen (navigator.platform bzw. userAgentData) und „Strg K“ zeigen, wenn es kein Mac ist.


### 2. Liste ohne Einträge (Kontakte)

#### 2.1 🟡 Nach dem Löschen fehlt ein „Rückgängig“ direkt im Toast (`kontakte-loeschen-ohne-rueckgaengig`)

- **Heuristic:** [Nielsen #3 (User control and freedom)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Shneiderman #6 (Permit easy reversal of actions)](https://www.cs.umd.edu/~ben/goldenrules.html) + TRUST.4 (Reversibility)
- **Severity:** 2 (Minor)
- **Screen:** `02-kontakte-leer.jpg`
- **Region:** x=85%, y=14%, w=13%, h=5%
- **What we see:** Löschen ist ein Soft Delete, und der Dialog sagt „30 Tage wiederherstellbar“. Danach erscheint aber nur der Toast „1 Eintrag in den Papierkorb verschoben.“ ohne Aktion (Notice in src/components/notice.tsx kennt nur Text). Zum Wiederherstellen muss man den Papierkorb im ⋯-Menü der Liste finden.
- **Why it matters:** Die Technik für Undo ist schon da, der Weg dorthin aber versteckt. Ein „Rückgängig“ im Toast macht den Bestätigungsdialog für Einzel-Löschungen fast überflüssig und senkt die Angst vor Fehlklicks.
- **Recommendation:** back() um ein optionales undo-Ziel ergänzen (z. B. ?undo=<table>:<id>) und in Notice als toast.success(text, { action: { label: "Rückgängig", onClick: restore } }) zeigen, das restore_deleted aufruft.

#### 2.2 🟡 Blättern heißt „Neuer / Älter“, auch in alphabetischen Listen (`pager-neuer-aelter-bei-alphabet`)

- **Heuristic:** [Nielsen #2 (Match between system and the real world)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Content design: Specific, not generic](https://uxcontent.com/10-content-design-heuristics/) + [Gerhardt-Powals #2 (Reduce uncertainty)](https://en.wikipedia.org/wiki/Heuristic_evaluation#Gerhardt-Powals'_cognitive_engineering_principles)
- **Severity:** 2 (Minor)
- **Screen:** `02-kontakte-leer.jpg`
- **Region:** x=22%, y=22%, w=76%, h=36%
- **What we see:** Alle 17 Pager nutzen common.newer/common.older („Neuer“ / „Älter“). Kontakte sind aber nach Nachname sortiert (contacts/page.tsx:47). Es gibt weder Seitenzahl noch Gesamtzahl, nur diese zwei Knöpfe.
- **Why it matters:** „Älter“ in einer A–Z-Liste stimmt nicht. Power-User mit großen Listen wissen nicht, wie viele Einträge es gibt und auf welcher Seite sie stehen.
- **Recommendation:** Labels neutral machen („Zurück“ / „Weiter“) und eine Zeile „51–100 von 340“ ergänzen. Die Gesamtzahl gibt es günstig über count: "estimated" in derselben Abfrage.

#### 2.3 🟡 „Alle auswählen“ wählt nur die 50 Zeilen der aktuellen Seite (`bulk-auswahl-nur-aktuelle-seite`)

- **Heuristic:** [Shneiderman #2 (Seek universal usability)](https://www.cs.umd.edu/~ben/goldenrules.html) + [Nielsen #7 (Flexibility and efficiency of use)](https://www.nngroup.com/articles/ten-usability-heuristics/) + TRUST.6 (Volume signposting)
- **Severity:** 2 (Minor)
- **Screen:** `02-kontakte-leer.jpg`
- **Region:** x=22%, y=22%, w=76%, h=36%
- **What we see:** Das Kästchen im Tabellenkopf (bulk-bar.tsx:27-31) hakt nur die sichtbaren Zeilen an. Ein Angebot wie „Alle 340 Treffer auswählen“ fehlt, also lassen sich gefilterte Mengen (z. B. Tag „Vorstand“) nicht in einem Schritt taggen, exportieren oder löschen.
- **Why it matters:** Power-User müssen Seite für Seite dieselbe Aktion wiederholen und wissen nicht sicher, ob sie alles erwischt haben.
- **Recommendation:** Wenn alle Zeilen einer Seite angehakt sind und es eine nächste Seite gibt, in der BulkBar „Alle N Treffer auswählen“ anbieten. Dann statt ids die aktuellen Filter (q, tag, status) an die Server Action schicken, und der Bestätigungsdialog nennt N.

#### 2.4 🟡 Im Löschdialog liegt der Fokus auf dem roten Knopf (`bestaetigung-fokus-auf-loeschen`)

- **Heuristic:** [Nielsen #5 (Error prevention)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Fitts's Law](https://lawsofux.com/fittss-law/) + WAI-ARIA APG (Alert dialog: focus least destructive action)
- **Severity:** 2 (Minor)
- **Screen:** `02-kontakte-leer.jpg`
- **Region:** x=85%, y=14%, w=5%, h=5%
- **What we see:** ConfirmHost (confirm-submit.tsx:53) setzt autoFocus auf den destruktiven Knopf. Wer im ⋯-Menü „In den Papierkorb“ mit Enter auswählt und noch einmal Enter drückt, hat schon bestätigt.
- **Why it matters:** Der Dialog soll Fehlgriffe abfangen, aber ein doppeltes Enter oder ein schnelles Antippen geht direkt durch. Bei „Wirklich löschen?“ (nicht rückgängig zu machen) ist das riskant.
- **Recommendation:** autoFocus auf „Abbrechen“ legen und den Löschknopf weiterhin rot beschriften. Für Einzel-Löschungen mit Undo-Toast (siehe den Befund zu „Rückgängig“) kann der Dialog ganz entfallen.

#### 2.5 🟡 Der Leerzustand nennt „Liste importieren“, bietet es aber nicht an (`kontakte-leer-import-erwaehnt-nicht-angeboten`)

- **Heuristic:** FTU.4 (Empty states do work) + [Nielsen #6 (Recognition rather than recall)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Fogg (Ability: reduce steps)](https://behaviormodel.org/)
- **Severity:** 2 (Minor)
- **Screen:** `02-kontakte-leer.jpg`
- **Region:** x=44%, y=34%, w=32%, h=20%
- **What we see:** Der Text endet mit „Add the first one or import a list.“, darunter steht aber nur „+ New contact“. Der Import liegt im ⋯-Menü oben rechts, ohne Hinweis darauf.
- **Why it matters:** Vereine haben fast immer schon eine Excel-Mitgliederliste. Der Import ist der wichtigste erste Schritt und wird genau dort versteckt, wo der Text ihn verspricht.
- **Recommendation:** Im Leerzustand eine zweite Schaltfläche (outline) „Liste importieren“ neben „Neuer Kontakt“ setzen, die den Import-Drawer öffnet. Dasselbe in jedem Leerzustand, dessen Modul einen Import hat.

#### 2.6 🟡 Die Kürzel N und / sind unsichtbar und lassen sich nicht abschalten (`kuerzel-n-einzeltaste`)

- **Heuristic:** [WCAG 2.1.4 (Character Key Shortcuts)](https://www.w3.org/WAI/WCAG21/quickref/) + [Nielsen #7 (Flexibility and efficiency of use)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Tognazzini (Learnability)](https://asktog.com/atc/principles-of-interaction-design/)
- **Severity:** 2 (Minor)
- **Screen:** `02-kontakte-leer.jpg`
- **Region:** x=88%, y=14%, w=10%, h=5%
- **What we see:** Shortcuts (src/components/shortcuts.tsx) löst bei N die primäre Schaltfläche aus und fokussiert bei / die Suche. Weder der Knopf „+ New contact“ noch die Suche zeigen das Kürzel an, und eine Übersicht gibt es nicht. Einzeltasten-Kürzel ohne Modifier lassen sich nicht abschalten.
- **Why it matters:** Power-User profitieren nur, wenn sie die Kürzel kennen. Wer Sprachsteuerung nutzt, löst mit einem gesprochenen „n“ versehentlich „Neu“ aus, und genau dafür gilt WCAG 2.1.4.
- **Recommendation:** Das Kürzel im Tooltip zeigen (<kbd>N</kbd> neben „Neuer Kontakt“, <kbd>/</kbd> als Platzhalter-Ende der Suche), mit ? eine kleine Übersicht öffnen und im Profil einen Schalter „Tastenkürzel“ anbieten.


### 3. Datensatz anlegen (Neuer Kontakt)

#### 3.1 🟠 Ein Serverfehler beim Speichern leert das ganze Formular (`kontakt-neu-eingaben-weg-bei-serverfehler`)

- **Heuristic:** [Nielsen #9 (Help users recognise, diagnose, recover from errors)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Nielsen #3 (User control and freedom)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Shneiderman #5 (Prevent errors)](https://www.cs.umd.edu/~ben/goldenrules.html)
- **Severity:** 3 (Major)
- **Screen:** `03-kontakt-neu.jpg`
- **Region:** x=22%, y=20%, w=61%, h=78%
- **What we see:** Server Actions melden Fehler mit back(path, { error }), also per redirect. In src/app/(app)/contacts/actions.ts:32 und :38 geht ein Fehler beim Anlegen (z. B. doppelte E-Mail) zurück auf /contacts/new: Das Formular wird neu gerendert und ist leer. Beim Bearbeiten (Zeile 48/50) kommen die alten Werte aus der Datenbank zurück, die Änderungen sind weg. Nur 5 Dateien nutzen useActionState, 34 nutzen die SaveBar mit diesem Muster.
- **Why it matters:** Wer ein langes Formular (Kontakt mit Adresse, Bank, eigene Felder) ausfüllt und an einer Kleinigkeit scheitert, muss alles neu tippen. Für Ehrenamtliche ist das ein Abbruchgrund, und viele schließen daraus, dass die Software „nicht speichert“.
- **Recommendation:** Bei Validierungs- und Eindeutigkeitsfehlern nicht umleiten, sondern über useActionState den Fehler plus die eingereichten Werte zurückgeben (oder FormData als defaultValues zurückspielen). Zuerst in den Create-Formularen (Kontakt, Event, Mitglied, Rechnung) umsetzen, dann im Edit-Pfad der SaveBar.

#### 3.2 🟡 Serverfehler erscheinen nur als Toast, weit weg vom betroffenen Feld (`kontakt-neu-fehler-nur-als-toast`)

- **Heuristic:** [Nielsen #9 (Help users recognise, diagnose, recover from errors)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [WCAG 3.3.1 (Error Identification)](https://www.w3.org/WAI/WCAG21/quickref/) + [Gestalt (Proximity)](https://en.wikipedia.org/wiki/Principles_of_grouping)
- **Severity:** 2 (Minor)
- **Screen:** `03-kontakt-neu.jpg`
- **Region:** x=88%, y=94%, w=11%, h=5%
- **What we see:** Fehler wie „E-Mail schon vergeben“ kommen über ?error= als sonner-Toast (8 Sekunden, unten rechts). Das betroffene Feld wird weder markiert (aria-invalid) noch fokussiert. Nur Prüfungen im Browser (TypedInput) stehen am Feld.
- **Why it matters:** In langen Formularen muss man selbst suchen, welches Feld gemeint ist, und nach 8 Sekunden ist der Hinweis weg. Screenreader-Nutzer erfahren nicht, wo der Fehler sitzt.
- **Recommendation:** Mit dem Wechsel auf useActionState (siehe den Befund zum geleerten Formular) Feldfehler als { field, message } zurückgeben, am Feld unter dem Input zeigen, aria-invalid setzen und das erste fehlerhafte Feld fokussieren. Den Toast nur für Fehler ohne Feldbezug behalten.


### 4. Liste mit Werkzeugleiste (Events)

#### 4.1 ⚪ Suche, Segmente und Filter stehen über einer Liste, die noch nie Daten hatte (`events-leer-werkzeugleiste-ohne-funktion`)

- **Heuristic:** [Nielsen #8 (Aesthetic and minimalist design)](https://www.nngroup.com/articles/ten-usability-heuristics/) + COG.1 (Decision count) + [Nielsen #4 (Consistency and standards)](https://www.nngroup.com/articles/ten-usability-heuristics/)
- **Severity:** 1 (Cosmetic)
- **Screen:** `04-events-leer.jpg`
- **Region:** x=22%, y=21%, w=51%, h=6%
- **What we see:** Events zeigt bei null Events „Search…“, „Upcoming · Past · All“ und „Status ▾“ über dem Leerzustand. Kontakte blendet die Werkzeugleiste im selben Fall aus.
- **Why it matters:** Bedienelemente ohne Wirkung lenken vom einzigen sinnvollen Schritt („New event“) ab, und dass sich zwei Module gleich verhalten sollten, es aber nicht tun, verunsichert.
- **Recommendation:** Die Werkzeugleiste ausblenden, solange die Org im Bereich noch nie einen Datensatz hatte (dieselbe Bedingung, die den EmptyState wählt), und das als Regel in /style/app festhalten.


### 5. Einstellungen öffnen

#### 5.1 🟡 „Settings“ öffnet das persönliche Profil, Org und Person sind vermischt (`einstellungen-profil-statt-org`)

- **Heuristic:** [Nielsen #2 (Match between system and the real world)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Gestalt (Common region)](https://en.wikipedia.org/wiki/Principles_of_grouping) + [Nielsen #4 (Consistency and standards)](https://www.nngroup.com/articles/ten-usability-heuristics/)
- **Severity:** 2 (Minor)
- **Screen:** `05-einstellungen.jpg`
- **Region:** x=22%, y=9%, w=16%, h=46%
- **What we see:** Der Knopf „Settings“ in der oberen Leiste neben dem Org-Namen führt zu /settings/profile. In der Seitennavigation stehen persönliche Einträge (Profile, darin Language, Appearance, Notifications) und Org-Einträge (General, Team, Roles, Modules, Integrations, API) ohne Trennung untereinander.
- **Why it matters:** Wer neben dem Vereinsnamen auf „Einstellungen“ klickt, erwartet die Vereinseinstellungen. Ohne Trennung ist unklar, was nur mich betrifft und was alle im Verein.
- **Recommendation:** Die Seitennavigation in zwei beschriftete Gruppen teilen („Mein Konto“: Profil, Benachrichtigungen · „Verein“: Allgemein, Team, Rollen …). Der Knopf in der Org-Leiste öffnet „Verein › Allgemein“, „Profil“ bleibt im Benutzermenü unten links.

#### 5.2 ⚪ Das Profil hat eigene „Upload“- und „Save“-Knöpfe statt der Speicherleiste (`einstellungen-profil-eigene-speicherknoepfe`)

- **Heuristic:** [Nielsen #4 (Consistency and standards)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Shneiderman #1 (Strive for consistency)](https://www.cs.umd.edu/~ben/goldenrules.html)
- **Severity:** 1 (Cosmetic)
- **Screen:** `05-einstellungen.jpg`
- **Region:** x=39%, y=31%, w=30%, h=23%
- **What we see:** Unter „Profile picture“ steht ein eigener „Upload“-Knopf, unter „Name“ ein gefüllter „Save“-Knopf. Sprache und Aussehen speichern dagegen sofort. Überall sonst gilt: keine Speichern-Knöpfe, die SaveBar erscheint bei Änderungen.
- **Why it matters:** Drei Speicherarten auf einer Seite: Wer ein Bild auswählt und dann den Namen speichert, kann annehmen, das Bild sei mitgespeichert.
- **Recommendation:** Bild und Name in ein Formular mit <SaveBar /> legen oder das Bild nach der Auswahl sofort hochladen, wie ImageForm es anderswo tut. Gefüllte Knöpfe nur für die eine primäre Aktion verwenden.


### 6. Schnell-Anlage im Drawer (Handy, Dark Mode)

#### 6.1 🟠 Drawer mit ungespeicherten Änderungen schließt ohne Rückfrage (`drawer-schliesst-ohne-rueckfrage`)

- **Heuristic:** [Nielsen #3 (User control and freedom)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Nielsen #5 (Error prevention)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Nielsen #4 (Consistency and standards)](https://www.nngroup.com/articles/ten-usability-heuristics/)
- **Severity:** 3 (Major)
- **Screen:** `06-drawer-mobil.jpg`
- **Region:** x=88%, y=1%, w=10%, h=5%
- **What we see:** Die SaveBar (src/components/save-bar.tsx:43-61) fragt nur bei Klicks auf a[href] und beim Neuladen nach. Ein UrlSheet schließt aber über das X, einen Klick auf den Hintergrund oder Escape (url-sheet.tsx:34-40, router.replace). Keiner dieser Wege geht über einen Link, also verschwinden die Eingaben ohne Rückfrage. Auf Seiten gilt dasselbe für die Zurück-Taste des Browsers.
- **Why it matters:** Ein versehentlicher Tipp neben den Drawer reicht, und die Arbeit ist weg. Auf dem Handy liegt der abgedunkelte Hintergrund direkt neben den Feldern. Dieselbe Speicherleiste schützt Seiten, Drawer aber nicht: Das ist schwer vorherzusehen.
- **Recommendation:** UrlSheet und UrlDialog sollen vor close() prüfen, ob ein Formular darin geändert wurde (z. B. ein data-dirty-Attribut, das die SaveBar am <form> setzt), und dann denselben Dialog wie die SaveBar zeigen. Bei der Gelegenheit window.confirm durch den App-eigenen Dialog ersetzen.

#### 6.2 🟠 Im Dark Mode sind Eingabefelder in Drawern unsichtbar (`drawer-dark-eingabefelder-unsichtbar`)

- **Heuristic:** [WCAG 1.4.11 (Non-text Contrast)](https://www.w3.org/WAI/WCAG21/quickref/) + [Norman (Affordance)](https://www.interaction-design.org/literature/article/the-principles-of-design-by-don-norman) + A11Y.1 (Colour contrast)
- **Severity:** 3 (Major)
- **Screen:** `06-drawer-mobil.jpg`
- **Region:** x=27%, y=9%, w=70%, h=38%
- **What we see:** Unter „Label“ und „Choices“ ist kein Feld zu erkennen, nur der Ziehgriff der Textarea. Gemessen: Rahmen des Inputs lab(14.16) = Hintergrund des Drawers lab(14.16). In src/app/theme.css stehen im Dark Mode --input und --popover beide auf oklch(0.26 0 0). Auf Karten (--card 0.20) liegt der Kontrast weit unter 3:1.
- **Why it matters:** Ohne sichtbare Feldgrenze weiß niemand, wohin er tippen soll. Das betrifft jeden Drawer, Dialog und jedes Popover mit Formular im Dark Mode, und die App folgt standardmäßig dem System.
- **Recommendation:** Im .dark-Block --input deutlich heller als --popover setzen (etwa oklch(0.40 0 0)) und gegen card, popover und background auf mindestens 3:1 messen. Die Änderung gehört in theme.css, nicht in einzelne Komponenten.

#### 6.3 🟡 Drawer sind auf dem Handy nur 75 % breit statt vollbreit (`drawer-mobil-nicht-vollbreit`)

- **Heuristic:** [Fitts's Law](https://lawsofux.com/fittss-law/) + [Jakob's Law](https://lawsofux.com/jakobs-law/) + [Nielsen #4 (Consistency and standards)](https://www.nngroup.com/articles/ten-usability-heuristics/)
- **Severity:** 2 (Minor)
- **Screen:** `06-drawer-mobil.jpg`
- **Region:** x=0%, y=0%, w=25%, h=100%
- **What we see:** Bei 375 px Breite misst der Drawer 281 px. In ui/sheet.tsx gewinnt data-[side=right]:w-3/4 gegen das w-full aus UrlSheet (url-sheet.tsx:43), weil der Varianten-Selektor spezifischer ist. Laut Styleguide sollen Drawer auf Handys die volle Breite haben.
- **Why it matters:** Formularfelder werden schmaler, Labels brechen um, und der 94 px breite abgedunkelte Streifen ist eine große Fläche, die beim Antippen den Drawer schließt und damit Eingaben verwirft (siehe den Befund zum Schließen ohne Rückfrage).
- **Recommendation:** In UrlSheet data-[side=right]:w-full statt w-full setzen (gleiche Spezifität) und bei 375 px prüfen.

#### 6.4 ⚪ „Choices“ ist sichtbar, auch wenn der Typ „Text“ gewählt ist (`drawer-feld-auswahl-immer-sichtbar`)

- **Heuristic:** [Progressive disclosure (Reveal on intent)](https://www.nngroup.com/articles/progressive-disclosure/) + COG.4 (Reading load) + [Krug (Don't make me think)](https://sensible.com/dont-make-me-think/)
- **Severity:** 1 (Cosmetic)
- **Screen:** `06-drawer-mobil.jpg`
- **Region:** x=27%, y=30%, w=70%, h=20%
- **What we see:** Im Drawer „New field · Contacts“ steht bei Typ „Text“ eine große Textarea „Choices“ mit dem Hinweis „Only for type ‘Choice’: one per line.“ Der Speichern-Knopf heißt „New field“ statt „Feld anlegen“.
- **Why it matters:** Man liest ein Feld, das man nicht braucht, und muss selbst entscheiden, ob es ausgefüllt werden muss. „New field“ als Knopf klingt nach einem weiteren neuen Feld, nicht nach Bestätigen.
- **Recommendation:** Die Textarea nur bei Typ „Auswahl“ einblenden (kleiner Client-Schalter am Select) und den Knopf mit SaveBar label="Feld anlegen" beschriften, wie bei „Kontakt anlegen“.


### 7. Falscher Link / Fehlerseite

#### 7.1 🟠 404 und Laufzeitfehler zeigen die nackte Next.js-Seite ohne Weg zurück (`fehlerseiten-fehlen`)

- **Heuristic:** [Nielsen #9 (Help users recognise, diagnose, recover from errors)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Nielsen #3 (User control and freedom)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Content design: Voice and tone fit the moment](https://uxcontent.com/10-content-design-heuristics/)
- **Severity:** 3 (Major)
- **Screen:** `07-404.jpg`
- **Region:** x=35%, y=44%, w=30%, h=12%
- **What we see:** /app/settings (ein naheliegender, abgeschnittener Link) zeigt „404 | This page could not be found.“ auf Schwarz: auf Englisch, ohne Sidebar und ohne Link. Im Projekt gibt es keine einzige not-found.tsx, error.tsx oder global-error.tsx, also endet auch jeder Serverfehler in einem Bereich in der Standard-Fehlerseite.
- **Why it matters:** Eine Sackgasse: Ehrenamtliche finden ohne Navigation nicht zurück und halten die App für kaputt. Bei Laufzeitfehlern fehlt jede Möglichkeit, es erneut zu versuchen, und auf Deutsch steht nichts da.
- **Recommendation:** src/app/(app)/not-found.tsx und error.tsx innerhalb der AppShell anlegen (übersetzter Text, „Zur Startseite“ und bei error.tsx „Erneut versuchen“ mit reset()). Dazu /settings auf /settings/general bzw. die erste erlaubte Unterseite umleiten.


### 8. Startseite „Heute“ eines Vereins mit Daten

#### 8.1 🟡 Derselbe Ort heißt an verschiedenen Stellen unterschiedlich (`begriffe-uneinheitlich`)

- **Heuristic:** [Content design: Consistent terminology](https://uxcontent.com/10-content-design-heuristics/) + [Nielsen #4 (Consistency and standards)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Nielsen #2 (Match between system and the real world)](https://www.nngroup.com/articles/ten-usability-heuristics/)
- **Severity:** 2 (Minor)
- **Screen:** `08-heute-qs1.jpg`
- **Region:** x=0%, y=7%, w=70%, h=23%
- **What we see:** Die Sidebar sagt „Start“, die Seite „Heute“. Die Sidebar sagt „Veranstaltungen“, der Sprout-Vorschlag „Hilf mir, ein Event anzulegen“. Sidebar und Brotkrumen sagen „Mitgliedschaften“, die Seite „Mitglieder“. Die Sidebar sagt „Rechnungen“, die Seite „Angebote & Rechnungen“.
- **Why it matters:** Wer nach Anleitung „geh auf Mitglieder“ oder „leg ein Event an“ sucht, findet das Wort nicht in der Navigation. Für Ehrenamtliche, die die App selten öffnen, ist die Wiedererkennung des Wortes der wichtigste Wegweiser.
- **Recommendation:** Pro Bereich ein Wort festlegen und überall verwenden (z. B. „Heute“ in Sidebar und Titel, „Veranstaltung“ statt „Event“ in allen deutschen Texten, „Mitglieder“ als Bereichsname). Eine kurze Begriffsliste in docs/design ablegen und neue Texte daran prüfen.


### 9. Mitgliederliste

#### 9.1 ⚪ Mitgliedsnummern stehen in zwei Formaten nebeneinander (`mitglieder-nummern-zwei-formate`)

- **Heuristic:** [Nielsen #4 (Consistency and standards)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Gerhardt-Powals #6 (Group data in consistently meaningful ways)](https://en.wikipedia.org/wiki/Heuristic_evaluation#Gerhardt-Powals'_cognitive_engineering_principles)
- **Severity:** 1 (Cosmetic)
- **Screen:** `09-mitglieder.jpg`
- **Region:** x=25%, y=37%, w=12%, h=20%
- **What we see:** „Nr. 1“ steht neben „Nr. WNRP2“ und „Nr. JXV2F“. Bestehende Nummern behalten beim Ändern des Nummernformats ihr altes Format (Trigger in 20261013220000_number_ranges_generic.sql).
- **Why it matters:** Gemischte Formate sehen nach Fehler aus und machen Sortieren und mündliches Nachfragen am Einlass schwerer („Ihre Nummer?“).
- **Recommendation:** Beim Ändern des Formats in den Einstellungen sagen, dass bestehende Nummern bleiben, und optional „Bestehende Mitglieder neu nummerieren“ anbieten, mit Rückfrage und Hinweis auf gedruckte Karten.


### 10. Mitglied ansehen und ändern

#### 10.1 🟠 Kündigen, Pausieren und „Neue Karte“ laufen ohne Rückfrage (`mitglied-kuendigen-ohne-rueckfrage`)

- **Heuristic:** [Nielsen #5 (Error prevention)](https://www.nngroup.com/articles/ten-usability-heuristics/) + TRUST.1 (Preview before commit) + TRUST.4 (Reversibility)
- **Severity:** 3 (Major)
- **Screen:** `10-mitglied-detail.jpg`
- **Region:** x=70%, y=26%, w=28%, h=53%
- **What we see:** In der rechten Spalte der Mitglieds-Detailseite sind „Neue Karte (alte wird ungültig)“, „Pausieren“ und „Kündigen“ einfache SubmitButtons ohne data-confirm (src/app/(app)/members/[id]/page.tsx:107-112, 186-196, 208-213). Ein Klick beendet die Mitgliedschaft zum vorgeschlagenen Datum oder macht die gedruckte Karte sofort ungültig.
- **Why it matters:** Diese Aktionen betreffen eine echte Person: Beiträge werden anders berechnet, und eine ungültige Karte fällt erst am Einlass auf. Die Knöpfe sitzen in einer Spalte mit harmlosen Aktionen wie „Karte drucken“ und sehen genauso aus.
- **Recommendation:** data-confirm mit konkretem Text setzen, z. B. „Mitgliedschaft von Erika Muster zum 31.12.2027 kündigen?“ und „Neue Karte ausstellen? Die gedruckte Karte Nr. 1 funktioniert dann nicht mehr.“ Für „Kündigen“ zusätzlich die Hinweiszeile nutzen, um Folgen für offene Beiträge zu nennen.

#### 10.2 🟡 Eine Aktion rechts verwirft ungespeicherte Änderungen im Formular links (`mitglied-seitenaktion-verwirft-hauptformular`)

- **Heuristic:** [Nielsen #3 (User control and freedom)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Gestalt (Common region)](https://en.wikipedia.org/wiki/Principles_of_grouping) + [Shneiderman #8 (Reduce short-term memory load)](https://www.cs.umd.edu/~ben/goldenrules.html)
- **Severity:** 2 (Minor)
- **Screen:** `10-mitglied-detail.jpg`
- **Region:** x=22%, y=24%, w=46%, h=76%
- **What we see:** Die Detailseite hat links ein Formular mit SaveBar (Mitgliedsart, Beitrag, SEPA) und rechts eigene Formulare (Karte, Beitrag als bezahlt markieren, Pausieren, Kündigen). Deren Absenden leitet per back() auf dieselbe Seite um. Die SaveBar warnt nur bei Links, also gehen geänderte Felder links ohne Hinweis verloren.
- **Why it matters:** Typischer Ablauf eines Kassenwarts: IBAN eintragen, dann rechts den Beitrag als bezahlt markieren, und die IBAN ist weg. Erst später fällt auf, dass das Mandat fehlt.
- **Recommendation:** Die SaveBar soll auch auf das submit-Ereignis anderer Formulare der Seite hören und dann fragen („Ungespeicherte Änderungen zuerst speichern?“ mit Speichern / Verwerfen). Alternativ die Aktionen der rechten Spalte deaktivieren, solange links etwas geändert ist, mit dem Tooltip „Erst speichern“.

#### 10.3 🟡 „Wieder offen“ neben „Bezahlt“ liest sich wie ein zweiter Status (`mitglied-wieder-offen-wirkt-wie-status`)

- **Heuristic:** [Content design: Specific, not generic](https://uxcontent.com/10-content-design-heuristics/) + [Norman (Signifier)](https://www.interaction-design.org/literature/article/the-principles-of-design-by-don-norman) + [Gestalt (Proximity)](https://en.wikipedia.org/wiki/Principles_of_grouping)
- **Severity:** 2 (Minor)
- **Screen:** `10-mitglied-detail.jpg`
- **Region:** x=71%, y=90%, w=27%, h=6%
- **What we see:** In der Karte „Beiträge“ steht hinter dem grünen Badge „Bezahlt“ der ghost-Knopf „Wieder offen“ ohne Rahmen. Optisch ist das eine Textzeile „Bezahlt … Wieder offen“, kein Knopf.
- **Why it matters:** Man liest, der Beitrag sei bezahlt und wieder offen, und weiß nicht, welcher Zustand gilt. Wer es als Knopf erkennt, setzt mit einem Klick Geld zurück auf offen.
- **Recommendation:** Als Verb beschriften („Als offen markieren“), als outline-Knopf darstellen oder in ein ⋯-Menü pro Beitrag verschieben. Dasselbe Wording in der Beitragsliste verwenden.

#### 10.4 ⚪ Die voreingestellte Zahlungsart ist im Feld abgeschnitten (`mitglied-zahlungsart-abgeschnitten`)

- **Heuristic:** [Nielsen #1 (Visibility of system status)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Gerhardt-Powals #2 (Reduce uncertainty)](https://en.wikipedia.org/wiki/Heuristic_evaluation#Gerhardt-Powals'_cognitive_engineering_principles)
- **Severity:** 1 (Cosmetic)
- **Screen:** `10-mitglied-detail.jpg`
- **Region:** x=23%, y=75%, w=22%, h=5%
- **What we see:** Das Feld „Zahlungsart“ zeigt „Überweisung (automatisch, kein |“. Der Rest der Option ist abgeschnitten, und es bleibt unklar, was „automatisch“ hier heißt.
- **Why it matters:** Die Zahlungsart entscheidet, ob ein Beitrag per Lastschrift eingezogen wird. Ein halber Satz an dieser Stelle verunsichert genau bei Geld.
- **Recommendation:** Die Option kurz beschriften („Überweisung (Standard)“) und die Erklärung („kein Mandat hinterlegt“) als Hinweis unter das Feld setzen, oder das Feld über die volle Breite gehen lassen.

#### 10.5 ⚪ Der Hinweis zur Mitgliedskarte sagt „ihn“ statt „sie“ (`mitglied-kartentext-grammatik`)

- **Heuristic:** [Content design: Plain language](https://uxcontent.com/10-content-design-heuristics/) + [Liking (Cialdini)](https://fs.blog/influence-psychology-persuasion/)
- **Severity:** 1 (Cosmetic)
- **Screen:** `10-mitglied-detail.jpg`
- **Region:** x=71%, y=27%, w=27%, h=9%
- **What we see:** „Das Mitglied sieht die Karte auch im Mitgliederbereich … und kann ihn dort selbst drucken.“ Das Pronomen bezieht sich auf die Karte.
- **Why it matters:** Kleine Sprachfehler senken das Vertrauen in eine Software, die mit Mitgliedsdaten und Geld arbeitet.
- **Recommendation:** „… und kann sie dort selbst drucken.“ In de.json unter membership.cardHint korrigieren.


### 11. Beiträge prüfen und einziehen

#### 11.1 🟠 „Erinnerung an alle Überfälligen“ verschickt sofort, ohne Anzahl und Vorschau (`beitraege-erinnerung-alle-ohne-rueckfrage`)

- **Heuristic:** TRUST.6 (Volume signposting) + TRUST.1 (Preview before commit) + [Nielsen #5 (Error prevention)](https://www.nngroup.com/articles/ten-usability-heuristics/)
- **Severity:** 3 (Major)
- **Screen:** `11-beitraege.jpg`
- **Region:** x=22%, y=23%, w=19%, h=4%
- **What we see:** Der erste Knopf im Kopf von „Beiträge“ ist ein Formular mit sendReminders ohne Bestätigung (src/app/(app)/members/dues/page.tsx:76-79). Ein Klick schickt allen Mitgliedern mit überfälligem Beitrag eine E-Mail. Genauso direkt laufen „Als eingezogen markieren“ für einen SEPA-Lauf (Zeile 171-174) und die Massenaktion „bezahlt“ in der Auswahlleiste (Zeile 230).
- **Why it matters:** E-Mails an Mitglieder lassen sich nicht zurückholen, und eine falsche Mahnung an zahlende Mitglieder kostet Vertrauen in den Vorstand. Bei Geldstatus fehlt jede Möglichkeit, die Zahl vor dem Klick zu prüfen. MCP und Sprout behandeln E-Mails und Geld bereits als gefährliche Aktionen, die App selbst nicht.
- **Recommendation:** data-confirm mit Anzahl und Summe setzen („2 Mitglieder an 88,00 € erinnern?“), im Hinweis eine Vorschau der Mail verlinken und die Uhrzeit der letzten Erinnerung nennen. „Als eingezogen markieren“ und die Massenaktion „bezahlt“ bekommen dieselbe Rückfrage mit Anzahl und Summe.


### 12. Beiträge auf dem Handy

#### 12.1 🟡 Auf dem Handy füllen fünf Knöpfe den Kopf der Beitragsseite (`beitraege-mobil-fuenf-knoepfe-im-kopf`)

- **Heuristic:** COG.2 (Primary action count) + [Hick's Law](https://lawsofux.com/hicks-law/) + [Fitts's Law](https://lawsofux.com/fittss-law/)
- **Severity:** 2 (Minor)
- **Screen:** `12-beitraege-mobil.jpg`
- **Region:** x=4%, y=21%, w=92%, h=9%
- **What we see:** Unter dem Titel brechen „Erinnerung an alle Überfälligen“, „Umlage“, „SEPA-Lastschrift“, ⋯ und „Beiträge erzeugen“ auf zwei Zeilen um. Ganz oben und am größten steht der E-Mail-Versand an alle.
- **Why it matters:** Am Handy schaut man meist nur nach, wer noch nicht bezahlt hat. Die Liste rutscht nach unten, und die folgenreichste Aktion ist am leichtesten zu treffen.
- **Recommendation:** Auf kleinen Bildschirmen nur die primäre Aktion zeigen und „Erinnerung“, „Umlage“ und „SEPA-Lastschrift“ ins ⋯-Menü legen (die Erinnerung als letzten Eintrag mit Rückfrage). Ab md bleibt die Leiste wie heute.


### 13. Angebote und Rechnungen

#### 13.1 🟡 Entwürfe heißen alle „Entwurf“ und sind nicht zu unterscheiden (`rechnungen-entwuerfe-ohne-titel`)

- **Heuristic:** [Gerhardt-Powals #5 (Use names conceptually related to function)](https://en.wikipedia.org/wiki/Heuristic_evaluation#Gerhardt-Powals'_cognitive_engineering_principles) + [Nielsen #6 (Recognition rather than recall)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Gestalt (Similarity)](https://en.wikipedia.org/wiki/Principles_of_grouping)
- **Severity:** 2 (Minor)
- **Screen:** `13-rechnungen.jpg`
- **Region:** x=22%, y=34%, w=16%, h=36%
- **What we see:** In der Spalte „Nummer“, der Titelspalte der Liste, steht bei drei Zeilen nur „Entwurf“. Zwei davon haben denselben Empfänger und denselben Betrag, einer hat keinen Empfänger und 0,00 €. Ein Datum fehlt bei allen Entwürfen. Auf dem Handy wird diese Spalte zum Kartentitel.
- **Why it matters:** Wer an einem Entwurf weiterarbeiten will, muss raten oder jeden öffnen. Doppelte Entwürfe bleiben liegen und werden versehentlich doppelt ausgestellt.
- **Recommendation:** Für Entwürfe einen sprechenden Titel zeigen (Betreff oder erste Position, sonst „Entwurf vom 10.10.2026“) und im Datum das Erstelldatum in grau. Leere Entwürfe (kein Empfänger, 0,00 €) in der Liste als „leer“ kennzeichnen und beim Verlassen eines leeren Entwurfs anbieten, ihn zu verwerfen.


### 14. Kontakt ansehen und ändern

#### 14.1 🟡 Die rechte Spalte der Kontaktseite ragt über den Rand und schneidet ab (`kontakt-detail-rechte-spalte-laeuft-ueber`)

- **Heuristic:** [Nielsen #8 (Aesthetic and minimalist design)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [WCAG 1.4.10 (Reflow)](https://www.w3.org/WAI/WCAG21/quickref/) + [Gestalt (Closure)](https://en.wikipedia.org/wiki/Principles_of_grouping)
- **Severity:** 2 (Minor)
- **Screen:** `14-kontakt-detail.jpg`
- **Region:** x=69%, y=22%, w=31%, h=74%
- **What we see:** Bei 1280 px Fenster ist die Seite 1302 px breit. Die Karten „Teamzugang“, „Mitgliedschaften“ und „Tickets“ sind 406 px breit, die Spalte nur 352 px (RecordLayout minmax(0,22rem)). Die Badges „Gültig“ und die rechten Kartenränder sind abgeschnitten, und es gibt eine waagerechte Scrollleiste.
- **Why it matters:** Auf der meistbesuchten Detailseite fehlen Statusangaben am Rand, und die Seite wirkt kaputt. Auf Laptops mit offener Sidebar und Sprout-Panel wird es schlimmer.
- **Recommendation:** Das Element finden, das min-content über 22rem treibt (wahrscheinlich eine flex-Zeile mit nicht kürzbarem Text in „Teamzugang“), und dort min-w-0 und truncate setzen. In RecordLayout zusätzlich overflow-hidden auf das aside und einen Test bei 1280 px mit offenem Sprout ergänzen.

#### 14.2 🟡 Ein Geburtstag in der Zukunft wird ohne Hinweis gespeichert (`kontakt-geburtstag-in-der-zukunft`)

- **Heuristic:** [Nielsen #5 (Error prevention)](https://www.nngroup.com/articles/ten-usability-heuristics/) + [Shneiderman #5 (Prevent errors)](https://www.cs.umd.edu/~ben/goldenrules.html)
- **Severity:** 2 (Minor)
- **Screen:** `14-kontakt-detail.jpg`
- **Region:** x=23%, y=52%, w=15%, h=6%
- **What we see:** Ein Kontakt hat als Geburtstag ein Datum in der Zukunft, nach dem Tag, an dem er angelegt wurde. Das Datumsfeld (TypedInput kind="date" in contact-form.tsx) hat kein max, und der Server prüft das Datum nicht auf Plausibilität.
- **Why it matters:** Altersabhängige Dinge (Jugendbeiträge, Briefe mit {Alter}, Geburtstagslisten, SEPA-Mandate Minderjähriger) rechnen dann mit falschen Werten, ohne dass es jemandem auffällt.
- **Recommendation:** max auf heute setzen und in fields.ts Daten in der Zukunft oder vor 1900 ablehnen („Geburtstag liegt in der Zukunft“). Dieselbe Regel gilt für Import und API, weil alle fields.ts nutzen.


## Things that work well

- Eine Seitenanatomie für alle Module (PageHeader mit Bereichs-Icon, Brotkrumen, ⋯-Menü, eine primäre Schaltfläche): wer ein Modul kennt, kennt alle.
- Die Leerzustände von Kontakte und Events erklären in einem Satz, wozu der Bereich da ist, und bieten die erste Aktion direkt an.
- „Neuer Kontakt“ gruppiert Felder nach Thema (Person, Kontaktdaten, Adresse) und sagt vorab „Ein Name oder eine Firma reicht“: niedrige Einstiegshürde.
- TypedInput gibt jedem Feldtyp die passende Handytastatur, Autofill, Formatierung beim Verlassen und eine Prüfung mit Begründung.
- Löschen landet im Papierkorb, der Dialog nennt die Anzahl und die 30-Tage-Frist zum Wiederherstellen (TRUST.4 und TRUST.6).
- Jeder Zustand steckt in der URL (Filter, Drawer, Seite): Zurück-Taste, Neuladen und geteilte Links funktionieren.
- Navigation reagiert sofort: Spinner im Sidebar-Icon, Skeleton pro Bereich, Spinner im Speichern-Knopf.
- Die Mitglieds-Detailseite rechnet das früheste Kündigungsdatum aus und nennt Frist und Grund („3 Monate Frist, zum Ende des Beitragszeitraums“).
- Der Kopf von „Beiträge“ fasst die Lage in einer Zeile zusammen („Offen: 88,00 € · davon überfällig: 88,00 €“), und „Heute“ zeigt überfällige Beiträge als Summe.
- Der Verlauf auf der Kontaktseite zeigt Notizen und Feldänderungen mit Person und Zeit (TRUST.5 Audit trail).
- Die Handy-Karten der Beitragsliste sind gut lesbar: Name als Titel, darunter Fälligkeit, Betrag und Status mit Bezeichnung.

## What we couldn't audit from screenshots alone

- Tastaturreihenfolge und Fokusführung beim Öffnen und Schließen von Drawern (Fokus zurück auf die auslösende Zeile?).
- Screenreader-Test der DataTable: auf dem Handy als Karten, ab md als Tabelle mit pro Zelle gestreckten Links.
- Genaue Kontrastmessung aller Dark-Mode-Tokens (border, input, muted-foreground) gegen card, popover und background.
- Prüfen, ob Toasts (sonner) von Screenreadern angesagt werden (aria-live) und lange genug stehen bleiben.
- Sprachsteuerung (Voice Control, Dragon) mit den Ein-Tasten-Kürzeln N und /.
- Verhalten der Speicherleiste bei der Browser-Zurück-Taste (popstate) in Seiten und Drawern.
- Gesamte Mitglieds-Detailseite per Tastatur: Reihenfolge zwischen Hauptformular, SaveBar und den Formularen der rechten Spalte.
- Kontrast der roten Status-Badges („Überfällig“) im Dark Mode messen.
