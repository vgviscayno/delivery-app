import { type DriveStep, driver } from "driver.js";
import "driver.js/dist/driver.css";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  hasSeenTour,
  markTourSeen,
  TOURS,
  type TourName,
  type TourScene,
  tourTarget,
} from "./tours.js";

/** How many times "Show me around" has been pressed; each press replays the open tour. */
const ReplayContext = createContext(0);

export function TourReplays({ count, children }: { count: number; children: ReactNode }) {
  return <ReplayContext.Provider value={count}>{children}</ReplayContext.Provider>;
}

/** What a section does to the page around its tour. */
export interface TourHooks {
  /** Sets up whatever the tour demonstrates on, before the first step. */
  readonly onStart?: () => void;
  /** Takes it all away again, however the tour ended. */
  readonly onEnd?: () => void;
  /** Shows what the next step needs, or nothing extra (`null`). */
  readonly onScene?: (scene: TourScene | null) => void;
}

/** How long a step waits for its element, such as a panel the step has just opened. */
const WAIT_MS = 1000;

/**
 * Runs a sub-tab's tour: by itself on the first visit in this browser, and again each
 * time "Show me around" is pressed. Finishing or closing it, by button, Esc or a click
 * outside, counts as seen; leaving the page part-way does not.
 */
export function useTour(name: TourName, hooks: TourHooks = {}) {
  const replays = useContext(ReplayContext);
  const atMount = useRef(replays);
  const latest = useRef(hooks);
  useLayoutEffect(() => {
    latest.current = hooks;
  });

  useEffect(() => {
    if (replays === atMount.current && hasSeenTour(name)) return;
    return runTour(name, () => latest.current);
  }, [name, replays]);
}

/** Starts the tour, and returns what stops it early. */
function runTour(name: TourName, hooks: () => TourHooks): () => void {
  const steps = TOURS[name];
  let ended = false;
  const end = (seen: boolean) => {
    if (ended) return;
    ended = true;
    if (seen) markTourSeen(name);
    hooks().onScene?.(null);
    hooks().onEnd?.();
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
    // The tour only points. It never lets a click through to Save, Delete or a cell.
    disableActiveInteraction: true,
    // Next and Back, by button or arrow key, set the page up for the step first.
    onNextClick: () => go((tour.getActiveIndex() ?? 0) + 1),
    onPrevClick: () => go((tour.getActiveIndex() ?? 0) - 1),
    // Close, Esc, a click outside, or Done.
    onDestroyStarted: () => {
      end(true);
      tour.destroy();
    },
  });

  function go(index: number) {
    if (index < 0) return;
    if (index >= steps.length) {
      end(true);
      tour.destroy();
      return;
    }
    hooks().onScene?.(steps[index]?.scene ?? null);
    tour.moveTo(index);
  }

  tour.drive();
  return () => {
    end(false);
    tour.destroy();
  };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
