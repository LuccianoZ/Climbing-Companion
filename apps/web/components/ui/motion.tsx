'use client';

import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
} from 'motion/react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';

// The app's shared motion vocabulary (Sept 8 2026 UI revamp).
//
// Everything that moves in the climber-facing UI moves through one of these
// primitives, for the same reason colors go through tokens: the plugin's
// animation guidance is explicit that a single duration reused for every
// transition is the anti-pattern, and the only way to keep a *scale* of
// timings coherent across 84 files is to stop components choosing their own.
//
// Timings mirror the --dur-* / --ease-* tokens in globals.css. They are
// restated here as numbers because Framer Motion needs JS values and cannot
// read a CSS custom property; if you change one, change both.
//
// Reduced motion is handled twice, deliberately. globals.css collapses every
// CSS duration to 1ms globally, which is the safety net for anything that
// forgets. But that net does not catch Framer Motion (it animates inline
// styles, not CSS transitions) and it does not catch *drag*, which is
// positional motion a user with vestibular sensitivity has not consented to.
// So every primitive below also asks useReducedMotion() and degrades to an
// opacity-only, non-draggable version.

// Mirrors --dur-* / --ease-* in globals.css. Framer Motion cannot read a CSS
// custom property, so these are restated as numbers. CHANGE BOTH.
const STANDARD = [0.32, 0.72, 0, 1] as const;
const SPRING_EASE = [0.34, 1.4, 0.64, 1] as const;
const SPRING = { type: 'spring', stiffness: 380, damping: 34 } as const;
const EXIT = { duration: 0.17, ease: STANDARD } as const; // --dur-fast
const FADE_IN = { duration: 0.17, ease: STANDARD } as const;
const BASE = { duration: 0.25, ease: SPRING_EASE } as const; // --dur-base

/** How far down the sheet must be thrown before the drag counts as a dismiss. */
const DISMISS_DISTANCE_PX = 120;
/** ...or how fast, so a short flick dismisses too. */
const DISMISS_VELOCITY = 600;

/**
 * The modal backdrop. Fades rather than slides: a scrim that moves reads as a
 * second surface competing with the sheet on top of it.
 */
export function SheetScrim({
  onClick,
  testId = 'action-scrim',
  className = 'absolute inset-0 z-[1150] bg-black/55 backdrop-blur-[2px]',
}: {
  onClick: () => void;
  testId?: string;
  className?: string;
}) {
  return (
    <motion.div
      data-testid={testId}
      onClick={onClick}
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={FADE_IN}
    />
  );
}

/**
 * A bottom sheet that springs up and can be thrown back down.
 *
 * Drag is bound to a `dragControls` handle rather than the panel body, because
 * the panel scrolls: a body-wide drag listener turns every attempt to scroll a
 * long crag route list into a dismiss gesture. The grab handle at the top --
 * which already existed as decoration -- becomes the affordance that actually
 * does something.
 *
 * `open` defaults to true so a caller that conditionally renders the sheet
 * (which is how all of them work today) gets the entrance and the drag for
 * free. Passing `open` explicitly, and keeping the component mounted, is what
 * buys the exit animation.
 */
