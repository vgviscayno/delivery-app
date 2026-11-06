import { type ReactNode, useEffect, useRef } from "react";

/**
 * An in-page question that has to be answered before anything else: Leave without
 * saving, Delete. Focus starts on the safe answer, and Escape gives it.
 */
export function Dialog({
  title,
  children,
  confirm,
  cancel,
  onConfirm,
  onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirm: string;
  cancel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const safe = useRef<HTMLButtonElement>(null);
  useEffect(() => safe.current?.focus(), []);

  return (
    <div className="dialog-backdrop">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <h2 id="dialog-title">{title}</h2>
        {children}
        <div className="actions">
          <button type="button" ref={safe} onClick={onCancel}>
            {cancel}
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
