// The Vercel project does not serve The Legal Fly. Every path redirects to the
// Render web origin (see vercel.json), which serves the application together
// with the verified MaleCNS graph and the browser MiniMind bundle. Building the
// Next application here would fail closed by design, because those large
// artifacts are never present on Vercel. This script emits the minimal static
// output Vercel needs so the redirect rules can deploy.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, ".vercel-redirect");
mkdirSync(output, { recursive: true });
writeFileSync(
  path.join(output, "index.html"),
  "<!doctype html><meta charset=\"utf-8\"><title>The Legal Fly</title>"
  + "<meta http-equiv=\"refresh\" content=\"0; url=https://legalfly-web.onrender.com/\">"
  + "<p>The Legal Fly is served at <a href=\"https://legalfly-web.onrender.com/\">legalfly-web.onrender.com</a>.</p>\n",
);
console.log(`Vercel redirect shell written to ${output}`);
