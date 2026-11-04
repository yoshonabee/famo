// Calendar dates follow the browser's local day, without converting through UTC.
export function localDate(date = new Date()): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function adjacentDate(value: string, offset: number): string {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + offset)
  return localDate(date)
}
