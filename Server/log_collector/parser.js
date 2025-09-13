import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import readline from 'readline';

dotenv.config();

const prisma = new PrismaClient();
const LOG_FILE_PATH = '/var/log/apache2/modsec_audit.log';

const toInt = (v) =>
  v === undefined || v === null || v === '' ? null : (Number.parseInt(String(v), 10) || null);

function parseApacheTimestamp(rawTime) {
  const m = rawTime?.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mmm, yyyy, hh, mm, ss] = m;
  const monthMap = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
  };
  const MM = monthMap[mmm];
  if (!MM) return null;
  return new Date(`${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}Z`);
}

const getHeader = (headers, key) => {
  if (!headers) return null;
  if (headers[key] != null) return headers[key];
  if (headers[key.toLowerCase()] != null) return headers[key.toLowerCase()];
  if (headers[key.toUpperCase()] != null) return headers[key.toUpperCase()];
  const found = Object.entries(headers).find(([k]) => k.toLowerCase() === key.toLowerCase());
  return found ? found[1] : null;
};

const parseRequestLine = (line) => {
  if (!line || typeof line !== 'string') return { method: null, uri: null, httpVersion: null };
  const parts = line.trim().split(/\s+/);
  return {
    method: parts[0] ?? null,
    uri: parts[1] ?? null,
    httpVersion: (parts[2] ?? '').replace(/^HTTP\//, '') || null
  };
};

const normalizeBody = (b) => {
  if (b == null) return null;
  return typeof b === 'string' ? b : JSON.stringify(b);
};

async function parseAuditLogFile() {
  try {
    const fileStream = fs.createReadStream(LOG_FILE_PATH, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line?.trim()) continue;

      try {
        const logJson = JSON.parse(line);

        const t   = logJson.transaction || {};
        const req = logJson.request || {};
        const res = logJson.response || {};
        const ad  = logJson.audit_data || {};

        const timestampRaw = t.time;
        const timestamp = parseApacheTimestamp(timestampRaw) || new Date();

        const transactionId = t.transaction_id ?? t.id ?? null;
        if (!transactionId) {
          console.warn('⚠️ transaction_id 없음 → 스킵');
          continue;
        }

        const remote_host = t.client_ip ?? t.remote_address ?? null;
        const local_host  = t.host_ip   ?? t.local_address  ?? null;
        const remote_port = toInt(t.client_port ?? t.remote_port);
        const local_port  = toInt(t.host_port   ?? t.local_port);

        const { method: rlMethod, uri: rlUri, httpVersion: rlHttpVer } = parseRequestLine(req.request_line);
        const method       = t.request_method ?? req.method ?? rlMethod ?? null;
        const uri          = t.requested_uri  ?? t.uri ?? req.uri ?? rlUri ?? null;
        const http_version = t.http_version   ?? req.http_version ?? rlHttpVer ?? null;

        const request_headers  = (req.headers && Object.keys(req.headers).length > 0) ? req.headers : null;
        const host             = getHeader(request_headers, 'Host');
        const user_agent       = getHeader(request_headers, 'User-Agent');

        const request_body     = normalizeBody(ad.request_body ?? req.body ?? null);
        const response_headers = (res.headers && Object.keys(res.headers).length > 0) ? res.headers : null;
        const response_body    = normalizeBody(ad.response_body ?? res.body ?? null);

        const matched_rules = Array.isArray(ad.messages) ? ad.messages : (ad.messages ? [ad.messages] : []);
        const audit_summary = ad || null; // 원하면 요약 전체를 저장(스키마가 Json? 이므로 OK)
        const full_log      = logJson;

        await prisma.rawLog.upsert({
          where: { transaction_id: transactionId },
          update: {
            timestamp,
            remote_host, remote_port, local_host, local_port,
            method, uri, http_version, host, user_agent,
            request_headers, request_body,
            response_headers, response_body,
            matched_rules, audit_summary,
            full_log
          },
          create: {
            transaction_id: transactionId,
            timestamp,
            remote_host, remote_port, local_host, local_port,
            method, uri, http_version, host, user_agent,
            request_headers, request_body,
            response_headers, response_body,
            matched_rules, audit_summary,
            full_log
          }
        });

        console.log(`✔️ 저장 완료: ${transactionId}`);
      } catch (err) {
        console.warn(`⚠️ 파싱 실패 (스킵): ${err?.message || err}`);
      }
    }
  } catch (err) {
    console.error(`❌ 로그 파일 열기 실패: ${err?.message || err}`);
  } finally {
    await prisma.$disconnect();
  }
}

parseAuditLogFile();
