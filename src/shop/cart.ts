// The buyer's cart: a cookie per org (no account, no table). Server-only (Server Components / Actions).
import { cookies } from "next/headers"
import { readCart, type CartLine } from "./fields"

const name = (orgId: string) => `cart_${orgId.slice(0, 8)}` // several orgs can share a host (path mode)

export async function getCart(orgId: string) {
  return readCart((await cookies()).get(name(orgId))?.value)
}

export async function saveCart(orgId: string, cart: CartLine[]) {
  const jar = await cookies()
  if (!cart.length) jar.delete(name(orgId))
  else jar.set(name(orgId), JSON.stringify(cart), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 30 * 86_400, path: "/" })
}