export function SheetPanel({
  open = true,
  onClose,
  children,
  className,
  style,
  testId,
  label,
  data,
}: {
  open?: boolean;
  onClose: () => void;
  /**
   * Either plain content, or a function receiving `startDrag` -- attach that
   * to the grab handle's `onPointerDown` so the handle is the only thing that
   * initiates a dismiss. It is a function rather than a `dragHandle` slot
   * because the handle lives inside the sheet's own sticky header, which the
   * caller owns; hoisting it out here would unstick it.
   */
  children: ReactNode | ((startDrag: (event: PointerEvent) => void) => ReactNode);
  className?: string;
  style?: CSSProperties;
  testId: string;
  label: string;
  /**
   * Extra `data-*` attributes to land on the panel element itself. The UI
   * suite reads discriminators straight off the sheet node -- map-ui.steps.ts
   * polls `[data-testid="detail-sheet"]`'s `data-detail-kind` -- so they
   * cannot be pushed onto a wrapper inside it.
   */
  data?: Record<`data-${string}`, string>;
}) {
  const reduced = useReducedMotion();
  const controls = useDragControls();

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_DISTANCE_PX || info.velocity.y > DISMISS_VELOCITY) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-label={label}
          data-testid={testId}
          {...data}
          className={className}
          style={style}
          // Reduced motion still gets a transition -- an element that simply
          // appears is harder to track than one that fades -- but it never
          // travels, and it cannot be dragged.
          initial={reduced ? { opacity: 0 } : { y: '100%' }}
          animate={reduced ? { opacity: 1 } : { y: 0 }}
          // Asymmetric on purpose: the entrance springs, the exit is a short
          // eased slide. A sheet that leaves on the same spring it arrived on
          // overshoots on the way out and makes dismissing feel sticky.
          exit={
            reduced
              ? { opacity: 0, transition: EXIT }
              : { y: '100%', transition: EXIT }
          }
          transition={reduced ? FADE_IN : SPRING}
          drag={reduced ? false : 'y'}
          dragControls={controls}
          dragListener={false}
          // Downward only. `dragElastic` lets it resist upward pull instead of
          // hard-stopping, which is what makes the gesture feel physical.
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.55 }}
          onDragEnd={onDragEnd}
        >
          {typeof children === 'function'
            ? children((event) => {
                if (!reduced) {
                  controls.start(event);
                }
              })
            : children}
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * A single element entering. Used for panels, empty states, and anything that
 * appears in response to a tap without being a full sheet.
 */
export function Rise({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...BASE, delay }}
    >
      {children}
    </motion.div>
  );
}

// A stagger long enough to read as a wave and short enough that the last item
// is not still arriving after the user has started reading the first. Capped
// by `staggerChildren * n`, so lists longer than ~8 rows should paginate or
// pass `stagger={0}` rather than animating a 40-row queue in sequence.
const LIST = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

const LIST_ITEM = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.25, ease: SPRING_EASE } },
};

const LIST_ITEM_REDUCED = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.17 } },
};

/** Wraps a list whose rows should arrive in sequence. Pair with StaggerItem. */
export function StaggerList({
  children,
  className,
  testId,
  // A staggered list is still a list. Where the markup replaced a <ul>, pass
  // role="list" (and role="listitem" on each StaggerItem) so the semantics
  // survive the motion wrapper -- Safari in particular drops implicit list
  // semantics when list-style is removed, so this is worth being explicit
  // about even on real <ul>s.
  role,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
  role?: 'list';
}) {
  return (
    <motion.div
      className={className}
      data-testid={testId}
      role={role}
      variants={LIST}
      initial="hidden"
      animate="shown"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  role,
}: {
  children: ReactNode;
  className?: string;
  role?: 'listitem';
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      role={role}
      variants={reduced ? LIST_ITEM_REDUCED : LIST_ITEM}
    >
      {children}
    </motion.div>
  );
}

/**
 * The status pill / badge entrance: a small scale pop.
 *
 * Kept separate from Rise because these appear *inside* content that is itself
 * arriving, and a second vertical translation on top of the parent's reads as
 * jitter. Scale composites cleanly with a moving parent; y does not.
 */
export function Pop({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={BASE}
    >
      {children}
    </motion.span>
  );
}

/**
 * The screen-to-screen transition.
 *
 * Keyed on the route, so every tab change plays it. Deliberately *short* and
 * downward-biased: the plugin's guidance caps a route exit at ~250ms because a
 * navigation that waits on an animation feels broken, and the app is used
 * one-handed at a crag where any perceived lag reads as a dead tap.
 *
 * There is no exit half. App Router unmounts the old tree before the new one
 * commits, so an exit animation here would require holding both in memory and
 * would delay the very thing the user asked for. Entrance-only is the honest
 * trade.
 */
export function ScreenTransition({
  routeKey,
  children,
  className,
}: {
  routeKey: string;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      key={routeKey}
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: STANDARD }}
    >
      {children}
    </motion.div>
  );
}

/**
 * An accent field arriving as a wipe rather than a fade -- the signature
 * entrance of this register. Uses clip-path so nothing reflows and the whole
 * thing stays on the compositor.
 */
