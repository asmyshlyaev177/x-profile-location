/**
 * English — the source dictionary, and the type every other locale is checked
 * against.
 *
 * ── Rules for editing ────────────────────────────────────────────────────────
 *
 * 1. Plain strings only. No JSX, no imports. `vite.config.ts` loads the
 *    dictionaries at config-load time to build the sitemap and the prerender
 *    list, exactly as it loads `routes.ts`, and a `.tsx` graph in the Node-side
 *    config would drag Preact through esbuild for nothing. Inline emphasis and
 *    links go through the four tags `i18n/rich.tsx` understands.
 * 2. Adding a key here breaks the other fourteen files until they have it too.
 *    That is the point — `Dict` is derived from this object, so a missing
 *    translation is a type error rather than an English string appearing on a
 *    Japanese page.
 * 3. Brand names are not copy. "X-Pat", "X-Posed", "Chrome", "Quetta Browser"
 *    and the country names inside screenshot examples stay as they are in every
 *    locale.
 * 4. `pages.*.faq` is rendered visibly *and* emitted as FAQPage structured
 *    data. Translating one without the other is a manual-action risk, and they
 *    come from this one array precisely so that cannot happen.
 */

export interface FaqEntry {
  q: string
  a: string
}

export interface PageMeta {
  title: string
  /** Under ~160 chars — anything past that is truncated in results. */
  description: string
  faq: FaqEntry[]
}

