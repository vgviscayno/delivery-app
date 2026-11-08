import { type DriveStep, driver } from "driver.js";
import "driver.js/dist/driver.css";
import {
  createContext,
  type KeyboardEvent,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  hasSeenTour,
  markTourSeen,
  SHOW_ME_AROUND,
  stepsOf,
  TOPICS,
  type TourName,
  type TourTopic,
  tourTarget,
} from "./tours.js";

/** One press of "Show me around": the whole tour (`topic: null`) or one topic of it. */
interface Replay {
  readonly count: number;
  readonly topic: TourTopic | null;
}

/** What the page holding the sections shares with each section's tour. */
interface TourHostValue {
  readonly replay: Replay;
  /** The open section names its tour, and takes it back when it goes. */
  readonly here: (name: TourName) => () => void;
  readonly running: (on: boolean) => void;
}

const TourHost = createContext<TourHostValue>({
  replay: { count: 0, topic: null },
  here: () => () => {},
  running: () => {},
});

/**
 * The tours of the sections a page shows: Catalog renders its sections inside
 * `<TourHost value={host.value}>` and gives `host` to `ShowMeAround`.
 */
export function useTourHost() {
  const [replay, setReplay] = useState<Replay>({ count: 0, topic: null });
  const [current, setCurrent] = useState<TourName | null>(null);
  const [isRunning, setRunning] = useState(false);
  const value = useMemo<TourHostValue>(
    () => ({
      replay,
      here: (name) => {
        setCurrent(name);
        return () => setCurrent((open) => (open === name ? null : open));
      },
      running: setRunning,
    }),
    [replay],
  );
  return {
    value,
    current,
    running: isRunning,
    play: (topic: TourTopic | null) =>
      setReplay(({ count }) => ({ count: count + 1, topic })),
  };
}

export { TourHost };

/**
 * Replays the open section's tour: straight away where it has no topics, or from a menu
 * of the whole tour and each topic. Closed while a tour runs.
 */
export function ShowMeAround({
  host,
  disabled,
}: {
  host: ReturnType<typeof useTourHost>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const topics = host.current ? TOPICS[host.current] : [];
  const choices = [{ topic: null, label: "The whole tour" }, ...topics];

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  function choose(topic: TourTopic | null) {
    setOpen(false);
    host.play(topic);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = [
      ...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move: Record<string, number> = {
      ArrowDown: at + 1,
      ArrowUp: at - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close();
    } else if (event.key in move) {
      event.preventDefault();
      const to = ((move[event.key] ?? 0) + items.length) % items.length;
      items[to]?.focus();
    }
  }

  return (
    <div className="show-me-around">
      <button
        ref={button}
        type="button"
        data-tour={SHOW_ME_AROUND}
        disabled={disabled || host.running || host.current === null}
        aria-haspopup={topics.length > 0 ? "menu" : undefined}
        aria-expanded={topics.length > 0 ? open : undefined}
        onClick={() => (topics.length > 0 ? setOpen((was) => !was) : choose(null))}
      >
        Show me around
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Show me around"
          className="tour-menu"
          onKeyDown={onKeyDown}
        >
          {choices.map(({ topic, label }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => choose(topic)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** What a section does to the page around its tour. */
export interface TourHooks {
  /** Sets up whatever the tour demonstrates on, before the first step. */
  readonly onStart?: () => void;
  /** Takes it all away again, however the tour ended. */
  readonly onEnd?: () => void;
  /** Opens Details on the tour's row for the step that needs it, and closes it after. */
  readonly onDetails?: (open: boolean) => void;
}

/** How long a step waits for its element, such as a panel the step has just opened. */
const WAIT_MS = 1000;

/**
 * Runs a sub-tab's tour: by itself on the first visit in this browser, and again, whole or
 * one topic, each time "Show me around" asks. It counts as seen as soon as it starts, so
 * leaving part-way does not bring it back.
 */
export function useTour(name: TourName, hooks: TourHooks = {}) {
  const host = useContext(TourHost);
  const { replay, here, running } = host;
  const atMount = useRef(replay.count);
  // Read once per mount, before the tour marks it seen: StrictMode runs the effect below
  // twice, and the second run must still see a first visit.
  const [firstVisit] = useState(() => !hasSeenTour(name));
  const latest = useRef(hooks);
  useLayoutEffect(() => {
    latest.current = hooks;
  });

  useEffect(() => here(name), [here, name]);

  // `replay` is new on each press of Show me around, and only then.
  useEffect(() => {
    const replayed = replay.count !== atMount.current;
    if (!replayed && !firstVisit) return;
    running(true);
    const stop = runTour(
      name,
      replayed ? replay.topic : null,
      () => latest.current,
      () => running(false),
    );
    return () => {
      stop();
      running(false);
    };
    // `replay` is new on each press of Show me around, and only then.
  }, [name, replay, firstVisit, running]);
}

/** Starts the tour, and returns what stops it early. */
function runTour(
  name: TourName,
  topic: TourTopic | null,
  hooks: () => TourHooks,
  onStopped: () => void,
): () => void {
  const steps = stepsOf(name, topic);
  markTourSeen(name);

  // The tour only points. Whatever it highlights is inert while it does, so neither a
  // click nor Tab reaches Save, Delete or a cell, whatever the stylesheet does.
  let pointedAt: Element | undefined;
  const release = () => {
    pointedAt?.removeAttribute("inert");
    pointedAt = undefined;
  };

  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    release();
    hooks().onDetails?.(false);
    hooks().onEnd?.();
    onStopped();
  };
  // `destroy()` does not call `onDestroyStarted`, so whatever destroys the tour ends it too.
  const finish = () => {
    end();
    tour.destroy();
  };

  hooks().onStart?.();
  const tour = driver({
    steps: steps.map(
      (step): DriveStep => ({
        element: tourTarget(step.target),
        waitForElement: WAIT_MS,
        skipMissingElement: step.optional ?? false,
        popover: { title: step.title, description: step.description },
      }),
    ),
    animate: !prefersReducedMotion(),
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    closeBtnLabel: "Close the tour",
    popoverClass: "tour-popover",
    disableActiveInteraction: true,
    onHighlightStarted: (element) => {
      release();
      element?.setAttribute("inert", "");
      pointedAt = element;
    },
    onDeselected: release,
    // Next and Back, by button or arrow key, set the page up for the step first.
    onNextClick: () => go((tour.getActiveIndex() ?? 0) + 1),
    onPrevClick: () => go((tour.getActiveIndex() ?? 0) - 1),
    // Close, Esc, a click outside, or Done.
    onDestroyStarted: finish,
  });

  function go(index: number) {
    if (index < 0) return;
    if (index >= steps.length) return finish();
    hooks().onDetails?.(steps[index]?.opensDetails ?? false);
    tour.moveTo(index);
  }

  // The first step may need Details too, when it is the Details topic on its own.
  hooks().onDetails?.(steps[0]?.opensDetails ?? false);
  tour.drive();
  return finish;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
