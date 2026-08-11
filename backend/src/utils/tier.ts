export function getCustomerTier(points: number): string {
  if (points >= 3000) return "DIAMOND";
  if (points >= 1000) return "GOLD";
  if (points >= 200) return "SILVER";
  return "NONE";
}
