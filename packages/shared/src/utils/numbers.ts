export function round(value: number, decimals = 8): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
