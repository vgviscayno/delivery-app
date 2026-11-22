const DIGITS_AFTER_09 = 9;

export function editMobileField(previous: string, text: string): string {
  const before = digitsOf(previous);
  let digits = digitsOf(text);

  if (digits === before && text.length < previous.length) {
    const at = firstDifference(previous, text);
    const digitsBefore = digitsOf(previous.slice(0, at)).length;
    digits = digits.slice(0, digitsBefore - 1) + digits.slice(digitsBefore);
  } else if (digits.length - before.length > 1 && digits.length > DIGITS_AFTER_09) {
    const national = digits.replace(/^63/, "").replace(/^0/, "");
    if (national.startsWith("9")) digits = national.slice(1);
  }

  return grouped(digits.slice(0, DIGITS_AFTER_09));
}

export function mobileFieldOf(accountPhone: string): string {
  return editMobileField("", accountPhone);
}

export function typedMobile(field: string): string {
  return `09${field}`;
}

function grouped(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5)]
    .filter((group) => group !== "")
    .join(" ");
}

function digitsOf(text: string): string {
  return text.replace(/\D/g, "");
}

function firstDifference(a: string, b: string): number {
  let at = 0;
  while (at < b.length && a[at] === b[at]) at++;
  return at;
}
