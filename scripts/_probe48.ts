import { prisma } from "../src/lib/prisma";
import { defaultRows } from "../src/lib/permissions/defaults";

(async () => {
  const stored = await prisma.permissionGrant.findMany();
  const want = defaultRows();
  const key = (r: { role: string; action: string }) => `${r.role}|${r.action}`;
  const map = new Map(stored.map((r) => [key(r), r.granted]));
  const wrong = want.filter((w) => map.get(key(w)) !== w.granted);
  console.log("rows", stored.length, "expected", want.length);
  console.log("mismatched", wrong.length, wrong.slice(0, 5));
  await prisma.$disconnect();
})();
