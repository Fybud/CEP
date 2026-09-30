import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/config -> platform-api root; four levels up is repo root
const apiRoot = path.resolve(here, "../..");
const repoRoot = path.resolve(here, "../../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(apiRoot, ".env") });
dotenv.config({ path: path.join(apiRoot, ".env.local") });
dotenv.config({ path: path.join(apiRoot, ".env.demo") });
