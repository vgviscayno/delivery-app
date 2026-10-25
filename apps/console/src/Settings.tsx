import {
  addShopClosure,
  type CourierClient,
  fetchShopSettings,
  removeShopClosure,
  replaceQrPhImage,
  saveShopSettings,
  setOrderingDay,
  signShopImage,
} from "@courier/api-client";
import type { OrderingDay, ShopSettings } from "@courier/domain";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  formFromSettings,
  readSettingsForm,
  type SettingsForm,
  type SettingsFormErrors,
} from "./settings-form.js";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type Load =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly settings: ShopSettings }
  | { readonly state: "error"; readonly message: string };

/**
 * The console's settings surface: the shop's rules, the Ordering window, closure dates
 * and the QR Ph image. Every change goes to the server and the whole surface is read
 * back afterwards, so what is shown is always what customers and drivers now see.
 */
export function Settings({ client }: { client: CourierClient }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const reload = useCallback(async () => {
    try {
      setLoad({ state: "ready", settings: await fetchShopSettings(client) });
    } catch (error) {
      setLoad({ state: "error", message: messageOf(error) });
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (load.state === "loading") return <p className="detail">Loading settings…</p>;
  if (load.state === "error") {
    return (
      <p className="notice" role="alert">
        {load.message}
      </p>
    );
  }

  const { settings } = load;
  return (
    <div className="settings">
      <RulesSection client={client} settings={settings} onSaved={reload} />
      <OrderingWindowSection
        client={client}
        orderingWindow={settings.orderingWindow}
        onSaved={reload}
      />
      <ClosuresSection client={client} settings={settings} onSaved={reload} />
      <QrPhSection client={client} path={settings.qrPhImagePath} onSaved={reload} />
    </div>
  );
}

interface SectionProps {
  readonly client: CourierClient;
  readonly onSaved: () => Promise<void>;
}

/**
 * Runs one write: shows it as busy, reports a failure in words, and reads everything
 * back after a success.
 */
function useWrite(onSaved: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = useCallback(
    async (write: () => Promise<unknown>) => {
      setBusy(true);
      setError(undefined);
      try {
        await write();
        await onSaved();
        return true;
      } catch (thrown) {
        setError(messageOf(thrown));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onSaved],
  );

  return { busy, error, run };
}

function RulesSection({
  client,
  settings,
  onSaved,
}: SectionProps & { settings: ShopSettings }) {
  const [form, setForm] = useState<SettingsForm>(() => formFromSettings(settings));
  const [errors, setErrors] = useState<SettingsFormErrors>({});
  const { busy, error, run } = useWrite(onSaved);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const read = readSettingsForm(form);
    if (!read.ok) {
      setErrors(read.errors);
      return;
    }
    setErrors({});
    await run(() => saveShopSettings(client, read.edits));
  }

  const field = (
    name: keyof SettingsForm,
    label: string,
    input: InputProps,
    hint?: string,
  ) => (
    <label>
      <span>{label}</span>
      <input
        {...input}
        value={form[name]}
        aria-invalid={errors[name] ? true : undefined}
        onChange={(event) => setForm({ ...form, [name]: event.target.value })}
      />
      {errors[name] ? (
        <span className="notice">{errors[name]}</span>
      ) : (
        hint && <span className="detail">{hint}</span>
      )}
    </label>
  );

  return (
    <section aria-labelledby="rules-heading">
      <h2 id="rules-heading">Shop rules</h2>
      <form onSubmit={submit} className="settings-form">
        {field(
          "deliveryFeePesos",
          "Delivery fee (₱)",
          { inputMode: "decimal" },
          "Blank until agreed.",
        )}
        {field(
          "deliveryRadiusKm",
          "Delivery radius (km)",
          { inputMode: "decimal" },
          "Road distance from the Shop pin.",
        )}
        {field("shopPhone", "Shop phone", { type: "tel" }, "Stored as +63…")}
        {field(
          "sameDayCutoffBufferMinutes",
          "Same-day cutoff buffer (minutes)",
          { inputMode: "numeric", required: true },
          "Today stops being offered this long before the window closes.",
        )}
        {field(
          "endOfDay",
          "End of day",
          { type: "time", required: true },
          "Duty auto-ends for drivers holding no work.",
        )}
        {field(
          "darkThresholdMinutes",
          "Dark threshold (minutes)",
          { inputMode: "numeric", required: true },
          "No fix for this long and a driver holding work is dark.",
        )}
        {field(
          "timeConfirmationCutoff",
          "Time confirmation morning cut-off",
          { type: "time" },
          "Orders still pending at this time on their day are cancelled.",
        )}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save rules"}
          </button>
          <Failure message={error} />
        </div>
      </form>
    </section>
  );
}

function OrderingWindowSection({
  client,
  orderingWindow,
  onSaved,
}: SectionProps & { orderingWindow: readonly OrderingDay[] }) {
  return (
    <section aria-labelledby="window-heading">
      <h2 id="window-heading">Ordering window</h2>
      <p className="detail">The days and hours customers may ask for a delivery.</p>
      <table className="ordering-window">
        <tbody>
          {WEEKDAYS.map((name, index) => {
            const weekday = index + 1;
            const day = orderingWindow.find((each) => each.weekday === weekday);
            return (
              <OrderingDayRow
                // A fresh row whenever the saved hours change, so its inputs start from them.
                key={`${weekday}-${day?.opensAt}-${day?.closesAt}`}
                client={client}
                weekday={weekday}
                name={name}
                day={day}
                onSaved={onSaved}
              />
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function OrderingDayRow({
  client,
  weekday,
  name,
  day,
  onSaved,
}: SectionProps & { weekday: number; name: string; day: OrderingDay | undefined }) {
  const [opensAt, setOpensAt] = useState(day?.opensAt ?? "08:00");
  const [closesAt, setClosesAt] = useState(day?.closesAt ?? "16:00");
  const { busy, error, run } = useWrite(onSaved);

  return (
    <tr>
      <th scope="row">{name}</th>
      <td>{day ? "Open" : "Closed"}</td>
      <td>
        <input
          type="time"
          aria-label={`${name} opens`}
          value={opensAt}
          onChange={(event) => setOpensAt(event.target.value)}
        />
        {" – "}
        <input
          type="time"
          aria-label={`${name} closes`}
          value={closesAt}
          onChange={(event) => setClosesAt(event.target.value)}
        />
      </td>
      <td>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() => setOrderingDay(client, weekday, { opensAt, closesAt }))
          }
        >
          {day ? "Save hours" : "Open"}
        </button>
        {day && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => setOrderingDay(client, weekday, null))}
          >
            Close
          </button>
        )}
        <Failure message={error} />
      </td>
    </tr>
  );
}

function ClosuresSection({
  client,
  settings,
  onSaved,
}: SectionProps & { settings: ShopSettings }) {
  const [closedOn, setClosedOn] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, run } = useWrite(onSaved);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const added = await run(() => addShopClosure(client, closedOn, note.trim() || null));
    if (added) {
      setClosedOn("");
      setNote("");
    }
  }

  return (
    <section aria-labelledby="closures-heading">
      <h2 id="closures-heading">Closure dates</h2>
      <p className="detail">
        Days the shop does not deliver, whatever the weekday hours say.
      </p>
      {settings.closures.length === 0 ? (
        <p className="detail">No closures coming up.</p>
      ) : (
        <ul className="closures">
          {settings.closures.map((closure) => (
            <li key={closure.closedOn}>
              <span>{closure.closedOn}</span>
              <span className="detail">{closure.note}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() => removeShopClosure(client, closure.closedOn))
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="closure-form">
        <input
          type="date"
          aria-label="Closed on"
          required
          value={closedOn}
          onChange={(event) => setClosedOn(event.target.value)}
        />
        <input
          type="text"
          aria-label="Note"
          placeholder="Note (optional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <button type="submit" disabled={busy}>
          Add closure
        </button>
      </form>
      <Failure message={error} />
    </section>
  );
}

function QrPhSection({ client, path, onSaved }: SectionProps & { path: string | null }) {
  const [url, setUrl] = useState<string>();
  const [file, setFile] = useState<File>();
  const { busy, error, run } = useWrite(onSaved);

  // The bucket is private, so the image is shown through a short-lived signed link.
  useEffect(() => {
    let live = true;
    setUrl(undefined);
    if (path) {
      signShopImage(client, path).then(
        (signed) => live && setUrl(signed),
        () => live && setUrl(undefined),
      );
    }
    return () => {
      live = false;
    };
  }, [client, path]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const form = event.currentTarget;
    if (await run(() => replaceQrPhImage(client, file))) {
      setFile(undefined);
      form.reset();
    }
  }

  return (
    <section aria-labelledby="qr-heading">
      <h2 id="qr-heading">QR Ph code</h2>
      <p className="detail">What customers scan to pay. PNG, JPEG or WebP, up to 2 MB.</p>
      {path === null ? (
        <p className="detail">No QR Ph code uploaded yet.</p>
      ) : url ? (
        <img className="qr-ph" src={url} alt="The shop's current QR Ph code" />
      ) : (
        <p className="detail">Loading the current code…</p>
      )}
      <form onSubmit={submit} className="qr-form">
        <input
          type="file"
          aria-label="New QR Ph image"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => setFile(event.target.files?.[0])}
        />
        <button type="submit" disabled={busy || !file}>
          {busy ? "Uploading…" : path === null ? "Upload" : "Replace"}
        </button>
      </form>
      <Failure message={error} />
    </section>
  );
}

type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "aria-invalid"
>;

function Failure({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p className="notice" role="alert">
      {message}
    </p>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
