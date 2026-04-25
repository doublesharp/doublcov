export function add(left: number, right: number): number {
  return left + right;
}

export function maybeDouble(value: number, enabled: boolean): number {
  return enabled ? value * 2 : value;
}

