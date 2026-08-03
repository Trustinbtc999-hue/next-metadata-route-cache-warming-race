# AGENTS.md

## Repository purpose

This is a minimal Next.js reproduction for a prerender bug in Next.js canary builds
where metadata routes (sitemaps) that use `"use cache"` lose a race against their own
cache-warming pass during `next build`.  The repository exists to:

1. Demonstrate the failure deterministically.
2. Serve as a regression check — it exits 1 once the bug is fixed upstream.

There is no application to ship; all code is test infrastructure.

## Repository layout

```
app/
  repro/sitemap.ts                  # The failing route (both async halves present)
  control-instant-count/sitemap.ts  # Control: sync generateSitemaps, async cached fn
  control-instant-fill/sitemap.ts   # Control: async generateSitemaps, sync cached fn
  sitemap.ts                        # Control: no generateSitemaps, sync cached fn
  layout.tsx / page.tsx             # Minimal shell required by Next.js

next.config.ts   # Enables cacheComponents + partialPrefetching
verify.mjs       # Deterministic multi-round driver (see below)
package.json
tsconfig.json
```

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run build` | Single `next build` run — look for the "Unexpected cache miss" warning |
| `npm run verify` | Run `next build` three times; exits 0 only if the repro fires every round and every control stays clean |

There is no dev server, lint step, or test suite beyond `verify.mjs`.

## How `verify.mjs` works

- Deletes `.next` before each round to prevent cross-round cache pollution.
- Runs `next build` and scans stdout/stderr for `"Unexpected cache miss after cache warming phase"`.
- Checks which route entry (`.js` file path) appears in the stack frames immediately after the warning.
- Passes the round only when `app/repro/sitemap--route-entry.js` warns **and** the three control routes do not.
- Exits 0 after all rounds pass; exits 1 otherwise (with a descriptive message).

Set `ROUNDS=<n>` to change the round count (default 3).

## What to look for when modifying the repro

The bug requires **two** concurrent conditions in the same metadata route:

1. `generateSitemaps` is `async` (awaits anything before returning the ID list).
2. The default-export sitemap function is marked `"use cache"` **and** itself awaits something.

Removing either condition (as the control routes demonstrate) makes the route clean.
Adding more routes, changing `staticGenerationMaxConcurrency`, or restructuring the
cache-key arguments does **not** affect whether the race fires.

## Editing guidelines for agents

- **Do not change `app/repro/sitemap.ts`** unless you are deliberately testing a
  variation; it is the ground truth for the failure.
- **Do not remove or weaken the control routes**; they are the falsification check that
  proves the repro is not a general `"use cache"` flakiness issue.
- If you modify `verify.mjs`, keep its exit-code contract: 0 = repro fires every round
  with clean controls, 1 = anything else.
- There are no lint or type-check scripts to run; TypeScript errors are surfaced by
  `next build` itself.
- After any change, run `npm run verify` (or at minimum `npm run build`) to confirm the
  reproduction still fires as expected.
