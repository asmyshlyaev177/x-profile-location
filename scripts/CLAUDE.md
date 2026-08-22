# `scripts` — the tooling that is not the extension

Three commands, none of which ship in a build. Each exists because something it
guards cannot be caught any other way.

| Script                   | Command                  | Guards                                          |
| ------------------------ | ------------------------ | ----------------------------------------------- |
| `scrub-recordings.mjs`   | `pnpm scrub` / `:check`  | Personal data in the committed Playwright HARs. |
| `sync-locales.mjs`       | `pnpm locales`           | Keys a locale catalogue is missing.             |
| `popup-window-check.mjs` | `pnpm test:popup-window` | The popup window shifting sideways as it grows. |

---

## Scrubbing the recordings

A capture is a slice of a real logged-in X session: hundreds of real accounts per file
with display names, bios, avatars and post text, plus the recording account's identity
throughout. test-proxy-recorder redacts `cookie`, `authorization` and `x-csrf-token` —
credentials, not identity. This covers identity.

**No real handle appears in `scrub-recordings.mjs` or `scrub.config.json`, and none may
be added.** Both are committed, so naming an account there republishes the identity the
scrub removes — and naming the _recording_ account would be worse than leaving it in the
HAR, because a config is the first thing anyone reads.

### Who survives is derived, never declared

Users are recognised **by shape**: any object carrying a handle field. A handle keeps its
identity exactly when a **test source names it**, because that is what "the suite asserts
against this account" looks like. Those accounts keep handle, display name and bio (the
keyword tests match real bio text) plus country, app-store source and creation date — the
data under test. Everyone else is an incidental third party and is pseudonymised. The
recording account is named by no test, so it is removed without ever being written down,
and an account a test stops naming is anonymised by the next run.

Only handles that actually occur in the recordings are considered, so an English word in
a comment cannot promote a random account. Handles too code-like to tell from an
identifier are dropped with a warning rather than quietly breaking a test.

### Every shape, every carrier — this took two goes to get right

A user reaches a capture as GraphQL's `screen_name`, as the newer `core`/`legacy` split,
and as Periscope's `twitter_screen_name` + `display_name`. It arrives as a JSON response
body **and** inlined into the HTML of every server-rendered document, where X writes the
signed-in account's name, bio, location, avatar and date of birth into
`__INITIAL_STATE__`.

- Recognising one shape in one carrier left the recording account's display name in the
  sidebar of every committed recording.
- Skipping HTML entirely left that account's handle in every capture (version one).
- Running only the textual pass over HTML rewrote the handle and left the name, bio,
  location, avatar and birthdate beside it (version two).

So markup gets the **structural** pass too: locate the JSON around each user-shaped
anchor by balancing braces (tracking string literals), confirm with `JSON.parse` before a
byte moves, hand the parsed object to `walk()`, splice back. Nothing trusts a variable
name or a script tag, and a document this cannot make sense of is left exactly as it was
rather than corrupted by a guess. Splicing re-escapes `</script` and U+2028/9, which
`JSON.stringify` does not.

A bare `username` is trusted only next to a display name — it is an ordinary field name
in unrelated payloads. Scanning raw HAR text must allow for escaped quotes: a HAR stores
each body as a JSON _string_, so on disk the field reads `\"screen_name\":\"jack\"`.
Matching only the unescaped form finds nothing, which is how a `--check` could report
success over a completely unscrubbed file.

### The `screen_name` rule that keeps the corpus intact

The mapping is built over the **whole corpus first**, and a `screen_name` field is the
only thing treated as proof that a token is an account. URLs are read purely to
cross-check: a first path segment is mapped only when some response also presents it as a
screen_name.

That rule is load-bearing. `x.com/i/status/…` makes `i` look like a handle, and `i` occurs
~125,000 times as a standalone token in a single recording — mapping it would rewrite
every `x.com/i/api/graphql` URL and corrupt everything. The same trap waits behind any
short or dictionary word used as a handle, so the guard is general, not a list.

### What else goes, and why

- **Trends.** Public in themselves, but _which_ trends X chose is personalisation — the
  panel says "Trending in <country>". The name, the label and the search URLs all go, and
  the `cd` param is dropped rather than rewritten: it base64-encodes the trend name.
- **Client-event beacons.** X posts back what it rendered — trends, what was on screen,
  what was clicked. The whole body goes: none of it is under test, and matching names
  would need every trend known in advance, impossible when one recording is scrubbed
  alone.
