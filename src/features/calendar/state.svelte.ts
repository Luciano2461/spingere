const now = new Date()

/** Mese mostrato dal calendario: resta lo stesso quando si torna indietro da un giorno o da una sessione. */
export const calendarView = $state({ year: now.getFullYear(), month: now.getMonth() })

export function shiftMonth(delta: number): void {
  const d = new Date(calendarView.year, calendarView.month + delta, 1)
  calendarView.year = d.getFullYear()
  calendarView.month = d.getMonth()
}

export function showMonthOf(date: Date): void {
  calendarView.year = date.getFullYear()
  calendarView.month = date.getMonth()
}
