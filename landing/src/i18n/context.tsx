import { createContext } from 'preact'
import { useContext, useMemo } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { defaultLocale, localePath, type LocaleDef } from './locales'
import type { Dict } from './dict/en'

interface I18n {
  locale: LocaleDef
  t: Dict
  /**
   * The path *below* the locale — `/x-posed-alternative`, never
   * `/ja/x-posed-alternative`. What the language selector needs in order to
   * offer the same page in another language rather than dumping the reader on
   * a homepage.
   */
  routePath: string
  /**
   * Localises an internal path. `/x-posed-alternative` becomes
   * `/ja/x-posed-alternative` on the Japanese pages and is left alone on the
   * English ones.
   *
   * Every internal `href` on the site goes through this. A hardcoded
   * `/x-posed-alternative` on a Japanese page is not a broken link — it is
   * worse, it silently drops the reader back into English, and it is the
   * single easiest mistake to make in a translated static site.
   */
  href: (path: string) => string
}

/**
 * The default deliberately has **no** dictionary.
 *
 * Falling back to `en` here reads as defensive and costs the whole point of
 * the lazy loading: a static `import { en }` in this module is reachable from
 * every component, so English lands in the client's main chunk and a Japanese
 * reader downloads 28 kB of copy they will never see. `App` always supplies a
 * dictionary, so the fallback was never actually reached — it was only paying
 * for the possibility.
 */
const Ctx = createContext<I18n>({
  locale: defaultLocale,
  t: null as unknown as Dict,
  routePath: '/',
  href: (p) => p,
})

/**
 * `t` is passed in rather than looked up from a registry. That is the whole
 * mechanism keeping fourteen unused languages out of the client bundle: the
 * prerender hands in a statically imported dictionary, the browser hands in
 * one it just `await import()`ed, and nothing in between has to know that all
 * fifteen exist.
 */
export function I18nProvider({
  locale,
  t,
  routePath,
  children,
}: {
  locale: LocaleDef
  t: Dict
  routePath: string
  children: ComponentChildren
}) {
  const value = useMemo<I18n>(
    () => ({
      locale,
      t,
      routePath,
      // Anchors and absolute URLs pass through untouched: `#how` is in-page,
      // and an external store link has no locale to add.
      href: (path) =>
        path.startsWith('/') ? localePath(locale.code, path) : path,
    }),
    [locale, t, routePath],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  return useContext(Ctx)
}

/**
 * The common case — `const t = useT()`, then `t.hero.lead`.
 *
 * Throws rather than silently rendering English if a component ends up outside
 * the provider: with no fallback dictionary the alternative is a
 * `Cannot read properties of null` twelve frames deeper, naming a property
 * instead of the mistake.
 */
export function useT(): Dict {
  const { t } = useI18n()
  if (!t) {
    throw new Error(
      'useT() outside <I18nProvider>. Every page renders through <App>, which ' +
        'supplies the dictionary — a component reaching this has been mounted ' +
        'on its own.',
    )
  }
  return t
}
