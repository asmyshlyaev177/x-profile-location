/**
 * The languages the site ships in, as plain data.
 *
 * Deliberately free of JSX and dictionary imports, for the same reason
 * `routes.ts` is: `vite.config.ts` reads this at config-load time to build the
 * prerender list and the sitemap, and pulling a `.tsx` graph into the Node-side
 * config would drag Preact through esbuild for nothing.
 *
 * The set is the fifteen largest X audiences by country, collapsed to one entry
 * per language — X's own ad-reach figures for late 2025, minus Hindi (Indian X
 * is overwhelmingly English in practice) and minus the territories whose
 * reported reach exceeds their population and is therefore VPN/datacentre
 * noise rather than an audience.
 */

export type Direction = 'ltr' | 'rtl'

/**
 * Which `@font-face` stack the document uses. Only `latin` and `cyrillic` are
 * real webfonts — see the note on `FONT_SCRIPTS` in `index.css`. Everything
 * else falls back to the platform's own UI font, because a subsetted CJK or
 * Thai webfont is 2–8 MB and would cost more in load time than it buys in
 * typography.
 */
export type Script =
  | 'latin'
  | 'cyrillic'
  | 'japanese'
  | 'korean'
  | 'chinese'
  | 'thai'
  | 'arabic'

export interface LocaleDef {
  /**
   * URL segment and dictionary filename. English is the default and takes no
   * segment at all, so its `code` never appears in a path.
   */
  code: string
  /** The `lang` attribute — BCP 47, and more specific than `code` where it matters. */
  htmlLang: string
  dir: Direction
  /** The language's own name for itself, for the selector. */
  name: string
  /** `og:locale`, which wants `language_TERRITORY` rather than a bare tag. */
  ogLocale: string
  script: Script
  /**
   * `false` keeps the locale out of the index: `noindex` on its pages, no
   * hreflang or sitemap entry. It is still built, still in the language menu
   * and still offered to a matching browser. Set from Search Console demand:
   * a locale is indexed at ~5 impressions a month. The rest were fifty-odd
   * near-duplicate pages on a month-old host — the shape Google's
   * scaled-content policy describes — and the site lost index admission a
   * week after they shipped (Aug 2026).
   */
  indexed: boolean
  /** "Read this page in <language>", in that language, for `LanguageSuggest`. */
  suggest: string
  /** Its dismiss control, same language. */
  dismiss: string
}

export const DEFAULT_LOCALE = 'en'

/**
 * Ordered by audience size rather than alphabetically: the selector is a list
 * someone scans for their own language, and the languages most visitors read
 * belong at the top of it. English leads because it is the default.
 *
 * This array is the site's definition of "shipping". A locale appears here
 * only once `src/i18n/dict/<code>.ts` exists — `dicts.ts` throws at
 * config-load time otherwise — because everything that enumerates languages
 * reads this list: the prerender set, the sitemap, the hreflang block, the
 * selector and the preference script. Listing a language before its copy
 * exists would put it in all five, and four of those are promises to a
 * crawler.
 */
