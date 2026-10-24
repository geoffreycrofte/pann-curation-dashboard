/** Frequencies offered in selects, in hours. */
export const INTERVAL_PRESETS = [6, 12, 24, 48, 72, 168, 336, 720] as const

export function intervalOptions(current?: number | null): number[] {
  const list: number[] = [...INTERVAL_PRESETS]
  if (current && !list.includes(current)) list.push(current)
  return list.sort((a, b) => a - b)
}

type Translate = (key: string, plural: number) => string

/** "Toutes les 6 heures", "Tous les 2 jours", "Toutes les semaines"… */
export function formatInterval(hours: number, t: Translate): string {
  if (hours % 168 === 0) return t('interval.weeks', hours / 168)
  if (hours % 24 === 0) return t('interval.days', hours / 24)
  return t('interval.hours', hours)
}
