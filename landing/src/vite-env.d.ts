/// <reference types="vite/client" />

/** Extension version, injected from the root package.json at build time. */
declare const __EXT_VERSION__: string

/**
 * ISO-8601 date of the HEAD commit, injected by `vite.define` in
 * `vite.config.ts`. `undefined` when the module is loaded outside a Vite
 * build — `seo.ts` guards for that.
 */
declare const __CONTENT_LAST_MODIFIED__: string | undefined
