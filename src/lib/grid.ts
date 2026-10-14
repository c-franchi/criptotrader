/** Index of the grid band containing `price` (0..levels-1), clamped to the range. */
export function gridLevel(price: number, lower: number, upper: number, levels: number): number {
  if (!(upper > lower) || levels < 1) throw new Error("Faixa da grade inválida");
  const step = (upper - lower) / levels;
  const i = Math.floor((price - lower) / step);
  return Math.max(0, Math.min(levels - 1, i));
}

export type GridDecision = { level: number; action: "nenhuma" | "compra" | "venda"; steps: number };

/** Price dropped N bands → buy N orders; rose N bands → sell N orders. First run only records the band. */
export function gridDecision(
  price: number, lower: number, upper: number, levels: number, lastLevel: number | null,
): GridDecision {
  const level = gridLevel(price, lower, upper, levels);
  if (lastLevel === null || lastLevel === level) return { level, action: "nenhuma", steps: 0 };
  return level < lastLevel
    ? { level, action: "compra", steps: lastLevel - level }
    : { level, action: "venda", steps: level - lastLevel };
}
