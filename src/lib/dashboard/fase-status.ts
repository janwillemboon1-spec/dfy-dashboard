export function faseStatusLabel(percentage: number): string {
  if (percentage >= 100) return 'Afgerond';
  if (percentage <= 0) return 'Nog niet gestart';
  return `${percentage}%`;
}
