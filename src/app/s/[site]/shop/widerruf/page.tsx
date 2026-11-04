import { ShopLegal, shopLegalMeta } from "../legal"

export const generateMetadata = async ({ params }: PageProps<"/s/[site]/shop/widerruf">) => shopLegalMeta((await params).site, "withdrawal")

export default async function Page({ params }: PageProps<"/s/[site]/shop/widerruf">) {
  return <ShopLegal slug={(await params).site} which="withdrawal" />
}

export const instant = false
