import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const p = resolve(import.meta.dir, "../.env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const { db } = await import("@examgpt/db");
const id = process.argv[2];
if (!id) {
  const docs = await db.document.findMany({
    where: { userId: "user_live_verify_phase2" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      ingestStatus: true,
      ingestProgress: true,
      failureReason: true,
      pageCount: true,
    },
  });
  console.log(JSON.stringify(docs, null, 2));
} else {
  const d = await db.document.findUnique({
    where: { id },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  console.log(
    JSON.stringify(
      {
        id: d?.id,
        status: d?.ingestStatus,
        progress: d?.ingestProgress,
        fail: d?.failureReason,
        pageCount: d?.pageCount,
        pages: d?.pages.map((p) => ({
          n: p.pageNumber,
          s: p.ocrStatus,
          f: p.failureReason,
          hasTables: p.hasTables,
          hasImages: p.hasImages,
          md: p.markdown?.slice(0, 120),
        })),
      },
      null,
      2,
    ),
  );
}
