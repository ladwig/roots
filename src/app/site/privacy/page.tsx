import type { Metadata } from "next"
import { COMPANY, LegalPage } from "../legal"

export const metadata: Metadata = { title: { absolute: "roots" } }

// Matches what the code does today: no analytics/tracking, only necessary cookies, fonts + images served by us.
// Update this page when a new third-party service is added (hosting, email, payments, analytics …).
export default function Privacy() {
  const c = COMPANY
  return (
    <LegalPage title="Datenschutzerklärung">
      <h2>1. Verantwortlicher</h2>
      <p>
        {c.name}, {c.street}, {c.city}, {c.country}
        {c.email && (
          <>
            <br />
            E-Mail: {c.email}
          </>
        )}
      </p>
      <p>
        Diese Erklärung gilt für die Website und für die Nutzung von roots durch Organisationen und ihre Teammitglieder. Wenn eine Organisation über roots Daten ihrer Mitglieder,
        Kontakte oder Kund:innen verarbeitet (zum Beispiel Mitgliederlisten, Ticketkäufe oder Formulareinsendungen), ist die Organisation dafür verantwortlich; wir verarbeiten
        diese Daten als Auftragsverarbeiter nach Art. 28 DSGVO auf Grundlage eines Auftragsverarbeitungsvertrags. Fragen dazu richtet ihr bitte zuerst an die jeweilige
        Organisation.
      </p>

      <h2>2. Besuch der Website</h2>
      <p>
        Beim Aufruf unserer Seiten verarbeitet unser Hosting-Anbieter technisch notwendige Daten (IP-Adresse, Datum und Uhrzeit, aufgerufene Seite, Browser- und
        Geräteinformationen) in Server-Logs, um die Website sicher und stabil auszuliefern. Rechtsgrundlage ist unser berechtigtes Interesse nach Art. 6 Abs. 1 lit. f DSGVO. Die
        Logs werden nach kurzer Zeit automatisch gelöscht.
      </p>
      <p>Wir setzen keine Analyse- oder Werbe-Tools ein und binden keine Inhalte von Drittanbietern ein. Schriften und Bilder werden von unseren eigenen Servern geladen.</p>

      <h2>3. Cookies</h2>
      <p>
        Wir verwenden nur Cookies, die für den Betrieb nötig sind: ein Sitzungs-Cookie nach der Anmeldung, ein Cookie für die gewählte Sprache und ein Cookie für die aktive
        Organisation sowie, im Mitgliederbereich einer Organisation, ein Sitzungs-Cookie nach der Anmeldung per E-Mail-Link. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG; eine
        Einwilligung ist dafür nicht erforderlich. Tracking-Cookies setzen wir nicht.
      </p>

      <h2>4. Konto und Nutzung von roots</h2>
      <p>
        Für ein Konto verarbeiten wir E-Mail-Adresse, Passwort (nur verschlüsselt gespeichert), Name und optional ein Profilbild sowie die Daten, die ihr in roots eingebt.
        Rechtsgrundlage ist die Erfüllung des Vertrags nach Art. 6 Abs. 1 lit. b DSGVO. Änderungen an Daten protokollieren wir zur Nachvollziehbarkeit und Sicherheit (Art. 6 Abs. 1
        lit. f DSGVO). Wenn ihr euer Konto löscht, löschen wir eure personenbezogenen Daten, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
      </p>

      <h2>5. E-Mails</h2>
      <p>
        Wir versenden Anmelde-Links, Einladungen und Benachrichtigungen per E-Mail. Organisationen können über roots außerdem E-Mails an ihre Kontakte senden; jede Rundmail enthält
        einen Abmeldelink. Für den Versand nutzen wir einen E-Mail-Dienstleister, der die Daten in unserem Auftrag verarbeitet.
      </p>

      <h2>6. Zahlungen</h2>
      <p>
        Wenn ihr bei einer Organisation bezahlt (zum Beispiel für Tickets), erfolgt die Zahlung über den Zahlungsanbieter der Organisation (Stripe oder SumUp). Eure Zahlungsdaten
        gebt ihr direkt beim Anbieter ein; wir erhalten nur den Status der Zahlung und die Bestelldaten.
      </p>

      <h2>7. Dienstleister und Übermittlung in Drittländer</h2>
      <p>Wir setzen sorgfältig ausgewählte Auftragsverarbeiter ein:</p>
      <ul>
        <li>Vercel Inc. (Hosting der Anwendung; Rechenzentrum in London)</li>
        <li>Supabase Inc. (Datenbank, Anmeldung und Dateispeicher; Rechenzentrum in London)</li>
        <li>Resend Inc. (E-Mail-Versand)</li>
        <li>Stripe und SumUp (Zahlungsabwicklung, wenn eine Organisation sie verbindet)</li>
      </ul>
      <p>
        Für das Vereinigte Königreich besteht ein Angemessenheitsbeschluss der EU-Kommission. Soweit Daten in die USA übermittelt werden, stützen wir uns auf das EU-US Data Privacy
        Framework bzw. auf Standardvertragsklauseln der EU-Kommission.
      </p>

      <h2>8. Eure Rechte</h2>
      <p>
        Ihr habt das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und
        Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). Eine erteilte Einwilligung könnt ihr jederzeit widerrufen. Schreibt uns dazu{" "}
        {c.email ? `an ${c.email}` : "an die oben genannte Anschrift"}.
      </p>
      <p>
        Außerdem könnt ihr euch bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der Berliner Beauftragten für Datenschutz und Informationsfreiheit, Alt-Moabit
        59–61, 10555 Berlin.
      </p>
    </LegalPage>
  )
}