export const locales: LocaleDef[] = [
  {
    code: 'en',
    htmlLang: 'en',
    dir: 'ltr',
    name: 'English',
    ogLocale: 'en_US',
    script: 'latin',
    indexed: true,
    suggest: 'Read this page in English',
    dismiss: 'Dismiss',
  },
  {
    code: 'ja',
    htmlLang: 'ja',
    dir: 'ltr',
    name: '日本語',
    ogLocale: 'ja_JP',
    script: 'japanese',
    indexed: false,
    suggest: '日本語で読む',
    dismiss: '閉じる',
  },
  {
    code: 'es',
    htmlLang: 'es',
    dir: 'ltr',
    name: 'Español',
    ogLocale: 'es_ES',
    script: 'latin',
    indexed: false,
    suggest: 'Leer esta página en español',
    dismiss: 'Cerrar',
  },
  {
    code: 'ar',
    htmlLang: 'ar',
    dir: 'rtl',
    name: 'العربية',
    ogLocale: 'ar_AR',
    script: 'arabic',
    indexed: true,
    suggest: 'اقرأ هذه الصفحة بالعربية',
    dismiss: 'إغلاق',
  },
  {
    code: 'id',
    htmlLang: 'id',
    dir: 'ltr',
    name: 'Bahasa Indonesia',
    ogLocale: 'id_ID',
    script: 'latin',
    indexed: false,
    suggest: 'Baca halaman ini dalam bahasa Indonesia',
    dismiss: 'Tutup',
  },
  {
    code: 'fr',
    htmlLang: 'fr',
    dir: 'ltr',
    name: 'Français',
    ogLocale: 'fr_FR',
    script: 'latin',
    indexed: false,
    suggest: 'Lire cette page en français',
    dismiss: 'Fermer',
  },
  {
    code: 'de',
    htmlLang: 'de',
    dir: 'ltr',
    name: 'Deutsch',
    ogLocale: 'de_DE',
    script: 'latin',
    indexed: true,
    suggest: 'Diese Seite auf Deutsch lesen',
    dismiss: 'Schließen',
  },
  {
    code: 'tr',
    htmlLang: 'tr',
    dir: 'ltr',
    name: 'Türkçe',
    ogLocale: 'tr_TR',
    script: 'latin',
    indexed: false,
    suggest: 'Bu sayfayı Türkçe oku',
    dismiss: 'Kapat',
  },
  {
    // Brazilian, not European: Brazil is the larger X audience by a wide
    // margin, and the copy commits to it ("você", not "tu").
    code: 'pt',
    htmlLang: 'pt-BR',
    dir: 'ltr',
    name: 'Português',
    ogLocale: 'pt_BR',
    script: 'latin',
    indexed: false,
    suggest: 'Ler esta página em português',
    dismiss: 'Fechar',
  },
  {
    code: 'ru',
    htmlLang: 'ru',
    dir: 'ltr',
    name: 'Русский',
    ogLocale: 'ru_RU',
    script: 'cyrillic',
    indexed: true,
    suggest: 'Читать эту страницу по-русски',
    dismiss: 'Закрыть',
  },
  {
    code: 'th',
    htmlLang: 'th',
    dir: 'ltr',
    name: 'ไทย',
    ogLocale: 'th_TH',
    script: 'thai',
    indexed: true,
    suggest: 'อ่านหน้านี้เป็นภาษาไทย',
    dismiss: 'ปิด',
  },
  {
    code: 'ko',
    htmlLang: 'ko',
    dir: 'ltr',
    name: '한국어',
    ogLocale: 'ko_KR',
    script: 'korean',
    indexed: false,
    suggest: '이 페이지를 한국어로 읽기',
    dismiss: '닫기',
  },
  {
    // Simplified only. `zh-Hans` rather than `zh-CN`, because the split that
    // matters to a reader is the script, not the territory.
    code: 'zh',
    htmlLang: 'zh-Hans',
    dir: 'ltr',
    name: '简体中文',
    ogLocale: 'zh_CN',
    script: 'chinese',
    indexed: false,
    suggest: '用简体中文阅读此页',
    dismiss: '关闭',
  },
  {
    code: 'fil',
    htmlLang: 'fil',
    dir: 'ltr',
    name: 'Filipino',
    ogLocale: 'tl_PH',
    script: 'latin',
    indexed: false,
    suggest: 'Basahin ang pahinang ito sa Filipino',
    dismiss: 'Isara',
  },
  {
    code: 'vi',
    htmlLang: 'vi',
    dir: 'ltr',
    name: 'Tiếng Việt',
    ogLocale: 'vi_VN',
    script: 'latin',
    indexed: false,
    suggest: 'Đọc trang này bằng tiếng Việt',
    dismiss: 'Đóng',
  },
]

