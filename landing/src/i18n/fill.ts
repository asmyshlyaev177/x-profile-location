/**
 * `'…read on {date}.'` + `{ date: '2 August 2026' }`.
 *
 * Deliberately minimal: no pluralisation, no number formatting, no nesting.
 * The only values substituted anywhere on this site are a formatted date, a
 * browser name and a URL, and each is already a finished string by the time it
 * arrives here.
 *
 * Its own module so components can use it without importing the dictionary
 * registry, which would put all fifteen languages in the client bundle.
 */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? values[key]! : whole,
  )
}
