import { addDays, differenceInCalendarDays, format, isAfter, isBefore, parseISO, startOfDay } from 'date-fns';

const ISO_DATE_FORMAT = 'yyyy-MM-dd';

export function todayDate(now = new Date()) {
  return startOfDay(now);
}

export function todayISO(now = new Date()) {
  return toISODate(todayDate(now));
}

export function toISODate(date: Date) {
  return format(date, ISO_DATE_FORMAT);
}

export function parseLocalDate(date: string) {
  return startOfDay(parseISO(date));
}

export function isDateBeforeToday(date: string, today = todayDate()) {
  return isBefore(parseLocalDate(date), today);
}

export function isDateAfterToday(date: string, today = todayDate()) {
  return isAfter(parseLocalDate(date), today);
}

export function daysBetweenDates(startDate: Date, endDate: Date) {
  return differenceInCalendarDays(startOfDay(endDate), startOfDay(startDate));
}

export function formatDateLabel(date: string, pattern = 'EEE, MMM d') {
  return format(parseLocalDate(date), pattern);
}

export function formatMonthYear(date: string) {
  return format(parseLocalDate(date), 'MMMM yyyy');
}

export function createRecentHistory(values: number[], endDate = todayDate()) {
  return values.map((value, index) => ({
    date: toISODate(addDays(endDate, index - values.length + 1)),
    value,
  }));
}

export function defaultGoalDate(daysFromToday = 90) {
  return toISODate(addDays(todayDate(), daysFromToday));
}

export function getTimeOfDayGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
