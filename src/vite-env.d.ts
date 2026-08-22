/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the shared location cache backend; empty disables it.
   *  See src/scripts/constants.ts. */
  readonly VITE_CACHE_API_BASE?: string
}