/**
 * How a split headline is punctuated and spaced.
 *
 * The headlines are split into `titleLead` + `titleAccent` (+ `titleRest`)
 * because the middle part takes the accent colour, which leaves the joins and
 * the full stop in JSX rather than in the copy. Derived from `script` so that
 * adding a language cannot forget them — a Latin full stop under a Japanese
 * headline is the kind of thing a reader notices instantly and a type checker
 * never will.
 */

/** Sentence-final mark. Thai writes none; CJK uses the ideographic stop. */
export function headlineStop(script: Script): string {
  if (script === 'japanese' || script === 'chinese') return '。'
  if (script === 'thai') return ''
  return '.'
}

/**
 * Kana, Han, CJK punctuation, and full-width forms — the characters that set
 * without word spaces. Hangul is deliberately absent: Korean *does* space its
 * words, and only its particles bind tight, which the copy handles itself.
 */
const CJK =
  /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uFF00-\uFFEF]/

/**
 * The separator between two halves of a headline.
 *
 * CJK sets no space between its own characters, but it *does* space against
 * Latin — "X-Pat 対X-Posed" is wrong where "X-Pat 対 X-Posed" is right. So the
 * decision is about the boundary, not the language: drop the space only when
 * the characters on both sides of it are CJK.
 */
export function headlineGap(
  script: Script,
  before: string,
  after: string,
): string {
  if (script !== 'japanese' && script !== 'chinese') return ' '
  const left = before.trimEnd().slice(-1)
  const right = after.trimStart().slice(0, 1)
  return CJK.test(left) && CJK.test(right) ? '' : ' '
}

export const localeCodes: string[] = locales.map((l) => l.code)

/** The locales a crawler is told about — see `LocaleDef.indexed`. */
export const indexedLocales: LocaleDef[] = locales.filter((l) => l.indexed)

/** localStorage key of the reader's language choice; `index.html` reads it too. */
export const LANG_KEY = 'xpat-lang'

const BY_CODE = new Map(locales.map((l) => [l.code, l]))

// Two primary subtags are still emitted under their superseded codes: Android
// and older browsers report Tagalog as `tl` rather than `fil`, and Java-derived
// stacks report Indonesian as `in` rather than `id`.
const ALIAS: Record<string, string> = { tl: 'fil', in: 'id' }

/** The first shipping locale a browser's language list names, if any. */
export function detectLocale(
  languages: readonly string[],
): LocaleDef | undefined {
  for (const tag of languages) {
    const primary = String(tag).toLowerCase().split('-')[0] ?? ''
    const hit = BY_CODE.get(ALIAS[primary] ?? primary)
    if (hit) return hit
  }
  return undefined
}

export function localeByCode(code: string): LocaleDef | undefined {
  return BY_CODE.get(code)
}

export const defaultLocale: LocaleDef = BY_CODE.get(DEFAULT_LOCALE)!

/**
 * `('ja', '/x-about-this-account')` → `/ja/x-about-this-account`.
 *
 * English keeps the bare path — a default language served from a prefixed URL
 * means the shortest, most-linked form of every page 301s somewhere else, and
 * that is the form the store listing, the README and every existing backlink
 * already point at.
 *
 * The locale home is `/ja`, not `/ja/`, because `flatten-routes.mjs` makes the
 * slash-less URL the one that returns 200 site-wide.
 */
export function localePath(code: string, routePath: string): string {
  if (code === DEFAULT_LOCALE) return routePath
  return routePath === '/' ? `/${code}` : `/${code}${routePath}`
}

/**
 * The inverse: split a pathname into its locale and the route beneath it.
 *
 * An unknown first segment is not a locale — `/x-about-this-account` is an
 * English route, not a page in a language called `x-about-this-account`.
 */
export function splitLocale(pathname: string): {
  locale: LocaleDef
  routePath: string
} {
  const trimmed =
    pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname || '/'
  const [, first = '', ...rest] = trimmed.split('/')
  const locale = BY_CODE.get(first)
  if (!locale || locale.code === DEFAULT_LOCALE) {
    return { locale: defaultLocale, routePath: trimmed }
  }
  return { locale, routePath: rest.length ? `/${rest.join('/')}` : '/' }
}
