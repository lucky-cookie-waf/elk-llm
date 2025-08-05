// log_collector/test_crud.js

const { PrismaClient } = require('../generated/prisma/index.js');  // Prisma Client import
const prisma = new PrismaClient();  // 인스턴스 생성

async function main() {
  // ✅ 데이터 하나 삽입
  await prisma.rawLog.create({
    data: {
      transaction_id: 'TEST123456',
      timestamp: new Date(),
      remote_host: '127.0.0.1',
      method: 'GET',
      uri: '/test?x=1',
      http_version: '1.1',
      host: 'localhost',
      user_agent: 'curl/7.68.0',
      request_headers: { Host: 'localhost' },
      request_body: '',
      response_headers: { 'Content-Type': 'text/html' },
      response_body: '<html><body>Hello</body></html>',
      matched_rules: [],
      audit_summary: {},
      full_log: { example: true }
    }
  });

  // ✅ 모든 로그 조회
  const logs = await prisma.rawLog.findMany();
  console.log('🧾 전체 로그:', logs);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌ 에러 발생:', e);
    prisma.$disconnect();
  });
