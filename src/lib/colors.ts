// PlantPulse color system
// Ported from VBA `barva` variable and wallboard border colors

/** 12-color cycle for planner batch bars (series_id mod 12) */
export const BATCH_BAR_COLORS = [
  '#5CADFF', // 0  Light blue
  '#FF9900', // 1  Orange
  '#0066FF', // 2  Indigo
  '#05FFFF', // 3  Teal
  '#66CCFF', // 4  Sky
  '#57EBFF', // 5  Cyan
  '#FF0000', // 6  Red
  '#E44C16', // 7  Novartis red
  '#FD0F0F', // 8  Carmine
  '#A90701', // 9  Novartis maroon
  '#28460A', // 10 Dark olive
  '#000000', // 11 Black
] as const;

/** 5-color cycle for wallboard bar borders (series_id mod 5) */
export const WALLBOARD_BORDER_COLORS = [
  '#385D8A', // 0  Steel blue
  '#C30308', // 1  Red
  '#DECA36', // 2  Gold
  '#020205', // 3  Near-black
  '#779E38', // 4  Olive green
] as const;

/** 4 shift team colors */
export const SHIFT_TEAM_COLORS = [
  '#0066FF', // Team 0 — Blue
  '#00CC00', // Team 1 — Green
  '#FF0000', // Team 2 — Red
  '#FFFD00', // Team 3 — Yellow
] as const;

export function getBatchBarColor(seriesNumber: number): string {
  return BATCH_BAR_COLORS[((seriesNumber % 12) + 12) % 12];
}

export function getWallboardBorderColor(seriesNumber: number): string {
  return WALLBOARD_BORDER_COLORS[((seriesNumber % 5) + 5) % 5];
}

export function getShiftTeamColor(teamIndex: number): string {
  return SHIFT_TEAM_COLORS[((teamIndex % 4) + 4) % 4];
}
