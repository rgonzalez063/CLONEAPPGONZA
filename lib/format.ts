/** Dollar formatting shared by the widget, comments and exports. Small rates keep cents. */
export function money(v: number): string {
  const a = Math.abs(v)
  const body = a >= 1000 ? Math.round(a).toLocaleString('en-US') : a >= 100 ? a.toFixed(0) : a.toFixed(2)
  return `${v < 0 ? '-' : ''}$${body}`
}

export const perUnit = (unit: string): string => (unit === 'sqft' ? ' per square foot' : unit === 'years' ? ' per year of age' : '')
