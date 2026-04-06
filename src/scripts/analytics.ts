/**
 * GA4 Measurement Protocol analytics for Chrome extensions.
 *
 * Set your credentials via environment variables in a `.env` file:
 *   VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
 *   VITE_GA_API_SECRET=your_api_secret
 *
 * Credentials are baked in at build time via Vite's import.meta.env.
 * Leave them empty to disable tracking (no requests will be sent).
 */

// for debug
// const GA_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect'
// real one
const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect'

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID ?? ''
const API_SECRET = import.meta.env.VITE_GA_API_SECRET ?? ''
const DEFAULT_ENGAGEMENT_TIME_MSEC = 100
const SESSION_EXPIRATION_MIN = 30

type SessionData = { session_id: string; timestamp: number }

async function getOrCreateClientId(): Promise<string> {
  const result = await chrome.storage.local.get('gaClientId')
  let clientId = result.gaClientId as string | undefined
  if (!clientId) {
    clientId = `${crypto.randomUUID()}.${Math.floor(Date.now() / 1000)}`
    await chrome.storage.local.set({ gaClientId: clientId })
  }
  return clientId
}

async function getOrCreateSessionId(): Promise<string> {
  const result = await chrome.storage.session.get('gaSessionData')
  let sessionData = result.gaSessionData as SessionData | undefined
  const now = Date.now()

  if (sessionData) {
    const ageMin = (now - sessionData.timestamp) / 60_000
    if (ageMin > SESSION_EXPIRATION_MIN) {
      sessionData = undefined
    } else {
      sessionData.timestamp = now
      await chrome.storage.session.set({ gaSessionData: sessionData })
    }
  }

  if (!sessionData) {
    sessionData = { session_id: now.toString(), timestamp: now }
    await chrome.storage.session.set({ gaSessionData: sessionData })
  }

  return sessionData.session_id
}

export async function trackEvent(
  name: string,
  params: Record<string, unknown> = {},
): Promise<void> {
  if (!MEASUREMENT_ID || !API_SECRET) return
  try {
    await fetch(
      `${GA_ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`,
      {
        method: 'POST',
        body: JSON.stringify({
          client_id: await getOrCreateClientId(),
          events: [
            {
              name,
              params: {
                session_id: await getOrCreateSessionId(),
                engagement_time_msec: DEFAULT_ENGAGEMENT_TIME_MSEC,
                ...params,
              },
            },
          ],
        }),
      },
    )
  } catch {
    // Analytics failures are non-fatal — never block extension functionality
  }
}
