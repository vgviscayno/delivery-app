import { useCallback, useState } from "react";

/**
 * Runs one write: shows it as busy, reports a failure in words, and reads everything
 * back after a success.
 */
export function useWrite(onSaved: () => Promise<void>) {
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

export function Failure({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p className="notice" role="alert">
      {message}
    </p>
  );
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
