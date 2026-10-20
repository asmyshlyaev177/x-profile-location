import { describe, expect, it } from 'vitest'
import { MSG } from '../constants'
import { isCacheApiRequest } from './cache-api'

describe('isCacheApiRequest', () => {
  it('accepts the three routes the client uses', () => {
    for (const route of ['/v1/loc/batch', '/v1/loc', '/v1/stats']) {
      expect(isCacheApiRequest({ type: MSG.CACHE_API, route })).toBe(true)
    }
  })

  // The worker builds the URL from the route, so anything else must not reach fetch.
  it.each([
    { type: MSG.CACHE_API, route: '/v1/admin' },
    { type: MSG.CACHE_API, route: '//evil.example/v1/loc' },
    { type: MSG.CACHE_API },
    { type: MSG.GET_MESSAGES, route: '/v1/stats' },
    null,
    'CACHE_API',
  ])('rejects %j', (message) => {
    expect(isCacheApiRequest(message)).toBe(false)
  })
})
