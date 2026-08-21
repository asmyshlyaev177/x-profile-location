// Nothing here is inferred: every chip is a field X returned, phrased as X
// phrased it, out of a response the extension already had.

import { t } from '../i18n'
import { accountAgeDays, formatAccountAge } from '../profile'
import type { AccountFacts } from '../profile'

export interface Chip {
  text: string
  title: string
  tone?: 'plain' | 'warn' | 'block'
}

type ChipBuilder = (facts: Partial<AccountFacts>, now: number) => Chip | null

// X strips the bio, the follow button and the counts out of a blocker's hover
// card, so without this the card looks broken rather than answered.
const blockedByChip: ChipBuilder = (facts) =>
  facts.blockedBy
    ? {
        text: t('chipBlockedYou'),
        title: t('chipBlockedYouTitle'),
        tone: 'block',
      }
    : null

const ageChip: ChipBuilder = (facts, now) => {
  const age = formatAccountAge(facts.createdAt, now)
  if (!age) return null
  const days = accountAgeDays(facts.createdAt, now) ?? 0
  const created = new Date(facts.createdAt!).toISOString().slice(0, 10)
  return {
    text: t('chipAge', age),
    title: t('chipAgeTitle', created),
    // The strongest tell for a farmed account, and also just what a new user
    // looks like — hence a tint rather than a warning.
    tone: days < 90 ? 'warn' : 'plain',
  }
}

const affiliationChip: ChipBuilder = (facts) => {
  if (!facts.affiliation) return null
  const { name, handle } = facts.affiliation
  const shown = name || (handle ? `@${handle}` : null)
  if (!shown) return null
  return {
    text: t('chipAffiliation', shown),
    title: handle
      ? t('chipAffiliationTitleHandle', handle)
      : t('chipAffiliationTitle'),
  }
}

// No chip for plain Premium — X draws that. These two are invisible otherwise:
// X renders identity and legacy verification with the same badge as a paid one.
const verificationChip: ChipBuilder = (facts) => {
  if (facts.identityVerified) {
    return { text: t('chipIdVerified'), title: t('chipIdVerifiedTitle') }
  }
  if (facts.verified) {
    return { text: t('chipVerified'), title: t('chipVerifiedTitle') }
  }
  return null
}

const handleChangesChip: ChipBuilder = (facts) => {
  const changes = facts.handleChanges
  if (typeof changes !== 'number' || changes <= 0) return null
  return {
    text: changes === 1 ? t('chipHandle1') : t('chipHandles', changes),
    title: t('chipHandlesTitle', changes),
    tone: changes >= 3 ? 'warn' : 'plain',
  }
}

const protectedChip: ChipBuilder = (facts) =>
  facts.isProtected
    ? { text: t('chipProtected'), title: t('chipProtectedTitle') }
    : null

/**
 * In the order they are worth reading — blocked-you first, because it explains
 * everything else the card is missing. The order is all these rules share.
 */
const CHIP_BUILDERS: ChipBuilder[] = [
  blockedByChip,
  ageChip,
  affiliationChip,
  verificationChip,
  handleChangesChip,
  protectedChip,
]

export function accountChips(
  facts: Partial<AccountFacts> | undefined,
  now: number = Date.now(),
): Chip[] {
  if (!facts) return []
  return CHIP_BUILDERS.map((build) => build(facts, now)).filter(
    (chip) => chip !== null,
  )
}
