export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export function parsePesos(text: string): Parsed<number | null> {
  const cleaned = text.replace(/[₱,\s]/g, "");
  if (cleaned === "") return { ok: true, value: null };

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    return {
      ok: false,
      error: "Enter an amount in pesos, to at most two decimal places.",
    };
  }

  const pesos = Number(match[1]);
  const centavos = Number((match[2] ?? "").padEnd(2, "0"));
  return { ok: true, value: pesos * 100 + centavos };
}
