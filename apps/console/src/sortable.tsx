import { Accessibility } from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import type { ReactNode } from "react";

/** What a sortable row carries, so announcements can say its name, not its id. */
interface Row {
  readonly name: string;
}

function nameOf(entity: { id: unknown; data?: unknown } | null | undefined): string {
  const data = entity?.data as Partial<Row> | undefined;
  return data?.name ?? String(entity?.id ?? "");
}

type Announcements = NonNullable<
  NonNullable<ConstructorParameters<typeof Accessibility>[1]>["announcements"]
>;

/** dnd-kit's announcements name rows by id; these name them as the dispatcher does. */
const announcements: Announcements = {
  dragstart: ({ operation: { source } }) =>
    source ? `Picked up ${nameOf(source)}.` : undefined,
  dragover: ({ operation: { source, target } }) =>
    source && target && source.id !== target.id
      ? `${nameOf(source)} moved to where ${nameOf(target)} was.`
      : undefined,
  dragend: ({ operation: { source }, canceled }) =>
    source
      ? canceled
        ? `${nameOf(source)} was put back where it started.`
        : `${nameOf(source)} was dropped.`
      : undefined,
};

const accessibility = Accessibility.configure({ announcements });

/**
 * One list whose rows can be dragged into a new order by their handles. Each list has
 * its own drag manager, so a row can only ever land in the list it came from.
 * `onDrop` gets where the row started and where it was let go, which may be the same.
 */
export function SortableList({
  onDrop,
  children,
}: {
  onDrop: (from: number, to: number) => void;
  children: ReactNode;
}) {
  return (
    <DragDropProvider
      plugins={(defaults) =>
        defaults.map((plugin) => (plugin === Accessibility ? accessibility : plugin))
      }
      onDragEnd={(event) => {
        const { source } = event.operation;
        if (event.canceled || !isSortable(source)) return;
        onDrop(source.initialIndex, source.index);
      }}
    >
      {children}
    </DragDropProvider>
  );
}

/**
 * A row of a SortableList: `ref` goes on the row, and `handle` is the only part that
 * starts a drag, so the row's own buttons and inputs keep working.
 */
export function useSortableRow({
  id,
  name,
  index,
  disabled,
}: {
  id: string;
  name: string;
  index: number;
  disabled: boolean;
}) {
  const { ref, handleRef, isDragging } = useSortable<Row>({
    id,
    index,
    disabled,
    data: { name },
  });

  const handle: ReactNode = (
    <button
      type="button"
      ref={handleRef}
      className="drag-handle"
      aria-label={`Drag ${name}`}
      disabled={disabled}
    >
      ⠿
    </button>
  );

  return { ref, handle, isDragging };
}
