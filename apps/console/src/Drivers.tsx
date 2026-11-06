import {
  type CourierClient,
  type DispatcherDriver,
  deactivateDriver,
  fetchDrivers,
  inviteDriver,
} from "@courier/api-client";
import { describeDuty } from "@courier/domain";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Failure, messageOf, useWrite } from "./write.js";

type Load =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly drivers: readonly DispatcherDriver[] }
  | { readonly state: "error"; readonly message: string };

// Drivers go On and off duty from their phones, not from here, so the list is read
// again every so often rather than only after the console's own writes.
const REFRESH_MS = 30_000;

/**
 * The drivers: who is On duty, inviting a new one by email, and deactivating one who
 * has left. Deactivation keeps the driver on the list, so it is never a deletion.
 */
export function Drivers({ client }: { client: CourierClient }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const reload = useCallback(async () => {
    try {
      setLoad({ state: "ready", drivers: await fetchDrivers(client) });
    } catch (error) {
      setLoad({ state: "error", message: messageOf(error) });
    }
  }, [client]);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const { busy, error, run } = useWrite(reload);

  return (
    <section aria-labelledby="drivers-heading">
      <h2 id="drivers-heading">Drivers</h2>
      <p className="detail">
        A driver is On duty from signing in to the driver app until signing out.
      </p>
      {load.state === "loading" && <p className="detail">Loading drivers…</p>}
      {load.state === "error" && (
        <p className="notice" role="alert">
          {load.message}
        </p>
      )}
      {load.state === "ready" &&
        (load.drivers.length === 0 ? (
          <p className="detail">No drivers yet. Invite one below.</p>
        ) : (
          <table className="drivers">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">On duty</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {load.drivers.map((driver) => (
                <tr key={driver.id} className={driver.active ? undefined : "inactive"}>
                  <td>{driver.name}</td>
                  <td>{driver.email}</td>
                  <td>{describeDuty(driver)}</td>
                  <td>
                    {driver.active && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const sure = window.confirm(
                            `Deactivate ${driver.name}? They will be signed out and cannot sign in again.`,
                          );
                          if (sure) void run(() => deactivateDriver(client, driver.id));
                        }}
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      <Failure message={error} />
      <InviteForm client={client} onInvited={reload} />
    </section>
  );
}

function InviteForm({
  client,
  onInvited,
}: {
  client: CourierClient;
  onInvited: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string>();
  const { busy, error, run } = useWrite(onInvited);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSentTo(undefined);
    const invitation = { name: name.trim(), email: email.trim() };
    const invited = await run(() => inviteDriver(client, invitation));
    if (invited) {
      setSentTo(invitation.email);
      setName("");
      setEmail("");
    }
  }

  return (
    <>
      <form onSubmit={submit} className="invite-form">
        <input
          type="text"
          aria-label="Driver's name"
          placeholder="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          type="email"
          aria-label="Driver's email"
          placeholder="Email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" disabled={busy}>
          Invite driver
        </button>
      </form>
      {sentTo && (
        <p className="detail" role="status">
          Invite sent to {sentTo}. They enter its code in the driver app and choose a
          password.
        </p>
      )}
      <Failure message={error} />
    </>
  );
}
