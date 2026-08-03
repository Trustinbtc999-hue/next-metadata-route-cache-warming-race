// Regression test for the metadata-route cache warming race.
//
// Exits 0 ONLY when, across all rounds:
//   * the repro route does NOT emit "Unexpected cache miss after cache warming phase"
//   * every control route stays clean
//
// Exits 1 if the repro warning appears in any round or any control route is dirty,
// confirming the bug is still present.

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROUNDS = Number(process.env.ROUNDS ?? 3);
const WARNING = "Unexpected cache miss after cache warming phase";
const REPRO_ROUTE = "app/repro/sitemap--route-entry.js";
const CONTROL_ROUTES = [
  "app/control-instant-count/sitemap--route-entry.js",
  "app/control-instant-fill/sitemap--route-entry.js",
  "app/sitemap--route-entry.js",
];

function routesWithWarning(buildOutput) {
  const hits = new Set();
  const lines = buildOutput.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(WARNING)) continue;
    // The offending route entry is named in the frames right after the error.
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const match = lines[j].match(/(app\/[\w/-]*sitemap--route-entry\.js)/);
      if (match) {
        hits.add(match[1]);
        break;
      }
    }
  }
  return hits;
}

let allGood = true;

for (let round = 1; round <= ROUNDS; round++) {
  await rm(".next", { recursive: true, force: true });

  let output = "";
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["node_modules/next/dist/bin/next", "build"],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    output = `${stdout}\n${stderr}`;
  } catch (error) {
    output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    console.error(`round ${round}: next build exited non-zero`);
    allGood = false;
  }

  const hits = routesWithWarning(output);
  const reproHit = hits.has(REPRO_ROUTE);
  const dirtyControls = CONTROL_ROUTES.filter((route) => hits.has(route));

  console.log(
    `round ${round}: repro=${reproHit ? "TRIGGERED (bug present)" : "clean"} ` +
      `controls=${dirtyControls.length === 0 ? "clean" : dirtyControls.join(",")}`,
  );

  if (reproHit || dirtyControls.length > 0) allGood = false;
}

if (allGood) {
  console.log(`\nOK: no repro warning in all ${ROUNDS} rounds with every control clean.`);
  process.exit(0);
}

console.error(`\nFAILED: the cache-warming race was reproduced — bug is still present.`);
process.exit(1);
