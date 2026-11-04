import { ShopLegal, shopLegalMeta } from "../legal"

export const generateMetadata = async ({ params }: PageProps<"/s/[site]/shop/agb">) => shopLegalMeta((await params).site, "terms")

export default async function Page({ params }: PageProps<"/s/[site]/shop/agb">) {
  return <ShopLegal slug={(await params).site} which="terms" />
}

export const instant = false
