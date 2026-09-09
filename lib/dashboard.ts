export type DashboardStats = {
  averageDailyMs: number;
  daysWorked: number;
  lastSevenDaysMs: number;
  completedShifts: number;
  activeEntry: { collabName: string; clockIn: number } | null;
};
