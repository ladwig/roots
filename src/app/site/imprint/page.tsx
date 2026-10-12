import type { Metadata } from "next"
import { COMPANY, LegalPage } from "../legal"

export const metadata: Metadata = { title: "Impressum · roots" }

export default function Imprint() {
  const c = COMPANY
  return (
    <LegalPage title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        {c.name}
        <br />
        {c.street}
        <br />
        {c.city}
        <br />
        {c.country}
      </p>
      {(c.represented || c.register || c.vat) && (
        <p>
          {c.represented && (
            <>
              Vertreten durch den Vorstand: {c.represented}
              <br />
            </>
          )}
          {c.register && (
            <>
              Registereintrag: {c.register}
              <br />
            </>
          )}
          {c.vat && <>Umsatzsteuer-ID gemäß § 27a UStG: {c.vat}</>}
        </p>
      )}

      {(c.email || c.phone) && (
        <>
          <h2>Kontakt</h2>
          <p>
            {c.email && (
              <>
                E-Mail: {c.email}
                <br />
              </>
            )}
            {c.phone && <>Telefon: {c.phone}</>}
          </p>
        </>
      )}

      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>
        {c.represented || c.name}, {c.street}, {c.city}
      </p>

      <h2>Verbraucherstreitbeilegung</h2>
      <p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>

      <h2>Haftung für Inhalte</h2>
      <p>
        Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Wir sind jedoch nicht verpflichtet, übermittelte oder
        gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Inhalte, die Organisationen über roots
        veröffentlichen (zum Beispiel Veranstaltungsseiten oder Formulare), liegen in deren Verantwortung. Sobald uns eine Rechtsverletzung bekannt wird, entfernen wir die
        betroffenen Inhalte umgehend.
      </p>

      <h2>Haftung für Links</h2>
      <p>
        Unsere Seiten enthalten Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für diese Inhalte ist stets der jeweilige Anbieter oder Betreiber
        verantwortlich. Bei Bekanntwerden von Rechtsverletzungen entfernen wir derartige Links umgehend.
      </p>

      <h2>Urheberrecht und Bildnachweise</h2>
      <p>
        Die Texte und Gestaltung dieser Website unterliegen dem deutschen Urheberrecht. Die gezeigten Gemälde (Pieter Bruegel d. Ä., Pierre-Auguste Renoir, Albrecht Dürer, Claude
        Lorrain) sind gemeinfrei; die Abbildungen stammen aus Wikimedia Commons.
      </p>
    </LegalPage>
  )
}