- **Bio links.** X keeps them parsed into `entities` with `expanded_url`, so blanking
  `description` alone leaves the personal site the account linked to.
- **Date of birth.** Deleted, not blanked — the strongest identifier a profile carries,
  and not knowing it is the normal state of every other user object in a capture.
- **Post text**, guarded by an `id_str`/`rest_id` sibling so unrelated `text` fields
  (labels, tooltips, i18n) are left alone.
- **Session fields in bodies**, such as Periscope's token exchange, which returns a
  cookie where nothing was looking for one.
- **Not X's JavaScript.** ~80% of a HAR's bytes, but public static assets with no personal
  data, and replay needs them to render. Blind token replacement inside minified code is
  a good way to corrupt it. Size is a side effect here; identity is the goal.

URLs are rewritten for every entry whatever its content type — an avatar path can carry a
handle, and `routeFromHAR` matches on the request URL, so a rewritten body behind an
unrewritten URL simply fails to match at replay. X's reserved first-path segments (`i`
above all) are exempt.

### Mapping, and what it is not

A handle maps to `user_<8 hex of sha256(lowercased handle)>`. Deterministic, so two
machines produce identical output and re-runs are no-ops, and there is no real→fake
dictionary that could be committed by mistake. It is **pseudonymisation, not
anonymisation**: reversible by anyone who guesses a handle. That is why display names,
bios, avatars and post text go too — the hash is not the protection, the absence of
anything to link it to is.

### `--check` asks one question

Would scrubbing what is on disk change anything? A file that survives its own scrubber
unchanged has been through it; one that does not, has not — whatever the reason, and
including fields no regex over raw text can see. (Searching for leftover handles instead
is what let a document keep the recording account's display name for as long as its
handle had already been rewritten.) Test subjects are excluded from the leftover-handle
report: they are real handles on purpose.

It cannot prove the script knows about a shape it has never seen — nothing about a clean
corpus goes red when a pass is dropped from the code. That is what `scrub-recordings.test.mjs`
is for.

Counters increment only when a value actually moved, or a clean recording reports work it
did not do. Writes go through a temp file and a rename: `writeFileSync` truncates first,
and a crash mid-write leaves a half-written HAR that fails to parse on the next run,
turning one bad recording into a permanently stuck scrub.

`--stdin` scrubs one recording stdin → stdout, which is how an **already-committed**
recording gets fixed: a history rewrite pipes every historical `.har` blob through the
same code rather than a second implementation of these rules in whatever language the
rewrite tool speaks. See "Fixing a recording already in history" in CONTRIBUTING.md.
Subjects come from the test sources as they are _now_ — today's policy applied uniformly,
so an account the suite has stopped naming is pseudonymised in the old recording too.

---

## Syncing the locale catalogues

Fourteen of the fifteen catalogues are translated outside this repo, a file at a time,
against whatever English looked like when that pass started. A message added mid-
translation comes back missing from whichever files were in flight — silently, because a
missing message renders its own key in a language nobody on this side reads.

`sync-locales.mjs` adds any key a locale is missing, in English and in the right
position, and leaves every existing translation exactly as it was. `--write` to fill,
bare to report. Run it after a translation pass; `messages.test.ts` is what fails if you
forget.

Only the mechanical half is fixed. A wrong `localeTag`, an over-long name or a dropped
`$1` are decisions about the translation, and guessing at them would bury the thing worth
reading.

---

## The popup width check

Chrome sizes the popup window to the document, so anything that widens the document as
content grows — a scrollbar above all — moves the whole popup sideways under the reader.

Nothing else in the repo can see that: Playwright cannot open a browser-action popup,
headless Chromium draws overlay scrollbars (no width to take), and a popup page opened as
a tab is sized by the tab, not by Chrome's own measurement. So this drives the real
thing — a headed browser under Xvfb, the real action popup, and raw CDP to read it,
because the popup is not a Playwright page.

`chrome.action.openPopup()` refuses to open on a window Chrome does not consider active,
and bare Xvfb has no window manager to make one active, so a launch that cannot open the
popup is retried from scratch rather than reported as a width failure. Under a WM (a real
desktop, or `xvfb-run` with openbox) the first try works.

Requires `xvfb-run` and a built extension in `dist/chrome`.
