import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import readline from 'readline';

dotenv.config();

const prisma = new PrismaClient();
const LOG_FILE_PATH = '/var/log/apache2/modsec_audit.log';

function parseApacheTimestamp(rawTime) {
  const match = rawTime.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;

  const [_, dd, mmm, yyyy, hh, mm, ss] = match;
  const monthMap = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
  };
  const MM = monthMap[mmm];
  if (!MM) return null;

  return new Date(`${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}Z`);
}

async function parseAuditLogFile() {
  try {
    const fileStream = fs.createReadStream(LOG_FILE_PATH);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      try {
        const logJson = JSON.parse(line);

        const timestampRaw = logJson.transaction?.time;
        const timestamp = parseApacheTimestamp(timestampRaw) || new Date();

        const transactionId = logJson.transaction?.transaction_id || 'unknown';
        const remoteHost = logJson.transaction?.remote_address || 'unknown';
        const matchedRules = logJson.audit_data?.messages || [];
        const fullLog = logJson;

        await prisma.rawLog.upsert({
          where: { transaction_id: transactionId },
          update: {},
          create: {
            timestamp,
            transaction_id: transactionId,
            remote_host: remoteHost,
            matched_rules: matchedRules,
            full_log: fullLog
          }
        });

        console.log(`✔️ 저장 완료: ${transactionId}`);
      } catch (err) {
        console.warn(`⚠️ 파싱 실패 (스킵됨): ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`❌ 로그 파일 열기 실패: ${err.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

parseAuditLogFile();