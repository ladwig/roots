// Files (see migration 20261012100000_files): private bucket "files", rows in public.files.
export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const FILE_PATH = /^orgs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,10}$/

export function fileSize(bytes: number, locale: string) {
  const units = ["B", "KB", "MB", "GB"]
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toLocaleString(locale, { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`
}
