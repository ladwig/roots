-- Default letter template "Mietvertrag" (roots default, org_id null): filled from the contact's newest rental via the
-- rental_* placeholders; orgs copy and adapt it ("Kopieren & anpassen").
insert into public.letter_templates (name, title, body, fields) values (
  'Mietvertrag', 'Mietvertrag',
  '<p>Zwischen <strong>{org}</strong> (Vermieter) und <strong>{rental_people}</strong> (Mieter:in) wird folgender Vertrag geschlossen:</p>'
  || '<h3>§ 1 Mietgegenstand</h3><p>Vermietet wird: <strong>{rental_object}</strong>. {details}</p>'
  || '<h3>§ 2 Mietzeit</h3><p>Das Mietverhältnis beginnt am {rental_start}. {rental_term}</p>'
  || '<h3>§ 3 Miete und Kaution</h3><p>Die Miete beträgt {rental_rent}. Die Kaution beträgt {rental_deposit}.</p>'
  || '<h3>§ 4 Kündigung</h3><p>Die Kündigungsfrist beträgt {rental_notice}. Die Kündigung bedarf der Textform.</p>'
  || '<h3>§ 5 Schlüssel</h3><p>Ausgehändigte Schlüssel sind bei Ende des Mietverhältnisses vollständig zurückzugeben.</p>'
  || '<h3>§ 6 Sonstiges</h3><p>{other}</p>'
  || '<p><br>______________________________<br>{org}</p><p><br>______________________________<br>{rental_people}</p>',
  '[{"key": "details", "label": "Beschreibung / Ausstattung", "type": "textarea"}, {"key": "rental_term", "label": "Laufzeit (z. B. unbefristet / bis …)", "type": "text"}, {"key": "other", "label": "Sonstige Vereinbarungen", "type": "textarea"}]'
);
