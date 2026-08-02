// Vitest global setup file
import '@testing-library/jest-dom/vitest'

// ---------------------------------------------------------------------------
// Keep happy-dom's MutationObserver alive across a garbage collection
// ---------------------------------------------------------------------------
// happy-dom 20.8.9 registers each observer's dispatch closure like this
// (mutation-observer/MutationObserverListener.js):
//
//     this.mutationListener = {
//       options: init.options,
//       callback: new WeakRef((record) => this.report(record))
//     }
//
// That arrow function is created inline and the WeakRef is the only thing
// referencing it, so it is collectable immediately. Once a GC takes it, the
// observer stops receiving mutations — silently, permanently, and with the
// observer object itself still very much alive.
//
// Whether a GC happens mid-run is a matter of allocation pressure, which is why
// this only ever showed up under `vitest run --coverage` (what `pnpm test`
// runs): Istanbul instrumentation allocates enough to trigger one partway
// through content.test.ts, and every test after it that waited for the content
// script's observer — an injected feed row, an exception button, a keyword
// mark — failed. The same tests passed under a bare `vitest run`, and passed
// under coverage when run alone. Nothing is wrong with the extension: it only
// ever runs in a real browser, where the DOM spec keeps a registered observer's
// callback alive for as long as the node is being observed.
//
// So the fix belongs here rather than in the source. `observe()` is wrapped so
// that the WeakRef happy-dom constructs during that one call holds strongly,
// and every other WeakRef in the process is left exactly as it was. The
// retained closures live until the test process exits, which is the point.
//
// Remove this when happy-dom holds the callback strongly. The symptom is
// silent, so re-checking is cheap: delete this block and run `pnpm test`.
const RealWeakRef = globalThis.WeakRef

class StrongRef<T extends WeakKey> {
  // A plain field rather than a constructor parameter property: this project
  // builds with `erasableSyntaxOnly`, which rules the shorthand out.
  value: T
  constructor(value: T) {
    this.value = value
  }
  deref(): T | undefined {
    return this.value
  }
}

const observe = MutationObserver.prototype.observe
MutationObserver.prototype.observe = function (
  this: MutationObserver,
  target: Node,
  options?: MutationObserverInit,
) {
  globalThis.WeakRef = StrongRef as unknown as typeof WeakRef
  try {
    return observe.call(this, target, options)
  } finally {
    globalThis.WeakRef = RealWeakRef
  }
}
