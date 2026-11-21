import { Accessibility } from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import type { ReactNode } from "react";

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
