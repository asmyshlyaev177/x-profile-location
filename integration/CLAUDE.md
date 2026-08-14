# `integration` — two tabs and a real service worker

`pnpm test:integration`. Runs in CI.

Two real x.com tabs, the built extension, and the browser's own service worker.
It exists because everything the lookup broker does is a property of _more than
one tab_, and neither a unit test nor `visual/` can hold two of them.

- **Runs against `dist/chrome`**, so `pnpm build` (or `bedframe build chrome`)
  has to have run first. A stale `dist/` tests the previous commit and says
  nothing about this one.
- **x.com is a stub** (`integration/x-stub.ts`) served _at_ x.com URLs via
  `context.route` — `route.fulfill` keeps the origin, which is what makes the
  manifest match and the page-script attach. No session, no HAR, no live
  traffic, so unlike `e2e/` this runs on every push.
- **Route registration order runs backwards.** Playwright tries the most
  recently added route first, so the `https://x.com/**` catch-all is registered
  _before_ the AboutAccountQuery and HomeTimeline handlers, not after.
- **The stub's timeline fetch is repeated on a short timer**, and has to be.
  page-script is built as a loader that `import()`s the real chunk, so its
  `fetch` wrapper is not in place at parse time — a stub that fetched the moment
  it parsed would beat the extension to it every run. On x.com the race is
  invisible, because X's own timeline call comes long after its bundle.
- **A test that passes with the mechanism removed is not a test.** The
  duplicate-suppression one needs a _slow_ answer (3s, clear of the 1.5s pacing
  floor): with an instant one the shared IndexedDB dedups on its own and the
  test passes whether or not anything is coordinating.

Anything split across contexts — a message between the content script and the
service worker, anything about more than one tab — owes a test here. Two halves
that each pass their own unit tests can still disagree about the message between
them, and no amount of mocking `chrome` can catch that.
