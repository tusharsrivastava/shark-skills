export function label(kind: string, count: number): string {
  if (kind === "seat" && count > 1) {
    return `${count} seats`;
  } else if (kind === "seat") {
    return "1 seat";
  }
  return kind;
}

export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
