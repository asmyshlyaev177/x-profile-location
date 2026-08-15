# `src/scripts/countries` — names, regions, aliases

`countries.ts` is country and region data and nothing else: `COUNTRY_FLAGS`,
`REGION_FLAGS`, `REGION_ABBR`, `REGION_MEMBERS`, `LOCATION_ALIASES`,
`CANONICAL_LOCATIONS`, `DEFAULT_BLOCKED_COUNTRIES`, and the functions that fold a name
(`canonicalLocation`, `expandLocations`, `regionsContaining`). Storage keys live in
[`../constants.ts`](../constants.ts), and every setting's normalizer, choices and default
in [`../settings.ts`](../settings.ts). `location-names.ts` turns a flag emoji into a
country name in the reader's locale via `Intl.DisplayNames`.

`COUNTRY_FLAGS` / `REGION_FLAGS` are keyed by the vocabulary X reports — ISO spellings like
`Russian Federation`, `Viet Nam`, `Korea`. Nobody types those, so `LOCATION_ALIASES` maps
each canonical name to its alternates (`USA`, `Russia`, `Vietnam`, `Türkiye`, `DRC`,
`Holland`, ISO codes, native names). `canonicalLocation(name)` folds any of them case- and
whitespace-insensitively; unknown locations pass through trimmed, since a name we don't
know yet must still be blockable. **Every comparison against `blockedCountries` goes
through it** (`isBlockedLocation()`), and the set is canonicalised on load, so a list saved
as `Czech Republic` blocks a profile X reports as `Czechia`. Flag lookups canonicalise too.

A few aliases (`Czech Republic`, `Macedonia`) are _also_ flag-map keys — kept for direct
display, filtered out of `CANONICAL_LOCATIONS` (the picker's list) via
`canonicalLocation(name) === name`. `countries.test.ts` asserts an alias shadowing a real
flag key carries the _same emoji_ as its canonical — the guard that stops a future
`Ireland → United Kingdom` swallowing a country. `Autocomplete` takes the table as its
`aliases` prop and ranks whole-string → prefix → substring, name before alias at each tier;
`renderOption(opt, matchedAlias)` gets the alias that earned the row its place, only when
the name itself didn't match.
