import type { Metadata } from "next"
import { getT } from "@/i18n/server"

/** Tab title for an App area ("Kontakte – roots" via the root layout's template): `export const generateMetadata = titled("contacts.nav")`. */
export const titled = (key: string) => async (): Promise<Metadata> => ({ title: (await getT()).dynamic(key) })
