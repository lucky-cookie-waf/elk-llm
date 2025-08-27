// ESM 버전
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const uniqueId = `SMOKE_SESS_${Date.now()}`;

try {
  await prisma.$queryRaw`SELECT 1`;

  const inserted = await prisma.session.create({
    data: {
      session_id: uniqueId,
      ip_address: "127.0.0.1",
      user_agent: "smoke-test/1.0",
      start_time: new Date(Date.now() - 5 * 60 * 1000),
      end_time: new Date(),
      label: "NORMAL",
    },
    select: { id: true, session_id: true, label: true },
  });
  console.log("Inserted:", inserted);

  const read1 = await prisma.session.findUnique({
    where: { id: inserted.id },
    select: { id: true, session_id: true, label: true },
  });
  if (!read1 || read1.label !== "NORMAL") {
    throw new Error(`Expected NORMAL, got ${read1 && read1.label}`);
  }

  await prisma.session.update({
    where: { id: inserted.id },
    data: { label: "MALICIOUS" },
  });

  const read2 = await prisma.session.findUnique({
    where: { id: inserted.id },
    select: { id: true, session_id: true, label: true },
  });
  console.log("Updated:", read2);
  if (!read2 || read2.label !== "MALICIOUS") {
    throw new Error(`Expected MALICIOUS, got ${read2 && read2.label}`);
  }

  await prisma.session.delete({ where: { id: inserted.id } });
  console.log("✅ Session label smoke test passed");
  process.exit(0);
} catch (err) {
  console.error("❌ Session label smoke test failed");
  console.error(err?.stack || err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
