import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { networkOf } from './network.ts'

const octet = fc.integer({ min: 0, max: 255 })
const hextet = fc.integer({ min: 0, max: 0xffff })
const hextets = (n: number) => fc.array(hextet, { minLength: n, maxLength: n })

const hex = (h: number) => h.toString(16)
const paddedUpper = (h: number) => h.toString(16).padStart(4, '0').toUpperCase()

describe('networkOf', () => {
  it('gives every address in one IPv4 /24 the same value', () => {
    fc.assert(
      fc.property(octet, octet, octet, octet, octet, (a, b, c, d, e) => {
        expect(networkOf(`${a}.${b}.${c}.${d}`)).toBe(
          networkOf(`${a}.${b}.${c}.${e}`),
        )
      }),
    )
  })

  it('reads an IPv4-mapped IPv6 address as the IPv4 address it carries', () => {
    fc.assert(
      fc.property(octet, octet, octet, octet, (a, b, c, d) => {
        expect(networkOf(`::ffff:${a}.${b}.${c}.${d}`)).toBe(
          networkOf(`${a}.${b}.${c}.${d}`),
        )
      }),
    )
    expect(networkOf('::FFFF:1.2.3.99')).toBe(networkOf('1.2.3.4'))
    expect(networkOf('0:0:0:0:0:ffff:102:304')).toBe(networkOf('1.2.3.4'))
  })

  it('gives every address in one IPv6 /48 the same value, however it is written', () => {
    fc.assert(
      fc.property(hextets(3), hextets(5), hextets(5), (net, a, b) => {
        const plain = [...net, ...a].map(hex).join(':')
        const padded = [...net, ...b].map(paddedUpper).join(':')
        expect(networkOf(plain)).toBe(networkOf(`${padded}%eth0`))
      }),
    )
    const spellings = [
      '2001:db8::1',
      '2001:0DB8:0000:ffff::',
      '2001:db8:0:1:2:3:4:5',
      '2001:db8::7%en0',
    ]
    for (const ip of spellings) {
      expect(networkOf(ip)).toBe(networkOf('2001:db8:0::'))
    }
  })

  it('is an integer from 0 to 65535 for any address', () => {
    fc.assert(
      fc.property(fc.oneof(fc.ipV4(), fc.ipV6()), (ip) => {
        const net = networkOf(ip)
        expect(Number.isInteger(net)).toBe(true)
        expect(net).toBeGreaterThanOrEqual(0)
        expect(net).toBeLessThanOrEqual(0xffff)
      }),
    )
  })

  it('spreads different networks over the range', () => {
    // 1,000 values into 65,536 collide ~8 times by chance; a constant or a
    // narrow hash collides nearly always.
    const v4 = Array.from(
      { length: 1000 },
      (_, i) => `10.${i >> 8}.${i & 255}.1`,
    )
    const v6 = Array.from({ length: 1000 }, (_, i) => `2001:db8:${hex(i)}::1`)
    expect(new Set(v4.map(networkOf)).size).toBeGreaterThan(980)
    expect(new Set(v6.map(networkOf)).size).toBeGreaterThan(980)
  })

  it('gives null for anything that is not an address', () => {
    const notAddresses = [
      undefined,
      null,
      '',
      'unknown',
      '1.2.3',
      '1.2.3.4.5',
      '256.0.0.1',
      '1.2.3.256',
      '1.2.3.-1',
      'a.b.c.d',
      '1.2.3.4:80',
      '::ffff:1.2.3.256',
      '1.2.3.4::',
      ':::1',
      '1::2::3',
      '2001:db8::g',
      '12345::1',
      '1:2:3:4:5:6:7',
      '1:2:3:4:5:6:7:8:9',
      '1:2:3:4:5:6:7:8::',
      '[::1]',
    ]
    for (const ip of notAddresses) expect(networkOf(ip)).toBeNull()
  })
})
