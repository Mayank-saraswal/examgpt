import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const line of readFileSync(resolve(import.meta.dir, "../.env"), "utf8").split(
  /\r?\n/,
)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  )
    v = v.slice(1, -1);
  process.env[k] = v;
}

const { db } = await import("@examgpt/db");
const docId = process.argv[2]!;
const pageNum = Number(process.argv[3] ?? "3");
const p = await db.documentPage.findFirst({
  where: { documentId: docId, pageNumber: pageNum },
});
console.log(p?.markdown ?? "(none)");
