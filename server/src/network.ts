// A vote's network as a 16-bit bucket; a profile keeps one vote per bucket.
// Unsalted: ~256 /24s share each value. Stored on votes, so keep it stable.

/** The /24 of an IPv4 address or the /48 of an IPv6 one, hashed to 0..65535;
 *  null when `ip` is not an address. */
export function networkOf(ip: string | null | undefined): number | null {
  if (!ip) return null
  const prefix = prefixOf(ip)
  return prefix === null ? null : fold16(fnv1a32(prefix))
}

function prefixOf(ip: string): string | null {
  const v4 = parseIpv4(ip)
  if (v4) return ipv4Prefix(v4)
  const v6 = parseIpv6(ip.replace(/%.*$/, ''))
  if (!v6) return null
  // ::ffff:a.b.c.d, which node's socket reports on a dual-stack listener.
  if (v6.slice(0, 5).every((g) => g === 0) && v6[5] === 0xffff) {
    return ipv4Prefix([v6[6] >> 8, v6[6] & 0xff, v6[7] >> 8])
  }
  return `6:${v6
    .slice(0, 3)
    .map((g) => g.toString(16))
    .join(':')}`
}

function ipv4Prefix(octets: number[]): string {
  return `4:${octets.slice(0, 3).join('.')}`
}

function parseIpv4(text: string): number[] | null {
  const parts = text.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  return octets.every((o) => o <= 255) ? octets : null
}

/** The eight 16-bit groups, `::` expanded and a dotted IPv4 tail split in two. */
function parseIpv6(text: string): number[] | null {
  const halves = text.split('::')
  if (halves.length > 2) return null
  const isCompressed = halves.length === 2
  const head = groupsOf(halves[0], !isCompressed)
  const tail = isCompressed ? groupsOf(halves[1], true) : []
  if (!head || !tail) return null
  const missing = 8 - head.length - tail.length
  if (isCompressed ? missing < 1 : missing !== 0) return null
  return [...head, ...Array<number>(missing).fill(0), ...tail]
}

function groupsOf(part: string, mayEndInIpv4: boolean): number[] | null {
  if (part === '') return []
  const fields = part.split(':')
  const v4 = mayEndInIpv4 ? parseIpv4(fields[fields.length - 1]) : null
  const hexFields = v4 ? fields.slice(0, -1) : fields
  if (!hexFields.every((f) => /^[0-9a-f]{1,4}$/i.test(f))) return null
  const groups = hexFields.map((f) => parseInt(f, 16))
  return v4 ? [...groups, (v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]] : groups
}

function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function fold16(hash: number): number {
  return (hash >>> 16) ^ (hash & 0xffff)
}
