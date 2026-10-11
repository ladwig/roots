// "12,50" / "12.50" / "12" → 1250 cents; null if invalid. And back for inputs: 1250 → "12,50".
export function parsePrice(raw: string): number | null {
  const v = raw.trim().replace(",", ".")
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return null
  return Math.round(Number(v) * 100)
}
export const priceInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",")
