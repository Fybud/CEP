import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../dist/embed/webchat.js");

if (!fs.existsSync(src)) {
  console.error(`Embed bundle missing: ${src}`);
  process.exit(1);
}

console.log(`Embed ready at ${src}`);

// Best-effort copy into platform-api so GET /embed/webchat.js works on the API host.
const destDir = path.resolve(here, "../../platform-api/public/embed");
const dest = path.join(destDir, "webchat.js");
try {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Copied embed → ${dest}`);
} catch (err) {
  console.warn(
    `Skipped API public copy (${err instanceof Error ? err.message : err}). ` +
      `Web host still serves /embed/webchat.js from dist/embed.`,
  );
}
