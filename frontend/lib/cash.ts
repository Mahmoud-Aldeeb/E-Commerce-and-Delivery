// The store works in Egypt: the days and the weeks of the cash accounting are the ones of this
// time zone. The API uses the same one, so a day here is the same day there
export const STORE_TIME_ZONE = "Africa/Cairo";
export const MAX_RANGE_DAYS = 92; // the API refuses a longer report

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The calendar day of a moment in the store time zone, like "2026-11-01"
export function storeDayKey(date: Date): string {
  const parts = dayFormatter.formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDays(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

// How many days from `from` to `to` (0 for the same day)
export function daysBetween(from: string, to: string): number {
  const at = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

// The Saturday that starts the week of a day (a week is Saturday to Friday)
export function weekStartOf(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday ... 6 = Saturday
  return addDays(key, -((weekday + 1) % 7));
}

// The problem with a period, or null when it is fine (the same rules as the API)
export function checkRange(from: string, to: string): string | null {
  if (!from || !to) return "Choose both dates.";
  if (from > to) return "The start date must not be after the end date.";
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
    return `A report can cover at most ${MAX_RANGE_DAYS} days.`;
  }
  return null;
}

export type RangePreset = "last7" | "week" | "last30";

export function presetRange(
  preset: RangePreset,
  now = new Date(),
): { from: string; to: string } {
  const today = storeDayKey(now);
  switch (preset) {
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "week":
      return { from: weekStartOf(today), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
  }
}

// ---------- Showing dates ----------

// A calendar date is shown as it is: no time zone is involved (it would move the day)
const dayLabel = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const shortDayLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const keyToDate = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

// "Mon, Nov 2, 2026"
export const formatDayKey = (key: string): string =>
  dayLabel.format(keyToDate(key));

// "Oct 31 - Nov 6"
export const formatWeek = (start: string, end: string): string =>
  `${shortDayLabel.format(keyToDate(start))} - ${shortDayLabel.format(keyToDate(end))}`;

// "Nov 2"
export const formatShortDay = (key: string): string =>
  shortDayLabel.format(keyToDate(key));

// A moment, shown in the time of the store: it matches the days the API groups by
const storeDateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: STORE_TIME_ZONE,
});

export const formatStoreDateTime = (iso: string): string =>
  storeDateTime.format(new Date(iso));
