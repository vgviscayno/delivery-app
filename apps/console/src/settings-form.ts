import type { ShopSettings, ShopSettingsEdits } from "@courier/domain";

/**
 * The settings form as the dispatcher types it: pesos rather than centavos, kilometres
 * rather than metres, a phone number however they are used to writing it. An empty
 * field is a setting nobody has agreed a value for yet.
 */
export interface SettingsForm {
  readonly sameDayCutoffBufferMinutes: string;
  readonly deliveryRadiusKm: string;
  readonly deliveryFeePesos: string;
  readonly shopPhone: string;
  readonly endOfDay: string;
  readonly darkThresholdMinutes: string;
  readonly timeConfirmationCutoff: string;
}

export type SettingsFormErrors = Partial<Record<keyof SettingsForm, string>>;

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export type SettingsFormResult =
  | { readonly ok: true; readonly edits: ShopSettingsEdits }
  | { readonly ok: false; readonly errors: SettingsFormErrors };

export function formFromSettings(settings: ShopSettings): SettingsForm {
  return {
    sameDayCutoffBufferMinutes: String(settings.sameDayCutoffBufferMinutes),
    deliveryRadiusKm:
      settings.deliveryRadiusMeters === null
        ? ""
        : String(settings.deliveryRadiusMeters / 1000),
    deliveryFeePesos:
      settings.deliveryFeeCentavos === null
        ? ""
        : (settings.deliveryFeeCentavos / 100).toFixed(2),
    shopPhone: settings.shopPhone ?? "",
    endOfDay: settings.endOfDay,
    darkThresholdMinutes: String(settings.darkThresholdMinutes),
    timeConfirmationCutoff: settings.timeConfirmationCutoff ?? "",
  };
}

/**
 * Reads the whole form, checking every field rather than stopping at the first, so the
 * dispatcher sees everything to fix in one go. The bounds repeat the server's checks to
 * say what is wrong in words; the server still has the last say.
 */
export function readSettingsForm(form: SettingsForm): SettingsFormResult {
  const fields = {
    sameDayCutoffBufferMinutes: notEmpty(
      parseWholeNumber(form.sameDayCutoffBufferMinutes, 0, 720),
    ),
    deliveryRadiusKm: parseKilometres(form.deliveryRadiusKm),
    deliveryFeePesos: parsePesos(form.deliveryFeePesos),
    shopPhone: parseShopPhone(form.shopPhone),
    endOfDay: notEmpty(parseTime(form.endOfDay)),
    darkThresholdMinutes: notEmpty(parseWholeNumber(form.darkThresholdMinutes, 1, 120)),
    timeConfirmationCutoff: parseTime(form.timeConfirmationCutoff),
  };

  const errors: SettingsFormErrors = {};
  for (const [name, result] of Object.entries(fields)) {
    if (!result.ok) errors[name as keyof SettingsForm] = result.error;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const value = <T>(parsed: Parsed<T>): T => {
    if (!parsed.ok) throw new Error("unreachable: every field was checked above");
    return parsed.value;
  };

  return {
    ok: true,
    edits: {
      sameDayCutoffBufferMinutes: value(fields.sameDayCutoffBufferMinutes),
      deliveryRadiusMeters: value(fields.deliveryRadiusKm),
      deliveryFeeCentavos: value(fields.deliveryFeePesos),
      shopPhone: value(fields.shopPhone),
      endOfDay: value(fields.endOfDay),
      darkThresholdMinutes: value(fields.darkThresholdMinutes),
      timeConfirmationCutoff: value(fields.timeConfirmationCutoff),
    },
  };
}

/**
 * Pesos as typed — `50`, `50.5`, `₱1,250.00` — into whole centavos. Done on the digits
 * rather than by multiplying a float, so `0.29` is 29 centavos and not 28.999….
 */
function parsePesos(text: string): Parsed<number | null> {
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

/**
 * A Philippine number however it is written — `0917 123 4567`, `+63 917-123-4567`,
 * `(02) 8123 4567` — into E.164, `+639171234567`, which is how it is stored.
 */
function parseShopPhone(text: string): Parsed<string | null> {
  const cleaned = text.replace(/[\s\-().]/g, "");
  if (cleaned === "") return { ok: true, value: null };

  const national = /^(?:\+63|63|0)(\d+)$/.exec(cleaned)?.[1];
  // A mobile number has 10 digits after the country code, a landline 9.
  if (!national || national.length < 9 || national.length > 10 || national[0] === "0") {
    return {
      ok: false,
      error: "Enter a Philippine number, such as 0917 123 4567 or (02) 8123 4567.",
    };
  }

  return { ok: true, value: `+63${national}` };
}

/** Kilometres, as typed, into whole metres. */
function parseKilometres(text: string): Parsed<number | null> {
  const cleaned = text.trim();
  if (cleaned === "") return { ok: true, value: null };

  const km = /^\d+(?:\.\d{1,3})?$/.test(cleaned) ? Number(cleaned) : Number.NaN;
  if (!(km > 0)) {
    return { ok: false, error: "Enter a distance in kilometres greater than zero." };
  }
  return { ok: true, value: Math.round(km * 1000) };
}

function parseWholeNumber(text: string, min: number, max: number): Parsed<number | null> {
  const cleaned = text.trim();
  if (cleaned === "") return { ok: true, value: null };

  const value = /^\d+$/.test(cleaned) ? Number(cleaned) : Number.NaN;
  if (!(value >= min && value <= max)) {
    return { ok: false, error: `Enter a whole number from ${min} to ${max}.` };
  }
  return { ok: true, value };
}

/** `HH:MM`, as an `<input type="time">` gives it. */
function parseTime(text: string): Parsed<string | null> {
  const cleaned = text.trim();
  if (cleaned === "") return { ok: true, value: null };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cleaned)) {
    return { ok: false, error: "Enter a time as HH:MM." };
  }
  return { ok: true, value: cleaned };
}

/** For settings that always have a value: the business agreed one at the start. */
function notEmpty<T>(parsed: Parsed<T | null>): Parsed<T> {
  if (!parsed.ok) return parsed;
  if (parsed.value === null) return { ok: false, error: "This setting cannot be empty." };
  return { ok: true, value: parsed.value };
}
