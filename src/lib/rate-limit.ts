const pogingen = new Map<string, number[]>();

const VENSTER_MS = 60 * 60 * 1000;
const MAX_POGINGEN = 5;

export function magPogingDoen(ip: string): boolean {
  const nu = Date.now();
  const tijdstippen = (pogingen.get(ip) ?? []).filter((t) => nu - t < VENSTER_MS);
  if (tijdstippen.length >= MAX_POGINGEN) {
    pogingen.set(ip, tijdstippen);
    return false;
  }
  tijdstippen.push(nu);
  pogingen.set(ip, tijdstippen);
  return true;
}
