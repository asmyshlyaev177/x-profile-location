/**
 * Tests for the HAR scrubber.
 *
 * These exist because `--check` cannot cover this. That check asks whether a
 * committed recording survives its own scrubber unchanged, which catches a file
 * that skipped the scrub — and stays green for every account shape the scrubber
 * has never heard of, and for a pass someone deletes from the code. A clean
 * corpus says nothing about either. Fixtures do.
 *
 * NO REAL HANDLE OR NAME APPEARS HERE, for the same reason none appears in
 * scrub.config.json: this file is committed. The fixtures below are invented.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SUBJECTS,
  blankStats,
  scrubEntry,
  scrubMarkup,
  scrubTelemetry,
  synthetic,
  userHandle,
  walk,
} from './scrub-recordings.mjs'

const HANDLE = 'someonesomeone'
const NAME = 'Some One'
const BIO = 'A bio nobody asserts on. https://t.co/abcdefghij'

beforeEach(() => {
  SUBJECTS.clear()
})

/** The whole document, the way X serves one: state inlined into a script tag. */
const documentWith = (user) =>
  '<!DOCTYPE html><html><head><title>X</title></head><body>' +
  `<script>window.__INITIAL_STATE__=${JSON.stringify({
    entities: { users: { entities: { 1: user } } },
  })};</script>` +
  '<div id="react-root"></div></body></html>'

const legacyUser = () => ({
  screen_name: HANDLE,
  name: NAME,
  description: BIO,
  location: 'Somewhere',
  birthdate: { day: 17, month: 2, year: 1988 },
  profile_image_url_https: 'https://pbs.twimg.com/profile_images/1/a.jpg',
  profile_banner_url: 'https://pbs.twimg.com/profile_banners/1/2',
  entities: {
    description: {
      urls: [
        { url: 'https://t.co/abcdefghij', expanded_url: 'https://me.example' },
      ],
    },
  },
})

const markupEntry = (user) => ({
  request: { url: 'https://x.com/home', headers: [], queryString: [] },
  response: {
    headers: [],
    content: { mimeType: 'text/html; charset=utf-8', text: documentWith(user) },
  },
})

const jsonEntry = (body) => ({
  request: {
    url: 'https://x.com/i/api/graphql/x/Y',
    headers: [],
    queryString: [],
  },
  response: {
    headers: [],
    content: { mimeType: 'application/json', text: JSON.stringify(body) },
  },
})

describe('recognising a user', () => {
  it('takes screen_name as proof on its own', () => {
    expect(userHandle({ screen_name: HANDLE })).toBe(HANDLE)
  })

  it('takes twitter_screen_name too — Periscope spells it that way', () => {
    expect(userHandle({ twitter_screen_name: HANDLE })).toBe(HANDLE)
  })

  it('trusts a bare `username` only next to a display name', () => {
    expect(userHandle({ username: HANDLE })).toBeNull()
    expect(userHandle({ username: HANDLE, display_name: NAME })).toBe(HANDLE)
  })

  it('is not fooled by an object that merely has a name', () => {
    expect(userHandle({ name: NAME, description: BIO })).toBeNull()
  })
})

