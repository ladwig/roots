import { formatMoney, moneyCents } from "../lib/inputs.ts"

// "12,50" / "1.234,50" / "12.50" / "12" → cents (max 999 999,99); null if invalid. And back for inputs: 1250 → "12,50".
export function parsePrice(raw: string): number | null {
  const c = moneyCents(raw)
  return c !== null && c <= 99_999_999 ? c : null
}
export const priceInput = formatMoney
