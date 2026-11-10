import { zonedTimeToUtc } from '@pann/shared'

/** Wall-clock time (HH:MM, 24 h) of an instant in a time zone. */
export function zonedTime(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/** Midday of a calendar day in a time zone: an instant safe to format that day with. */
export const middayOf = (day: string, timeZone: string) => zonedTimeToUtc(day, '12:00', timeZone)
