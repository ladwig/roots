// SEPA direct debit file (pain.008.001.08, CORE, recurring) for upload to online banking. Pure, tested.
export type SepaCreditor = { name: string; iban: string; bic?: string | null; creditorId: string }
export type SepaDebit = { id: string; name: string; iban: string; bic?: string | null; mandateRef: string; mandateDate: string; amountCents: number; text: string }

// SEPA allows only a small Latin character set; replace umlauts, drop the rest.
export function sepaText(s: string, max: number) {
  const map: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss", "&": "+" }
  return s
    .replace(/[äöüÄÖÜß&]/g, (c) => map[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9/?:().,'+ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}
const euro = (cents: number) => (cents / 100).toFixed(2)
const agent = (bic?: string | null) => (bic ? `<FinInstnId><BICFI>${bic}</BICFI></FinInstnId>` : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`)

export function pain008({ messageId, createdAt, collectionOn, creditor, debits }: { messageId: string; createdAt: Date; collectionOn: string; creditor: SepaCreditor; debits: SepaDebit[] }) {
  const sum = euro(debits.reduce((s, d) => s + d.amountCents, 0))
  const n = debits.length
  const txs = debits
    .map(
      (d) => `<DrctDbtTxInf><PmtId><EndToEndId>${d.id.replace(/-/g, "").slice(0, 35)}</EndToEndId></PmtId><InstdAmt Ccy="EUR">${euro(d.amountCents)}</InstdAmt><DrctDbtTx><MndtRltdInf><MndtId>${sepaText(d.mandateRef, 35)}</MndtId><DtOfSgntr>${d.mandateDate}</DtOfSgntr></MndtRltdInf></DrctDbtTx><DbtrAgt>${agent(d.bic)}</DbtrAgt><Dbtr><Nm>${sepaText(d.name, 70)}</Nm></Dbtr><DbtrAcct><Id><IBAN>${d.iban}</IBAN></Id></DbtrAcct><RmtInf><Ustrd>${sepaText(d.text, 140)}</Ustrd></RmtInf></DrctDbtTxInf>`,
    )
    .join("")
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08"><CstmrDrctDbtInitn><GrpHdr><MsgId>${messageId.slice(0, 35)}</MsgId><CreDtTm>${createdAt.toISOString().slice(0, 19)}</CreDtTm><NbOfTxs>${n}</NbOfTxs><CtrlSum>${sum}</CtrlSum><InitgPty><Nm>${sepaText(creditor.name, 70)}</Nm></InitgPty></GrpHdr><PmtInf><PmtInfId>${messageId.slice(0, 35)}</PmtInfId><PmtMtd>DD</PmtMtd><BtchBookg>true</BtchBookg><NbOfTxs>${n}</NbOfTxs><CtrlSum>${sum}</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>RCUR</SeqTp></PmtTpInf><ReqdColltnDt>${collectionOn}</ReqdColltnDt><Cdtr><Nm>${sepaText(creditor.name, 70)}</Nm></Cdtr><CdtrAcct><Id><IBAN>${creditor.iban}</IBAN></Id></CdtrAcct><CdtrAgt>${agent(creditor.bic)}</CdtrAgt><ChrgBr>SLEV</ChrgBr><CdtrSchmeId><Id><PrvtId><Othr><Id>${creditor.creditorId}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>${txs}</PmtInf></CstmrDrctDbtInitn></Document>
`
}
