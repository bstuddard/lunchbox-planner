const pad = (n: number) => String(n).padStart(2, '0')
export function localDate(d = new Date()) {
  return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-')
}
export function noon(iso: string) {
  return new Date(iso + 'T12:00:00')
}
export function addDays(iso: string, n: number) {
  const d = noon(iso)
  d.setDate(d.getDate() + n)
  return localDate(d)
}
export function monday(iso: string, upcoming = false) {
  const day = (noon(iso).getDay() + 6) % 7
  return addDays(iso, upcoming && day > 4 ? 7 - day : -day)
}
export function formatDate(
  iso: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  return noon(iso).toLocaleDateString(undefined, options)
}
export function weekRange(week: string) {
  return formatDate(week) + ' – ' + formatDate(addDays(week, 4))
}