describe('a user in a JSON body', () => {
  it('loses handle, name, bio, avatar, location and birthdate', () => {
    const user = legacyUser()
    walk(user, blankStats())

    expect(user.screen_name).toBe(synthetic(HANDLE))
    expect(user.name).not.toBe(NAME)
    expect(user.description).toBe('')
    expect(user.location).toBe('')
    expect(user.birthdate).toBeUndefined()
    expect(user.profile_image_url_https).toContain('default_profile')
    expect(user.profile_banner_url).toContain('default_profile')
  })

  it('loses the bio links X keeps parsed out beside the bio', () => {
    const user = legacyUser()
    walk(user, blankStats())
    // Blanking `description` alone leaves the personal site in `entities`.
    expect(JSON.stringify(user)).not.toContain('me.example')
    expect(user.entities.description.urls).toEqual([])
  })

  it('handles the core/legacy split, avatar sibling and all', () => {
    const node = {
      core: { screen_name: HANDLE, name: NAME },
      avatar: { image_url: 'https://pbs.twimg.com/profile_images/1/a.jpg' },
      legacy: { description: BIO },
    }
    walk(node, blankStats())

    expect(node.core.screen_name).toBe(synthetic(HANDLE))
    expect(node.core.name).not.toBe(NAME)
    expect(node.avatar.image_url).toContain('default_profile')
    expect(node.legacy.description).toBe('')
  })

  it('handles the Periscope shape, sized avatar variants and all', () => {
    const node = {
      twitter_screen_name: HANDLE,
      username: HANDLE,
      display_name: NAME,
      description: BIO,
      profile_image_urls: [
        {
          url: 'https://pbs.twimg.com/a_200x200.jpg',
          ssl_url: 'https://pbs.twimg.com/a.jpg',
          width: 200,
        },
      ],
    }
    walk(node, blankStats())

    expect(node.twitter_screen_name).toBe(synthetic(HANDLE))
    expect(node.username).toBe(synthetic(HANDLE))
    expect(node.display_name).not.toBe(NAME)
    expect(node.description).toBe('')
    expect(node.profile_image_urls[0].url).toContain('default_profile')
    expect(node.profile_image_urls[0].ssl_url).toContain('default_profile')
    // The variant's own metadata is not identity and stays put.
    expect(node.profile_image_urls[0].width).toBe(200)
  })

  it('empties a session blob returned in a response body', () => {
    const node = {
      cookie: 'a-periscope-session-token',
      user: { screen_name: HANDLE },
    }
    walk(node, blankStats())
    expect(node.cookie).toBe('')
  })

  it('leaves the fields under test alone', () => {
    const node = {
      screen_name: HANDLE,
      created_at: 'Thu Apr 23 21:53:30 +0000 2009',
      location_accurate: true,
      about_profile: { account_based_in: 'Brazil', source: 'App Store' },
    }
    walk(node, blankStats())

    expect(node.created_at).toBe('Thu Apr 23 21:53:30 +0000 2009')
    expect(node.location_accurate).toBe(true)
    expect(node.about_profile).toEqual({
      account_based_in: 'Brazil',
      source: 'App Store',
    })
  })
})

describe('a user inlined into a document', () => {
  it('loses everything a user in a JSON body loses', () => {
    const entry = markupEntry(legacyUser())
    scrubEntry(entry, blankStats())
    const html = entry.response.content.text

    expect(html).not.toContain(NAME)
    expect(html).not.toContain(HANDLE)
    expect(html).not.toContain('Somewhere')
    expect(html).not.toContain('1988')
    expect(html).not.toContain('me.example')
  })

  it('leaves the document a document', () => {
    const entry = markupEntry(legacyUser())
    scrubEntry(entry, blankStats())
    const html = entry.response.content.text

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<div id="react-root"></div>')
    expect(html).toContain('window.__INITIAL_STATE__=')
    expect(html.match(/<script>/g)).toHaveLength(1)
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(entry.response.content.size).toBe(html.length)
  })

  it('reaches a user split across sibling keys, not just the key it anchored on', () => {
    // The anchor is `core.screen_name`, so the nearest enclosing object is
    // `core` — and `avatar` and `legacy` are outside it.
    const html = scrubMarkup(
      documentWith({
        core: { screen_name: HANDLE, name: NAME },
        avatar: { image_url: 'https://pbs.twimg.com/profile_images/1/a.jpg' },
        legacy: { description: BIO },
      }),
      blankStats(),
    )

    expect(html).not.toContain(NAME)
    expect(html).not.toContain(BIO)
    expect(html).not.toContain('profile_images/1/a.jpg')
  })

  it('keeps a `</script>` inside a string from closing the tag early', () => {
    // A name only survives verbatim on an account a test names, which is the
    // only way to get an awkward string as far as the re-serialised output.
    SUBJECTS.add(HANDLE.toLowerCase())
    const html = scrubMarkup(
      documentWith({ ...legacyUser(), name: 'One</script><script>alert(1)' }),
      blankStats(),
    )

    // Still one script element: the name's own `</script>` stayed a string.
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).toContain(String.raw`<\/script>`)
  })

  it('leaves markup it cannot parse exactly as it was', () => {
    const broken =
      '<!DOCTYPE html><script>var a={"screen_name":"' + HANDLE + '",</script>'
    expect(scrubMarkup(broken, blankStats())).toBe(broken)
  })

  it('touches nothing in a document with no user in it', () => {
    const plain = '<!DOCTYPE html><body><p>Nothing here {a} "b"</p></body>'
    expect(scrubMarkup(plain, blankStats())).toBe(plain)
  })
})

