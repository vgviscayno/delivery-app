import { type DriveStep, driver } from "driver.js";
import "driver.js/dist/driver.css";
import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { hasSeenTour, markTourSeen, TOURS, type TourName, tourTarget } from "./tours.js";

/**
 * How many times "Show me around" has been pressed; each press replays the open tour.
 * Catalog provides it as `<TourReplays value={count}>`.
 */
export const TourReplays = createContext(0);

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
 * Runs a sub-tab's tour: by itself on the first visit in this browser, and again each
 * time "Show me around" is pressed. It counts as seen as soon as it starts, so leaving
 * part-way does not bring it back.
 */
export function useTour(name: TourName, hooks: TourHooks = {}) {
  const replays = useContext(TourReplays);
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

  tour.drive();
  return finish;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