export function Wipe({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 0 } : { clipPath: 'inset(0 100% 0 0)' }}
      animate={reduced ? { opacity: 1 } : { clipPath: 'inset(0 0 0 0)' }}
      transition={{ duration: reduced ? 0.17 : 0.42, ease: STANDARD, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A bottom sheet with snap points, in the shape people already know from
 * Google/Apple Maps: opens partly covering the map, drags up to fill the
 * screen, drags down to dismiss.
 *
 * Mechanically this is NOT a sheet that changes height. It is always exactly
 * as tall as its container and is *translated* down; how much you can see is
 * how far down it sits. Animating `transform` keeps the whole gesture on the
 * compositor, whereas animating `height` (or `max-height`) relayouts the
 * sheet's entire subtree every frame -- with a photo gallery, a route list and
 * a Recharts panel inside, that drops frames on a phone, which is exactly the
 * device this is for.
 *
 * Snap selection projects the current position forward by the release
 * velocity, then picks the nearest snap. That is what makes a fast flick
 * travel further than a slow drag without needing separate thresholds.
 */
export function ExpandableSheet({
  onClose,
  children,
  className,
  testId,
  label,
  data,
  /** Fraction of the container hidden below the fold in the resting state. */
  restFraction = 0.36,
  /**
   * Whether the sheet opens filling the screen. Default true: a pin tap is a
   * request to read about that place, and opening at the rest position then
   * making the climber drag up is an extra gesture before any of the content
   * they asked for is on screen. Rest remains a snap they can drag DOWN to
   * when they want the map back without dismissing.
   */
  openExpanded = true,
}: {
  onClose: () => void;
  /**
   * Receives `startDrag` (bind it to the grab handle) and `expanded`, so the
   * caller can compact its own header once the sheet fills the screen.
   */
  children: (state: {
    startDrag: (event: PointerEvent) => void;
    expanded: boolean;
  }) => ReactNode;
  className?: string;
  testId: string;
  label: string;
  data?: Record<`data-${string}`, string>;
  restFraction?: number;
  openExpanded?: boolean;
}) {
  const reduced = useReducedMotion();
  const controls = useDragControls();
  const ref = useRef<HTMLElement | null>(null);
  const y = useMotionValue(0);
  const [height, setHeight] = useState(0);
  const [expanded, setExpanded] = useState(openExpanded);
  // Until the container has been measured there is no correct place to put the
  // sheet, so it stays hidden rather than being parked at an arbitrary one.
  const [ready, setReady] = useState(false);

  // The container's height defines every snap, and it changes on rotate and on
  // mobile browser chrome show/hide -- so it is observed, not measured once.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const parent = node.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => setHeight(parent.clientHeight));
    observer.observe(parent);
    const initial = parent.clientHeight;
    setHeight(initial);
    // Park it fully off-screen BEFORE the first paint, then let the settle
    // effect below animate it up. Without this the motion value starts at 0 --
    // which is the fully-expanded position -- so the sheet flew to the top of
    // the screen and slid back down on every open.
    y.set(initial);
    setReady(true);
    return () => observer.disconnect();
  }, [y]);

  const rest = height * restFraction;

  // Settle into the resting position once the height is known, and re-settle
  // whenever the viewport changes so the sheet cannot end up stranded.
  useEffect(() => {
    if (height === 0 || !ready) return;
    animate(y, expanded ? 0 : rest, {
      type: 'spring',
      stiffness: 380,
      damping: 34,
    });
  }, [height, rest, expanded, ready, y]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (height === 0) return;
    const projected = y.get() + info.velocity.y * 0.15;
    const snaps: Array<{ at: number; kind: 'full' | 'rest' | 'close' }> = [
      { at: 0, kind: 'full' },
      { at: rest, kind: 'rest' },
      { at: height, kind: 'close' },
    ];
    const nearest = snaps.reduce((a, b) =>
      Math.abs(b.at - projected) < Math.abs(a.at - projected) ? b : a,
    );
    if (nearest.kind === 'close') {
      onClose();
      return;
    }
    setExpanded(nearest.kind === 'full');
    animate(y, nearest.at, { type: 'spring', stiffness: 380, damping: 34 });
  };

  return (
    <motion.section
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid={testId}
      data-sheet-state={expanded ? 'full' : 'rest'}
      {...data}
      className={className}
      style={{ y, visibility: ready ? 'visible' : 'hidden' }}
      drag={reduced ? false : 'y'}
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: height }}
      dragElastic={{ top: 0.02, bottom: 0.2 }}
      onDragEnd={onDragEnd}
    >
      {children({
        startDrag: (event) => {
          if (!reduced) {
            controls.start(event);
          }
        },
        expanded,
      })}
    </motion.section>
  );
}