export const en = {
  /** Shared chrome: header, footer, install button, language selector. */
  nav: {
    sections: 'Sections',
    screenshots: 'Screenshots',
    howItWorks: 'How it works',
    features: 'Features',
    privacy: 'Privacy',
    comparison: 'Comparison',
    sourceOnGitHub: 'Source on GitHub',
    home: 'X-Pat — home',
  },

  language: {
    /** The control's accessible name, and the label above the list. */
    label: 'Language',
    /** Visually hidden, announced when the menu opens. */
    choose: 'Choose a language',
  },

  install: {
    chrome: 'Add to Chrome',
    edge: 'Add to Edge',
    brave: 'Add to Brave',
  },

  hero: {
    titleLead: 'See where any X profile is',
    /** The cyan half of the headline. Kept separate so the colour can move. */
    titleAccent: 'really from',
    lead: 'X already knows which country an account posts from. It just doesn’t show you. This puts the flag in the hover card, and lets you collapse or hide the countries you’d rather not read.',
    seeItRunning: 'See it running',
    railWorksIn: 'Works in',
    railAndroid: 'On Android',
    railAccount: 'Account / API key',
    railAccountValue: 'Neither',
    railVersion: 'Version',
    /** Inside the mocked X panel. Country names are examples, not UI. */
    panelFollowing: 'Following',
    panelFollowers: 'Followers',
    panelHidden: '🚫 Hidden · 🇮🇳 India',
    panelShow: 'Show',
  },

  screenshots: {
    heading: 'This is it, running inside X.',
    lead: 'Screenshots from an ordinary timeline. Pick one to see it working.',
    fullSize: 'Full size',
    viewer: 'Screenshot viewer',
    close: 'Close',
    prev: 'Previous screenshot',
    next: 'Next screenshot',
    railLabel: 'Screenshots',
    shots: {
      copy: {
        label: 'Copy as image',
        alt: 'A hover card with Post and About copy buttons beside the flag, and the copied About-this-account page as an image next to it',
      },
      hover: {
        label: 'Flag on hover',
        alt: 'An X hover card with a German flag and the word Germany added below the handle',
      },
      vpn: {
        label: 'VPN warning',
        alt: 'A hover card showing a US flag next to a red ⚠ VPN badge',
      },
      feed: {
        label: 'Flags in the feed',
        alt: 'A timeline where every author carries their country flag inline, without hovering',
      },
      blocked: {
        label: 'Hidden in the feed',
        alt: 'A timeline with a post folded away behind a “🚫 Hidden · Egypt” bar and a Show button',
      },
      keyword: {
        label: 'Keyword highlight',
        alt: 'A tweet highlighted in amber because the author bio matched a saved keyword',
      },
      flagBios: {
        label: 'Flag-stuffed bios',
        alt: 'An account flagged for packing several country flags into its bio',
      },
      swipe: {
        label: 'Swipe on mobile',
        alt: 'A phone-width timeline with a swipe-right gesture revealing the author country as an overlay',
      },
    },
  },

  howItWorks: {
    heading: 'Where the flag actually comes from',
    lead: 'Every account on X has a country on file. X keeps it behind a menu almost nobody opens. Nothing here guesses at an IP address or asks an outside database.',
    steps: {
      hover: {
        title: 'You hover a profile',
        body: 'Or swipe right on a tweet, if you’re on a phone. There’s no settings page to open first; the lookup happens where your cursor already is.',
        readoutKey: 'Trigger',
        readoutValue: 'hover · swipe · feed',
      },
      ask: {
        title: 'Your browser asks X directly',
        body: 'It reuses the session already in your browser to make the same request the site makes when it shows you an account. Nothing of ours sits in between.',
        readoutKey: 'Endpoint',
        readoutValue: 'x.com · AboutAccountQuery',
      },
      land: {
        title: 'The flag lands in the card',
        body: 'Your browser keeps the answer for 30 days, so the second look is free. There’s a button in the options page that clears it.',
        readoutKey: 'Cache',
        readoutValue: 'local · 30 days',
      },
    },
  },

  rateBudget: {
    link: 'How the budget works',
    heading: 'X’s rate limit, solved instead of hit.',
    lead: 'You have seen the failure. The top of a thread fills in, then nothing does. That is the limit: fifty account lookups every fifteen minutes, and one busy thread has more accounts than that.',
    body: 'Most profiles here never cost one. They are already cached, or someone else looked them up and the shared cache answers. The rest is rationed.',
    closing:
      'Run it dry anyway and you get a countdown to the reset, not a blank flag. The share and the pacing are both yours to change.',
    facts: {
      real: {
        title: 'The real number',
        body: 'The budget comes from X’s own response headers, not a guess baked in at build time. Your hovers count against it too.',
        readoutKey: 'Source',
        readoutValue: 'x-rate-limit-*',
      },
      spread: {
        title: 'Spread, not sprinted',
        body: 'Roughly one lookup every 22 seconds, recomputed each time — stretching when you hover a lot, tightening when the window refills.',
        readoutKey: 'Pace',
        readoutValue: 'window ÷ budget',
      },
      hovers: {
        title: 'Hovers always win',
        body: 'Background work stops at 80%, so the rest of the window is there for accounts you actually point at.',
        readoutKey: 'Reserved',
        readoutValue: '10 of 50',
      },
    },
    bar: {
      caption: 'One 15-minute window',
      alt: 'Fifty lookups per window: forty available to background prefetching, ten reserved for the accounts you hover.',
      backgroundNote:
        'background, trickled out across the full fifteen minutes',
      reservedNote:
        'held back, so a hover is never the request that runs you dry',
    },
  },

  features: {
    heading: 'One row of information, and what you do with it.',
    lead: 'It all works on hover cards, profile pages, single tweets and the feed. There’s nothing to configure first.',
    readings: {
      country: {
        name: 'Country',
        body: 'The country the account posts from. It shows in the hover card, and in the feed too if you turn that on.',
      },
      region: {
        name: 'Region',
        body: 'Sometimes X reports a region instead of a country. You get the short code for it: NAM, EUR, SAS.',
      },
      vpn: {
        name: 'VPN',
        body: 'X sometimes marks a location as possibly inaccurate. The country still shows; you just know to trust it less.',
      },
      registration: {
        name: 'Registration',
        body: 'Which app store the account was created through. Usually the more reliable of the two signals.',
      },
      cooldown: {
        name: 'Cooldown',
        body: 'X caps how many lookups you get in 15 minutes. Hit the cap and a countdown tells you when it lifts, rather than leaving you to wonder why the flag never showed.',
      },
    },
    hide: {
      title: 'Hide the countries you’d rather not read.',
      p1: 'Once you can see where a post comes from, you can act on it. The country filter takes the places you’d rather skip — one country, or a whole region — and decides what happens to their tweets.',
      p2: 'Collapsing is the default. The tweet folds down into a slim <b>🚫 Hidden · 🇮🇳 India</b> bar with a Show button, so you can still tell something was there, and one click brings it back for good. Where X reports a region instead of a country — NAM, EUR, SAS — the region filter catches it, so nothing slips through on a technicality. It follows the app store country when there’s one, and it leaves the tweet you opened on purpose alone.',
      p3: 'The location filter is not the only handle you have. Block an organisation and every account X badges as belonging to it goes too, and accounts younger than a threshold you set get marked as they appear — marked, never hidden, because being new is not evidence of anything.',
      readoutCollapse: 'Collapse',
      readoutCollapseValue: 'Slim bar + Show',
      readoutHide: 'Hide',
      readoutHideValue: 'Dropped outright',
      readoutOff: 'Off',
      readoutOffValue: 'Flags only',
      previewRemoved: 'tweet removed',
    },
    highlight: {
      title: 'Mark the accounts you want to spot from a distance.',
      p1: 'Save a few keywords and any tweet whose author matches gets an amber edge, with the words that matched printed next to the handle. Bios stuffed with flags get caught the same way, at whatever count you think is too many.',
      p2: 'The rules live in the extension’s options page, along with the exceptions: an allowlist for accounts no rule may touch, and per-rule exemptions for the account you want spared from the keyword but not from the country.',
      readoutMatch: 'Match on',
      readoutMatchValue: 'Name · bio',
      readoutFlags: 'Flag count',
      readoutFlagsValue: 'Your threshold',
      readoutExceptions: 'Exceptions',
      readoutExceptionsValue: 'Per account',
      /** The mocked options panel. Mirrors the extension's own UI. */
      optionsTitle: 'Options',
      optionsSaved: 'saved',
      optionsByKeyword: 'Highlight by keyword 🔍',
      optionsByFlags: 'Highlight by flags 🏴',
      optionsPlaceholder: 'Type a keyword…',
    },
    cache: {
      title: 'A cache everybody fills',
      p1: 'Flags you look up and flags other people look up land in the same pool, so most profiles come back instantly instead of spending one of your lookups. Only the public handle and its flag go anywhere. Your account, cookies, bios and history don’t.',
      p2: 'One toggle turns it off, and turning it off stops the background lookups with it. After that the extension talks to nobody but X, and only when you ask.',
      contributors: 'contributors',
      shared: 'shared',
      instant: '⚡ instant',
    },
    swipe: {
      title: 'And on a phone, a swipe',
      p1: 'Swipe right on any tweet to fetch that author’s location. It fires part way through the swipe rather than waiting for you to lift your finger, and an overlay tells you the country.',
      /** `{browser}` is substituted with the tested Android browser's name. */
      p2: 'On Android you need a browser that runs desktop extensions. <b>{browser}</b> is the one this was tested in.',
    },
  },

  trust: {
    heading: 'An extension that reads your X session had better be specific.',
    lead: 'So here it is. Lookups go straight to x.com, the same way the site’s own requests do, and never through a server of ours. Your browser holds the results for 30 days, and the options page clears them whenever you want.',
    body: 'There’s no analytics or telemetry in the extension. This website does use Google Analytics, for visit counts and which install button was clicked — nothing else.',
    readPolicy: 'Read the full privacy policy',
    neverTitle: 'Never sent anywhere',
    neverNote: 'There’s no setting for these. The extension never reads them.',
    never: [
      'Your X account, cookies or session tokens',
      'Bios, display names, or anything you read',
      'Your browsing history or activity on X',
      'Anything that identifies you personally',
    ],
    optTitle: 'Only with the cache on',
    optNote:
      'One toggle in the options page controls it. Switch it off and nothing goes out.',
    optional: [
      'The public handle you looked up, e.g. @jack',
      'Its flag data: location, source, VPN indicator',
      'A random install ID, so the same flag from different people counts once',
    ],
  },

  compareTeaser: {
    heading: 'Already using one of the others?',
    lead: 'About twenty extensions put a flag next to a handle. The differences that matter are not on the feature list — they are in what the shared cache is allowed to do, and in what happens when X’s fifty lookups run out.',
    body: 'This one paces itself against the real budget in X’s own response headers and holds ten lookups back for the accounts you hover, so a busy thread finishes filling in instead of stopping halfway. The full table covers fourteen rows and names the three things X-Posed does better than this extension.',
    link: 'See the full comparison →',
  },

  cta: {
    heading: 'Stop guessing where the timeline comes from.',
    body: 'Free, and it works the moment it installs. There’s no account to create.',
  },

  faq: {
    heading: 'Questions people actually ask',
  },

  footer: {
    tagline:
      'A country flag on every X profile, taken from X’s own data. Built by one person, with no company behind it.',
    version: 'Version',
    notAffiliated:
      'Not affiliated with X Corp. Location data comes from X’s own public endpoints.',
    groupExtension: 'The extension',
    groupGuides: 'Guides',
    groupSmallPrint: 'Small print',
    chromeWebStore: 'Chrome Web Store',
    supportProject: 'Support the project',
    guideAboutAccount: 'X “About this account”',
    guideEngagementFarming: 'Spotting engagement farming',
    guideRateLimit: 'X’s rate limit',
    guideComparison: 'Compared with X-Posed',
    privacyPolicy: 'Privacy policy',
    whatIsNotCollected: 'What is not collected',
    contact: 'Contact',
  },

  table: {
    caption:
      'X-Pat compared with the three most-installed X location extensions',
    feature: 'Feature',
    yes: 'yes',
    no: 'no',
    notStated: 'not stated',
    notApplicable: 'not applicable',
  },

  /**
   * The comparison rows, keyed by the `id` in `data/comparison.ts`. The cells
   * themselves are data and stay there; only the human-readable half is here.
   */
  comparison: {
    rows: {
      inlineCountry: {
        label: 'Country shown inline, without opening a menu',
        note: 'Read from X’s own “About this account” data, not guessed from an IP address.',
      },
      signupSource: {
        label: 'Sign-up source — Apple, Google Play or web',
        note: '',
      },
      accountAge: { label: 'Account age', note: '' },
      handleChanges: { label: 'Handle-change count', note: '' },
      hideByCountry: {
        label: 'Hide or collapse by country and region',
        note: 'Collapse behind a “Show” button is the default here, because a timeline that silently drops posts is one you cannot audit.',
      },
      allowlist: {
        label: 'Always-show allowlist and per-rule exceptions',
        note: '',
      },
      budgetFromHeaders: {
        label: 'Paces against the live budget in X’s rate-limit headers',
        note: 'X-Pat reads the x-rate-limit headers on every response and spreads its lookups across what is left in the window, holding a share back for the accounts you hover. X-Posed paces on a fixed 150 ms interval with eight parallel requests, and reads the reset header only after a 429 has already landed.',
      },
      sharedCache: {
        label: 'Shared cache, so flags survive the rate limit',
        note: 'X allows one browser about 50 profile lookups per 15 minutes. Without a shared cache that ceiling is the whole experience.',
      },
      cacheServerSource: {
        label: 'Cache server source published',
        note: 'The server that receives contributions, not just the extension that sends them. Ours is in the same repo, with deploy docs — you can read it, or run your own.',
      },
      crossChecked: {
        label: 'Cached entries cross-checked between installs',
        note: 'Ours keeps per-install votes and serves the consensus, with a confidence threshold you can raise. X-Posed documents storing the last accepted value for a handle.',
      },
      extensionSource: { label: 'Extension source published', note: '' },
      testSuite: {
        label: 'Automated test suite in the repo',
        note: 'Unit, end-to-end against recorded traffic, and visual regression. The number is what CI runs on every push.',
      },
      firefox: { label: 'Firefox', note: '' },
      iosApp: { label: 'iPhone / iPad companion app', note: '' },
    },
    losses: {
      mature: {
        title: 'X-Posed is the mature one',
        body: 'Roughly 10,000 Chrome installs against our handful, a four-month head start, and a community cache holding millions of profiles where ours holds thousands. A bigger cache genuinely means more instant flags on day one. That is a real advantage and it is not close.',
      },
      surfaces: {
        title: 'It ships on more surfaces',
        body: 'Firefox desktop, Firefox for Android, and a companion iPhone app. X-Pat is Chromium-only today — Chrome, Edge, Brave, and Quetta on Android. Firefox is planned, iOS is not.',
      },
      languageFilter: {
        title: 'It has a language filter',
        body: 'We do not, on purpose. X’s per-post language field is wrong often enough that filtering on it produces posts vanishing for no visible reason. That is a defensible call rather than a missing feature — but if filtering by language is what you came for, X-Posed has it and we do not.',
      },
    },
    /** The competitors' `n/a` cell, spelled out for the table's own copy. */
    notApplicable: 'n/a',
    testCount: '{count} tests',
    none: 'none',
  },

  guides: {
    aboutThisAccount: {
      kicker: 'Guide',
      titleLead: 'X’s',
      titleAccent: '“About this account”',
      titleRest: ', and how to stop clicking for it.',
      lead: 'X quietly knows which country every account posts from, and it will tell you — one profile at a time, three taps deep, for as many profiles as you have patience for. Here is where the panel lives, what it can and cannot answer, and what to do when you want the same fact for eighty replies instead of one.',
      whereHeading: 'Where the panel actually is',
      steps: {
        web: {
          where: 'Web',
          body: 'Open the profile, then the ⋯ overflow menu sitting next to the Follow button. “About this account” is in that list.',
        },
        mobile: {
          where: 'iOS / Android',
          body: 'Open the profile and tap the ⋯ in the top right of the header. Same entry, same panel.',
        },
        what: {
          where: 'What you get',
          body: 'The country the account is based in, roughly when it joined, how many times the handle has changed, and which app store it signed up through.',
        },
      },
      cantHeading: 'What it can’t answer',
      cant1:
        'The panel is per-profile and modal. That is fine when you are vetting one account and useless when you are reading a reply thread, which is the moment the question usually comes up. A hundred replies is a hundred round trips through a menu, and by the third one you have lost the thread you were reading.',
      cant2:
        'It is also not always populated. X returns no country for a fair number of accounts — often older or barely-active ones. When the field is genuinely empty there is nothing to reveal, and any tool claiming otherwise is guessing at an IP address.',
      cant3:
        'And it says nothing about confidence. X internally marks some locations as ones it cannot stand behind; the panel shows you the country either way.',
      sameHeading: 'The same field, without the menu',
      same1:
        'X-Pat reads exactly the field the panel reads — the same endpoint, using the X session already in your browser — and renders it as a flag in the hover card, and optionally inline in the timeline. No IP lookups, no third-party database, no account or API key.',
      same2:
        'It surfaces three things from that response: the country, the app store the account signed up through, and whether X flags the location as one it cannot verify — the confidence signal the panel leaves out. Join date and handle history stay where they are; the extension does not try to be the whole panel.',
      same3:
        'You can also act on it: countries and regions you would rather not read can collapse behind a “Show” button, or hide. Collapse is the default, because a timeline that silently drops posts is a timeline you cannot trust.',
    },

    engagementFarming: {
      kicker: 'Guide',
      titleLead: 'How to spot',
      titleAccent: 'engagement farming',
      titleRest: ' on X.',
      lead: 'Since X started paying out on impressions, replying became a job. Not a well-paid one, which is exactly why the output looks the way it does: fast, generic, and pasted under whatever is trending. Here are the signals that actually separate a real reply from a farmed one.',
      noVerdictHeading: 'No single signal is a verdict',
      noVerdict1:
        'Every tell below has an innocent explanation. New accounts are new. Some people follow generously. Plenty of thoughtful posters have an emoji in their bio. Treating any one of these as proof will have you writing off ordinary strangers, which is both unpleasant and boring.',
      noVerdict2:
        'What works is stacking them. An account three weeks old, following thousands, followed by dozens, first in the replies with a stock phrase — that combination is not a coincidence, and you can read it in about two seconds once you know where to look.',
      colSignal: 'Signal',
      colTell: 'What it looks like',
      colCost: 'Cost to check',
      signals: {
        ratio: {
          signal: 'Follower / following ratio',
          tell: 'Following 4,000, followed by 40',
          cost: 'One glance at the hover card',
        },
        age: {
          signal: 'Account age',
          tell: 'Joined three weeks ago, already deep in political threads',
          cost: 'Hover card',
        },
        latency: {
          signal: 'Reply latency',
          tell: 'First reply within seconds, on an account with no history with the author',
          cost: 'Timestamp, if you care to look',
        },
        bio: {
          signal: 'Bio composition',
          tell: 'A row of flags and emoji where a sentence would go',
          cost: 'Free — it is right there',
        },
        substance: {
          signal: 'Reply substance',
          tell: 'The same stock phrase you have seen under four other posts today',
          cost: 'Memory, mostly',
        },
        location: {
          signal: 'Where the account is based',
          tell: 'Confident lecturing about a country the account has never posted from',
          cost: 'Three taps, per profile — or inline',
        },
      },
      hiddenHeading: 'The one you can’t see',
      hidden1:
        'Five of the six signals above are already on screen. Follower counts, join date, the bio, the reply itself — X hands you all of it without being asked. The sixth is the one X keeps behind a menu: where the account actually posts from.',
      hidden2:
        'It matters more than the others for a specific kind of annoyance — not spam exactly, but confident instruction about somewhere the account has no stake in. That reads very differently once you can see it, and X makes you open a panel per profile to find out.',
      hidden3:
        '<b>X-Pat does that part.</b> It puts the country in the hover card and, if you want it, inline in the timeline — plus a warning when X itself cannot verify the location. It does not score accounts or judge replies for you; the other five signals stay your call. It just stops the one genuinely hidden fact from costing three taps.',
    },

    comparison: {
      kicker: 'Comparison',
      titleLead: 'X-Pat vs',
      titleAccent: 'X-Posed',
      titleRest: ', and the rest of the shelf.',
      lead: 'About twenty extensions put a country flag next to an X handle. Three of them have meaningful numbers of users. Here is what each one actually does, what X-Pat does differently, and the three things X-Posed does better — which is the part most comparison pages leave out.',
      featureHeading: 'Feature by feature',
      /** `{date}` is the scrape date, formatted in the reader's own locale. */
      featureLead:
        'Every cell comes from a public store listing or a public repository, read on {date}. A dash means the listing does not say — for the two closed-source extensions that is not the same as a no, and it would be unfair to draw it as one.',
      aheadHeading: 'Where X-Posed is ahead',
      differsHeading: 'What actually differs',
      differs1:
        'Everything in this category depends on a shared cache. X allows one browser roughly fifty profile lookups every fifteen minutes, and a busy thread has more accounts than that — so every extension here that keeps working past the limit does it by reading a cache other people filled. The question is not whether there is a server. It is what that server is allowed to do.',
      differs2:
        '<b>Ours is published, and you can run your own.</b> The cache server is in the same repository as the extension, with deployment docs for both Cloudflare Workers and a plain VPS. X-Posed publishes its extension — genuinely, and under MIT — but not the Worker its contributions are sent to. That is the piece you cannot check by reading the code you installed.',
      differs3:
        '<b>A cached answer here needs corroboration.</b> Contributions are stored as per-install votes and the consensus is what gets served, with a confidence threshold you can raise in the options page. X-Posed’s own documentation describes storing the last accepted value for a handle, which means the most recent contributor decides. Both designs are honest about the same underlying problem: neither server can prove a contribution really came from X.',
      differs4:
        '<b>Lookups carry no identifier.</b> Reads are an unsigned list of handles, so the server has nothing to join them against and cannot build “this install looked at these accounts”. Counting readers would take one line and would end that property, which is why the published stats undercount on purpose.',
      /** `{href}` is the homepage's rate-limit section, localised. */
      differs5:
        'And the rate limit is rationed rather than raced: background work stops at eighty percent of the window, so the last ten lookups are still there for accounts you actually hover. <a href="{href}">The mechanism is drawn out on the homepage</a>.',
      sourcesHeading: 'Sources',
      /** `{date}` the scrape date, `{href}` the issue tracker. */
      sourcesLead:
        'Read on {date}. Install counts and features move; if something below is out of date, it is an error rather than a position, and the <a href="{href}">issue tracker</a> is the fastest way to have it corrected.',
      sourceLabel: ' — source: ',
      sourceNotPublished: ' — source not published',
    },
  },

  /**
   * Per-page `<head>` metadata and the FAQ each page renders. Mirrors the
   * `routes.ts` entries, which now carry only the structural half.
   */
  pages: {
    home: {
      title:
        'X-Pat — X account location finder: see the country of any X profile',
      description:
        'Check where any X account is from — a country flag on every profile, from X’s own data. VPN warnings, hide or highlight posts by country, age or keyword.',
      faq: [
        {
          q: 'How do I see what country an X account is from?',
          a: 'X stores a country for every account and exposes it under “About this account”, but only one profile at a time and only if you open the menu. This extension reads that same field and puts the flag straight into the hover card and the timeline, so you see it without clicking anything.',
        },
        {
          q: 'Is there an X account location finder or checker?',
          a: 'That is what this extension is — an X account location checker that runs in your browser. There is no site to visit and no handle to paste: every profile you hover or scroll past is checked automatically against X’s own data, and the country appears as a flag right in the page.',
        },
        {
          q: 'Can I share or screenshot a post with the flags included?',
          a: 'Yes. Right-click any post — or use the button in the hover card — and it is copied as a PNG image with the flags embedded, ready to paste into a reply or a chat.',
        },
        {
          q: 'Can I tell if an X account is using a VPN?',
          a: 'X marks some accounts as having a location it cannot verify. The extension surfaces that as a ⚠ VPN badge next to the flag. It means X itself is unsure about the country, not that a VPN is proven.',
        },
        {
          q: 'Can I hide or collapse tweets from certain countries?',
          a: 'Yes. Pick the countries or regions in the options page and choose whether matching tweets collapse behind a “Show” button or disappear entirely. Collapse is the default, so nothing is ever silently removed from your timeline.',
        },
        {
          q: 'Can I filter by anything other than country?',
          a: 'Yes. You can block every account X badges as belonging to an organisation, mark accounts younger than a threshold you pick, and highlight accounts whose name or bio matches your keywords — or whose bio is mostly flag emoji. Age and keyword rules only ever mark a post; they never take it away. An allowlist and per-rule exceptions cover the accounts you want spared.',
        },
        {
          q: 'Does it need my X password or an API key?',
          a: 'Neither. It reuses the X session already in your browser to make the same request the site makes when it shows you a profile. There is no login, no API key, and no account of ours.',
        },
        {
          q: 'Is the location accurate?',
          a: 'It is exactly as accurate as X’s own data, because it is X’s own data. The extension does not guess from an IP address or consult any outside database. Where X flags a location as unverified, so does the extension.',
        },
      ],
    },

    aboutThisAccount: {
      title: 'X “About this account”: how to see it, and see it faster',
      description:
        'X shows every account’s country under “About this account” — one profile at a time, behind a menu. Here’s where to find it, and how to get it inline instead.',
      faq: [
        {
          q: 'What is “About this account” on X?',
          a: 'A panel X added that shows where an account is based, when it joined, how many times it has changed its handle, and which app store it signed up through. It is the same country field this extension reads.',
        },
        {
          q: 'Where is “About this account”?',
          a: 'Open a profile, tap the ⋯ menu in the top right of the profile header, and choose “About this account”. On the web it is in the same overflow menu next to the Follow button.',
        },
        {
          q: 'Why can’t I see “About this account” for some users?',
          a: 'X does not return a country for every account — older or less active accounts often have nothing on file. When the field is genuinely empty, no tool can fill it in, including this one.',
        },
        {
          q: 'How do I see the country without opening every profile?',
          a: 'That is the gap this extension closes. It reads the same field and renders it as a flag in the hover card and, optionally, inline in the timeline — so scanning a thread of eighty replies does not mean eighty menu visits.',
        },
      ],
    },

    engagementFarming: {
      title: 'How to spot engagement farming and reply spam on X',
      description:
        'The signals that separate a real reply from a farmed one on X: account age, follower ratio, posting patterns, and where the account is actually based.',
      faq: [
        {
          q: 'What is engagement farming on X?',
          a: 'Posting replies designed to harvest impressions rather than say anything — generic agreement, recycled outrage, or a stock phrase pasted under whichever post is trending. Since X began paying out on impressions there is a direct financial motive for it.',
        },
        {
          q: 'How can you tell if an X reply is from a bot or a farm?',
          a: 'No single signal is conclusive. The useful ones stack: an account following thousands while followed by dozens, created weeks ago, replying within seconds to large accounts, with a bio full of flags and emoji. Any one of those alone is normal; three together rarely is.',
        },
        {
          q: 'What follower-to-following ratio suggests a farmed account?',
          a: 'Following far more accounts than follow back — a ratio well under 0.1 — is the classic pattern, because mass-following is the cheapest way to get noticed. Plenty of ordinary new accounts look the same, so treat it as one input rather than a verdict.',
        },
        {
          q: 'Does the extension detect engagement farming?',
          a: 'Not directly. What it does is surface the account’s country and VPN status inline, which is the one signal you otherwise cannot see at all without opening each profile. The rest of the signals on this page are still a judgement call you make yourself.',
        },
      ],
    },

    rateLimit: {
      title: 'X’s rate limit: 50 profile lookups every 15 minutes',
      description:
        'X allows one browser about 50 account lookups every 15 minutes. How X-Pat rations that window, and why most profiles never spend one.',
      faq: [],
    },

    comparison: {
      title: 'X-Posed alternative: X-Pat compared, feature by feature',
      description:
        'An honest comparison of X-Pat against X-Posed and the two other most-installed X location extensions — including the three things X-Posed does better.',
      faq: [
        {
          q: 'What is the best X-Posed alternative?',
          a: 'It depends what you need. X-Posed is the most established option and has a language filter, Firefox builds and an iPhone app that X-Pat does not. X-Pat differs on the shared cache: its server is published and self-hostable, cached entries are cross-checked between installs before being served, and lookups carry no identifier the server could use to build a profile of what you looked at.',
        },
        {
          q: 'Is X-Pat open source?',
          a: 'Yes, MIT licensed, and so is the cache server it talks to — both live in the same repository, with deployment docs for Cloudflare Workers and for a plain VPS. X-Posed also publishes its extension under MIT; what it does not publish is the Worker that receives community-cache contributions.',
        },
        {
          q: 'Do these extensions need my X password?',
          a: 'None of the ones compared here do. They reuse the X session already open in your browser to make the same request X makes when it shows you a profile. There is no login, no API key and no third-party account.',
        },
        {
          q: 'Why does the flag stop appearing halfway down a thread?',
          a: 'X allows one browser about fifty account lookups every fifteen minutes, and a busy thread contains more accounts than that. Extensions that hit the ceiling simply stop filling in flags. A shared cache is what avoids it — most profiles cost no lookup at all because someone else already resolved them — and X-Pat additionally reserves the last twenty percent of the window for accounts you hover yourself.',
        },
      ],
    },
  },
} as const

/**
 * The shape every locale must satisfy. Derived from `en` rather than declared
 * separately so the two can never drift — adding a key above is what makes the
 * other fourteen files fail to compile until they have it.
 *
 * The mapped type strips `as const`'s literal types back to `string`, so a
 * translation is not required to be character-identical to the English.
 */
export type Dict = Widen<typeof en>

/**
 * Arrays stay `readonly`: `as const` above makes every list a readonly tuple,
 * and TypeScript will not assign one of those to a mutable `string[]`. Object
 * properties are widened to mutable because readonly *properties* are not
 * checked in assignability, so they cost nothing either way.
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer E)[]
    ? readonly Widen<E>[]
    : { -readonly [K in keyof T]: Widen<T[K]> }
