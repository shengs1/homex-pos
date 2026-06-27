export function getCustomerTier(points: number): string {
  if (points >= 1000) return "DIAMOND";
  if (points >= 500) return "GOLD";
  if (points >= 100) return "SILVER";
  return "NONE";
}