describe('the trends sidebar', () => {
  const trend = () => ({
    __typename: 'TimelineTrend',
    itemType: 'TimelineTrend',
    name: 'Someplace',
    trend_metadata: {
      domain_context: 'Trending in Someland',
      url: {
        url: 'twitter://search/?query=Someplace&src=trend_click&pc=true&vertical=trends',
        urtEndpointOptions: {
          requestParams: [{ key: 'cd', value: 'HBgJU29tZXBsYWNlAAA=' }],
        },
      },
    },
    trend_url: {
      url: 'twitter://search/?query=Someplace&src=trend_click&pc=true&vertical=trends',
      urtEndpointOptions: {
        requestParams: [{ key: 'cd', value: 'HBgJU29tZXBsYWNlAAA=' }],
      },
    },
  })

  it('stops naming the country the recorder browses from', () => {
    const node = trend()
    walk(node, blankStats())

    expect(node.trend_metadata.domain_context).toBe('Trending')
    expect(JSON.stringify(node)).not.toContain('Someland')
  })

  it('takes the trend name out of the label, the URLs and the cd blob', () => {
    const node = trend()
    walk(node, blankStats())

    // The `cd` param is base64 of the trend name — leaving it hands back what
    // the rename took away.
    expect(JSON.stringify(node)).not.toContain('Someplace')
    expect(JSON.stringify(node)).not.toContain('HBgJU29tZXBsYWNlAAA=')
    expect(node.name).toMatch(/^Trend [0-9a-f]{4}$/)
    expect(node.trend_url.url).toContain(encodeURIComponent(node.name))
  })

  it('leaves an ordinary object that merely has a name alone', () => {
    const node = { name: 'Someplace', trend_metadata: 'not an object' }
    walk(node, blankStats())
    expect(node.name).toBe('Someplace')
  })

  it('is a no-op the second time', () => {
    const node = trend()
    walk(node, blankStats())
    const once = JSON.stringify(node)

    const stats = blankStats()
    walk(node, stats)
    expect(JSON.stringify(node)).toBe(once)
    expect(stats.trends).toBe(0)
  })
})

describe('client-event beacons', () => {
  const beacon = (text) => ({
    request: {
      url: 'https://x.com/i/api/1.1/flow/viewer.json',
      headers: [],
      queryString: [],
      postData: {
        mimeType: 'application/x-www-form-urlencoded',
        text,
        params: [{ name: 'log', value: text }],
      },
    },
    response: { headers: [], content: {} },
  })

  it('drops the body X posts back describing what was on screen', () => {
    // The sidebar's trend names arrive a second time in here, percent-encoded.
    const entry = beacon(
      'debug=true&log=%5B%7B%22_category_%22%3A%22client_event%22%2C%22item_query%22%3A%22Someplace%22%7D%5D',
    )
    const stats = blankStats()
    scrubTelemetry(entry, stats)

    expect(entry.request.postData.text).toBe('')
    expect(entry.request.postData.params).toEqual([])
    expect(stats.telemetry).toBe(1)
  })

  it('leaves an ordinary request body alone', () => {
    const entry = beacon('{"usernames":["someone"]}')
    scrubTelemetry(entry, blankStats())
    expect(entry.request.postData.text).toBe('{"usernames":["someone"]}')
  })

  it('is a no-op the second time', () => {
    const entry = beacon('debug=true&log=%22client_event%22')
    scrubTelemetry(entry, blankStats())
    const stats = blankStats()
    scrubTelemetry(entry, stats)
    expect(stats.telemetry).toBe(0)
  })
})

describe('accounts the tests assert against', () => {
  it('keep their handle, name and bio', () => {
    SUBJECTS.add(HANDLE.toLowerCase())
    const user = legacyUser()
    walk(user, blankStats())

    expect(user.screen_name).toBe(HANDLE)
    expect(user.name).toBe(NAME)
    expect(user.description).toBe(BIO)
    // The avatar goes regardless: no test asserts on a face.
    expect(user.profile_image_url_https).toContain('default_profile')
  })

  it('keep them when they are inlined into a document too', () => {
    SUBJECTS.add(HANDLE.toLowerCase())
    const html = scrubMarkup(documentWith(legacyUser()), blankStats())
    expect(html).toContain(NAME)
    expect(html).toContain(HANDLE)
  })
})

describe('running it twice', () => {
  it('changes nothing the second time — which is what --check relies on', () => {
    const entries = [
      markupEntry(legacyUser()),
      jsonEntry({ user: legacyUser() }),
    ]
    for (const entry of entries) {
      scrubEntry(entry, blankStats())
      const once = entry.response.content.text

      const stats = blankStats()
      scrubEntry(entry, stats)
      expect(entry.response.content.text).toBe(once)
      // And it reports no work, so --check can say what it found.
      expect(stats.names + stats.bios + stats.pii + stats.avatars).toBe(0)
    }
  })
})
