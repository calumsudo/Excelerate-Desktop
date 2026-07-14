import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";

/**
 * The most recently completed month, represented by its last calendar day.
 * This is the default report month used by the portfolio pages and the monthly
 * date picker.
 */
export const getMostRecentCompletedMonth = (): CalendarDate => {
  const todayDate = today(getLocalTimeZone());
  const firstOfThisMonth = new CalendarDate(todayDate.year, todayDate.month, 1);
  // Last day of the previous month.
  return firstOfThisMonth.subtract({ days: 1 });
};
