// Vitest global setup file
import '@testing-library/jest-dom/vitest'
import { __setMessages } from '../scripts/i18n'
import enMessages from '../../public/_locales/en/messages.json'

// ---------------------------------------------------------------------------
// UI strings, without a browser to hold them
// ---------------------------------------------------------------------------
// From the shipped English catalogue, so assertions read real copy and a deleted
// message fails a test rather than rendering its own key.
__setMessages(
  Object.fromEntries(
    Object.entries(enMessages as Record<string, { message: string }>).map(
      ([key, entry]) => [key, entry.message],
    ),
  ),
)

// ---------------------------------------------------------------------------
// Keep happy-dom's MutationObserver alive across a garbage collection
// ---------------------------------------------------------------------------
// happy-dom 20.8.9 holds each observer's dispatch closure in a WeakRef that
// nothing else references, so the first GC silently stops mutation delivery.
// Wrapped here, not in the source: a real browser keeps it alive per the spec.
// Remove when happy-dom does — delete this block and run `pnpm test`.
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
