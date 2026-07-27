// Fails the build if a secret made it into the browser bundle.
//
// Runs after every `npm run build`. The paymaster key is supposed to live only
// server-side (app/api/paymaster.ts), but it is genuinely easy to leak it by
// accident — writing `const env = import.meta.env` instead of reading
// `import.meta.env.X` directly is enough, because aliasing the object makes
// Vite inline every VITE_ variable rather than statically replacing the one
// access it can dead-code away.
//
// That exact mistake was made while building this repo and caught here. A
// comment asking people to be careful would not have caught it.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../dist", import.meta.url).pathname;
const SECRET_VARS = ["VITE_AVNU_PAYMASTER_API_KEY"];

if (!existsSync(DIST)) {
  console.error("check-bundle: no dist/ — run the build first");
  process.exit(1);
}

/** Every emitted asset, recursively. */
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? files(p) : [p];
  });
}

// The literal values to hunt for, sourced the same way Vite would have.
const values = new Set();
for (const name of SECRET_VARS) {
  if (process.env[name]) values.add(process.env[name]);
}
const envLocal = new URL("../.env.local", import.meta.url).pathname;
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, "utf8").split("\n")) {
    const [k, ...rest] = line.split("=");
    const v = rest.join("=").trim();
    if (SECRET_VARS.includes(k?.trim()) && v) values.add(v);
  }
}

const problems = [];
for (const file of files(DIST).filter((f) => /\.(js|css|html|map)$/.test(f))) {
  const text = readFileSync(file, "utf8");
  // The variable NAME appearing means the whole env object was inlined.
  for (const name of SECRET_VARS) {
    if (text.includes(name)) problems.push(`${file}: inlined env var ${name}`);
  }
  for (const value of values) {
    if (text.includes(value)) problems.push(`${file}: contains a secret VALUE`);
  }
}

if (problems.length) {
  console.error("\n✗ SECRET IN BUNDLE — refusing to ship:\n");
  for (const p of problems) console.error("   " + p);
  console.error(
    "\n  Read secrets as `import.meta.env.X` directly; never alias" +
      "\n  `import.meta.env` to a variable. Server-side keys belong in" +
      "\n  app/api/ with no VITE_ prefix. See app/src/config.ts.\n",
  );
  process.exit(1);
}

console.log("✓ check-bundle: no secrets in dist/");
