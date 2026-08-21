// A resize above the fold makes X's timeline scroll the window by a multiple of
// the height that changed. See "Resizing without moving the scroll" in
// CLAUDE.md.

let pendingResizes = new WeakMap<Element, () => void>()
let resizeObserverIO: IntersectionObserver | null = null

// Every 5%: a post taller than the viewport holds a constant ratio while its top
// edge climbs, so coarse steps leave it parked long past being safe.
const RESIZE_THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20)

// X's sticky header is 54px, and a row resized under it is compensated for too.
const FOLD_MARGIN_PX = 56

function resizeAboveFold(target: Element): boolean {
  const rect = target.getBoundingClientRect()
  // No box: nothing to judge, and an observer would never report one.
  if (rect.width === 0 && rect.height === 0) return false
  return rect.top < FOLD_MARGIN_PX
}

function getResizeObserver(): IntersectionObserver {
  if (resizeObserverIO) return resizeObserverIO
  resizeObserverIO = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const target = entry.target
        const apply = pendingResizes.get(target)
        if (!apply) {
          resizeObserverIO!.unobserve(target)
          continue
        }
        // Re-read rather than trust entry.boundingClientRect: an earlier apply
        // in this same batch may have pushed this one back above the fold.
        if (resizeAboveFold(target)) continue
        pendingResizes.delete(target)
        resizeObserverIO!.unobserve(target)
        apply()
      }
    },
    { threshold: RESIZE_THRESHOLDS },
  )
  return resizeObserverIO
}

/**
 * Run `apply` now when it won't move the scroll, otherwise when `target` next
 * has its top edge in view. Parking again replaces the pending call, so it is
 * always the newest verdict that lands.
 */
export function whenSafeToResize(target: Element, apply: () => void): void {
  if (!resizeAboveFold(target)) {
    cancelPendingResize(target)
    apply()
    return
  }
  const parked = pendingResizes.has(target)
  pendingResizes.set(target, apply)
  if (!parked) getResizeObserver().observe(target)
}

export function cancelPendingResize(target: Element): void {
  if (!pendingResizes.has(target)) return
  pendingResizes.delete(target)
  resizeObserverIO?.unobserve(target)
}

/**
 * whenSafeToResize's counterpart for a node that has just been inserted and not
 * yet laid out. There is no height to change there — the post is collapsed
 * before it has ever been anything else — so there is nothing to wait for, and
 * waiting would itself create the resize this is all trying to avoid.
 */
export function runNow(_target: Element, apply: () => void): void {
  apply()
}

/** Tests only: drop the observer and its parked calls before the next DOM. */
export function __resetResizeGuard(): void {
  resizeObserverIO?.disconnect()
  resizeObserverIO = null
  pendingResizes = new WeakMap()
}
