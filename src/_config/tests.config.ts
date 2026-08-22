// Vitest global setup file
import '@testing-library/jest-dom/vitest'
import { __setMessages } from '../scripts/i18n'
import enMessages from '../../public/_locales/en/messages.json'

// UI strings from the shipped English catalogue, so assertions read real copy
// and a deleted message fails a test rather than rendering its own key.
__setMessages(
  Object.fromEntries(
    Object.entries(enMessages as Record<string, { message: string }>).map(
      ([key, entry]) => [key, entry.message],
    ),
  ),
)

// happy-dom 20.8.9 holds each MutationObserver's dispatch closure in a WeakRef
// nothing else references, so the first GC stops delivery. Drop when it doesn't.
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
