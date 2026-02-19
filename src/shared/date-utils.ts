/**
 * Converts a date to UTC midnight (start of day in UTC)
 */
export function toUtcMidnight(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Generates an array of dates (UTC midnight) from startDate to endDate inclusive.
 */
export function generateDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const current = toUtcMidnight(startDate);
  const end = toUtcMidnight(endDate);

  while (current <= end) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}
