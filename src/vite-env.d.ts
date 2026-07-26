/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the shared location cache backend. Unset → the default
   * Cloudflare Worker; set to a self-hosted origin to retarget a build; set to
   * an empty string to build with the shared cache disabled entirely.
   * See src/scripts/constants.ts.
   */
  readonly VITE_CACHE_API_BASE?: string
}
