import type { ConsoleCredentials } from "@courier/api-client";
import { type FormEvent, useState } from "react";

export interface SignInProps {
  /** Why the dispatcher is looking at this screen, if it is not their first visit. */
  readonly notice?: string | undefined;
  readonly onSubmit: (credentials: ConsoleCredentials) => Promise<void>;
}

export function SignIn({ notice, onSubmit }: SignInProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit({ email, password });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sign-in">
      <h1>Courier Ops</h1>
      <p>Dispatcher console</p>
      <form onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
    </main>
  );
}
