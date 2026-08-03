# `next build`: metadata route cache warming does not wait for its own `"use cache"` fill

Minimal reproduction for a Next.js prerender bug: with `cacheComponents` enabled, a
paginated metadata route (`sitemap.ts` + `generateSitemaps`) whose cached function
awaits anything is looked up by the **final prerender pass before the cache warming
pass has finished filling it**. Next then reports the miss as a *non-deterministic
argument* problem, which is not what is happening — the cache key is byte-identical
on both lookups.

```
Error: Unexpected cache miss after cache warming phase during prerendering. This is
likely caused by non-deterministic arguments that differ between the cache warming
phase and the final prerender phase (e.g. unstable array order). Ensure that arguments
passed to cached functions are deterministic.
    at async o (app/repro/sitemap--route-entry.js:40:18)
```

The route silently degrades to a dynamic hole, so the prerender work is wasted and the
build log carries a misleading error. The build still exits 0.

## Versions

| | |
|---|---|
| next | `16.3.0-canary.106` (also reproduces on `16.3.0-preview.9`) |
| react / react-dom | `19.2.6` |
| bundler | Turbopack (default) |
| config | `cacheComponents: true`, `partialPrefetching: true` |

Verified 3/3 rounds on both versions, with every control clean in every round.

## Reproduce

```bash
npm install
npm run verify
```

`verify.mjs` runs `next build` three times from a clean `.next` and exits 0 **only if**
the repro route does **not** warn in any round *and* every control route stays clean.
It exits 1 if the repro warning appears in any round (bug still present) or any control
is dirty, so the script acts as a standard regression test: green once the upstream fix
lands.

To see it once by hand:

```bash
npm run build
```

## What triggers it

Two awaits are needed, and both are ordinary things a real app does:

| | `generateSitemaps` awaits | cached function awaits | result |
|---|---|---|---|
| `app/repro/sitemap.ts` | yes | yes | **warns every build** |
| `app/control-instant-count/sitemap.ts` | no | yes | clean |
| `app/control-instant-fill/sitemap.ts` | yes | no | clean |
| `app/sitemap.ts` | n/a (no `generateSitemaps`) | no | clean |

In a real application these are a `SELECT count(*)` to decide how many sitemap pages
exist, and the paged query that fills one page. Neither is avoidable.

Note that both controls use the **same** `{ id: Promise<string> }` argument shape as the
repro, so the argument shape is not the variable being tested here.

## Why the "non-deterministic arguments" message is misleading

Building with `NEXT_PRIVATE_DEBUG_CACHE=1` prints the serialized cache key on every
lookup and save. For the failing route the key is **identical, byte for byte**, on the
warming lookup, the final-prerender lookup, and the eventual save:

```
use-cache: Resume Data Cache entry not found  1:055:["<buildId>","<fnId>",[{"id":"$@1"}]]1:13:"0"   <- warming pass
use-cache: registering as intra-request invocation leader  ...same key...
use-cache: registering as cross-request invocation leader  ...same key...
DefaultCacheHandler: get  ...same key...  not found
use-cache: Resume Data Cache entry not found  ...same key...                                        <- final prerender
Error: Unexpected cache miss after cache warming phase during prerendering. ...
...
use-cache: Resume Data Cache entry saved  ...same key...                                            <- fill lands, too late
```

The warming pass registers as the invocation leader and starts generating; the final
prerender looks the entry up before that generation resolves. So this is an ordering
problem in the warming phase, not a cache key problem.

`use-cache-wrapper.ts` already carries a TODO describing this failure mode:

```
// TODO(restart-on-cache-miss): We need to handle params/searchParams on page components.
// the promises will be tasky, so `encodeCacheKeyParts` will not resolve in the static stage.
// We have not started a cache read at this point, so we might just miss the cache completely.
```

## Things that are NOT the cause

These were each tested and ruled out before filing:

* **The `Promise` argument.** Restructuring so the cached function receives a resolved
  `number` instead of `{ id: Promise<string> }` changes the key from `[{"id":"$@1"}]` to
  `[0]` — and the miss still happens at the same rate. It only moves the reported stack
  frame into ignore-listed internals, which makes it harder to attribute.
* **Nested `"use cache"` calls** inside the cached function.
* **Sibling route count.** One affected route is enough; it does not need contention
  from other metadata routes.
* **`staticGenerationMaxConcurrency` / `staticGenerationRetryCount`.** Reproduces with
  the defaults.

## Impact

Reliability, not correctness of served output: the affected routes fall back to dynamic
rendering and still serve correct data under their `cacheLife` SWR window. The costs are
(a) the prerender warming work is discarded on every build, and (b) the build log points
users at their own argument shapes, which is a dead end — as this repository documents,
"fixing" the arguments does not help.

Found while adopting `cacheComponents` on a production app with five paginated sitemaps;
between three and five of them lost this race on every build, and which ones lost varied
run to run.
