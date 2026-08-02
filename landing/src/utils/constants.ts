/**
 * The slug is cosmetic — the Chrome Web Store resolves a listing by its ID and
 * redirects to whatever slug the current listing name produces. So this URL
 * works both before and after the listing is renamed, and there is no window
 * where the install button is broken.
 */
export const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/x-pat/mooomapkphlmpilnlcnpoilondlppbhi'

/**
 * Crypto donations, via NOWPayments. GitHub Sponsors and every card rail behind
 * Stripe exclude Georgia, so this is also what `.github/FUNDING.yml` points at
 * and what the extension's popup links to — one destination, three surfaces.
 */
export const DONATE_URL = 'https://nowpayments.io/donation/asmyshlyaev177'
