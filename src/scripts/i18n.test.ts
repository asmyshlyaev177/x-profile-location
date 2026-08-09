import enMessages from '../../public/_locales/en/messages.json'
import {
  __setMessages,
  localeTagOf,
  nativeLanguageName,
  normalizeUiLanguage,
  t,
  UI_LOCALES,
  uiLocale,
} from './i18n'

const EN: Record<string, string> = Object.fromEntries(
  Object.entries(enMessages as Record<string, { message: string }>).map(
    ([key, entry]) => [key, entry.message],
  ),
)

afterEach(() => __setMessages(EN))

describe('t', () => {
  it('returns the message', () => {
    expect(t('popupOn')).toBe('On')
  })

  it('fills $1…$9 in order', () => {
    __setMessages({ ...EN, probe: 'from $2 to $1, and $1 again' })
    expect(t('probe', 'here', 'there')).toBe(
      'from there to here, and here again',
    )
  })

  it('accepts numbers', () => {
    expect(t('noteImported', 7)).toBe('Imported 7 settings.')
  })

  it('leaves a substitution nobody supplied empty rather than printing $1', () => {
    __setMessages({ ...EN, probe: 'a $1 b' })
    expect(t('probe')).toBe('a  b')
  })

  it('unescapes $$ to a single dollar', () => {
    __setMessages({ ...EN, probe: 'costs $$5' })
    expect(t('probe')).toBe('costs $5')
  })

  it('falls back to the key, so a gap is visible rather than blank', () => {
    expect(t('noSuchMessage')).toBe('noSuchMessage')
  })
})

describe('uiLocale', () => {
  it('reads the catalogue rather than asking the browser', () => {
    // getUILanguage() and @@ui_locale both report the browser's UI language,
    // which is not necessarily the catalogue that got loaded — a Chrome run
    // with --lang=ru serves `ru` while still reporting `en_US`.
    expect(uiLocale()).toBe('en')
    __setMessages({ ...EN, localeTag: 'pt-BR' })
    expect(uiLocale()).toBe('pt-BR')
  })

  it('answers en when there is no catalogue at all', () => {
    __setMessages({})
    expect(uiLocale()).toBe('en')
  })
})

describe('normalizeUiLanguage', () => {
  it("keeps a locale that ships, and '' means follow the browser", () => {
    expect(normalizeUiLanguage('ru')).toBe('ru')
    expect(normalizeUiLanguage('zh_CN')).toBe('zh_CN')
    expect(normalizeUiLanguage('')).toBe('')
  })

  it('refuses anything else, including a locale we do not ship', () => {
    // A hand-edited import, or a settings file from a version that shipped
    // more languages than this one.
    expect(normalizeUiLanguage('kl')).toBe('')
    expect(normalizeUiLanguage('zh-CN')).toBe('') // directory spelling only
    expect(normalizeUiLanguage(null)).toBe('')
    expect(normalizeUiLanguage(7)).toBe('')
  })
})

describe('localeTagOf', () => {
  it('turns a directory name into a BCP 47 tag', () => {
    expect(localeTagOf('pt_BR')).toBe('pt-BR')
    expect(localeTagOf('ru')).toBe('ru')
  })
})

describe('nativeLanguageName', () => {
  it('names each language in itself, capitalised', () => {
    // Somebody hunting for their own language is not reading the current one,
    // and CLDR lowercases several of these where a name wants a capital.
    expect(nativeLanguageName('ru')).toBe('Русский')
    expect(nativeLanguageName('ja')).toBe('日本語')
    expect(nativeLanguageName('fr')).toBe('Français')
    expect(nativeLanguageName('de')).toBe('Deutsch')
  })

  it('has a name for every locale that ships', () => {
    const unnamed = UI_LOCALES.filter(
      (code) => nativeLanguageName(code) === localeTagOf(code),
    )
    expect(unnamed).toEqual([])
  })
})
