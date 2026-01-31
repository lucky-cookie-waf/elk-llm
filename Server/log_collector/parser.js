#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import readline from 'readline';
import path from 'path';

dotenv.config();

const prisma = new PrismaClient();

const LOG_FILE_PATH = process.env.MODSEC_AUDIT_LOG || '/var/log/apache2/modsec_audit.log';
const CHECKPOINT_FILE =
  process.env.PARSER_CHECKPOINT_FILE || '/app/log_collector/.parser_checkpoint';

const command = process.argv[2] || 'run';

function log(msg) {
  console.log(`[parser] ${msg}`);
}

/* ======================
   Checkpoint
====================== */

function writeCheckpoint(ts = new Date()) {
  fs.mkdirSync(path.dirname(CHECKPOINT_FILE), { recursive: true });
  fs.writeFileSync(CHECKPOINT_FILE, ts.toISOString(), 'utf8');
  log(`checkpoint set: ${ts.toISOString()}`);
}

function readCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) return null;
  const raw = fs.readFileSync(CHECKPOINT_FILE, 'utf8').trim();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ======================
   Utils
====================== */

const toInt = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

function parseApacheTimestamp(rawTime) {
  // 예: "27/Jan/2026:12:28:50.603880 +0000"
  const m = rawTime?.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mmm, yyyy, hh, mm, ss] = m;
  const monthMap = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const MM = monthMap[mmm];
  if (!MM) return null;
  return new Date(`${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}Z`);
}

function parseRequestLine(requestLine) {
  const line = String(requestLine || '').trim();
  // "GET /path HTTP/1.1"
  const m = line.match(/^(\S+)\s+(\S+)\s+(HTTP\/\d(?:\.\d)?)$/i);
  if (!m) return { method: null, uri: null, http_version: null };
  return { method: m[1], uri: m[2], http_version: m[3] };
}

/* ======================
   Main parser
====================== */

async function runParser({ since }) {
  log(`start parsing (since=${since?.toISOString() || 'BEGIN'})`);
  log(`logfile=${LOG_FILE_PATH}`);

  const stream = fs.createReadStream(LOG_FILE_PATH, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream });

  let processed = 0;
  let stored = 0;

  let maxTimestamp = since ?? null;

  for await (const line of rl) {
    if (!line?.trim()) continue;

    let logJson;
    try {
      logJson = JSON.parse(line);
    } catch {
      continue;
    }

    const t = logJson.transaction || {};
    const req = logJson.request || {};
    const res = logJson.response || {};
    const ad = logJson.audit_data || {};
    const headers = req.headers || {};

    const timestamp = parseApacheTimestamp(t.time) || new Date();
    if (since && timestamp <= since) continue;

    if (!maxTimestamp || timestamp > maxTimestamp) maxTimestamp = timestamp;

    const transactionId = t.transaction_id;
    if (!transactionId) continue;

    processed += 1;

    // ===== request_line 파싱 =====
    const { method, uri, http_version } = parseRequestLine(req.request_line);

    // ===== headers =====
    const host = headers['Host'] || headers['host'] || null;
    const userAgent = headers['User-Agent'] || headers['user-agent'] || null;

    // ===== addresses/ports =====
    const remote_host = t.remote_address ?? null;
    const remote_port = toInt(t.remote_port);
    const local_host = t.local_address ?? null;
    const local_port = toInt(t.local_port);

    // ===== bodies/headers =====
    const request_body = ad.request_body ?? null;
    const request_headers = headers || null;

    const response_status = toInt(res.status);
    const response_headers = res.headers ?? null;
    const response_body = res.body ?? null;

    // ===== matched_rules/messages =====
    // (현재 샘플 구조: 문자열 배열)
    const matched_rules = Array.isArray(ad.messages) ? ad.messages : [];

    // ===== audit_summary =====
    const intercepted = Boolean(ad?.action?.intercepted);
    const action_msg = ad?.action?.message ? String(ad.action.message) : '';
    const audit_summary = [
      intercepted ? 'intercepted=true' : 'intercepted=false',
      response_status != null ? `status=${response_status}` : '',
      action_msg ? `action=${action_msg}` : '',
    ].filter(Boolean).join(' | ') || null;

    try {
      await prisma.rawLog.upsert({
        where: { transaction_id: transactionId },
        update: {},
        create: {
          transaction_id: transactionId,
          timestamp,

          remote_host,
          remote_port,
          local_host,
          local_port,

          method: method ?? null,
          uri: uri ?? null,
          http_version: http_version ?? null,

          host,
          user_agent: userAgent,

          request_headers,
          request_body,

          response_headers,
          response_body,

          matched_rules,
          audit_summary,

          full_log: logJson,
        },
      });

      stored += 1;
      // 너무 시끄러우면 주석 처리 가능
      // log(`stored: ${transactionId}`);
    } catch (e) {
      log(`skip(upsert fail): ${transactionId}`);
    }
  }

  log(`done. processed=${processed}, stored=${stored}`);

  if (maxTimestamp) writeCheckpoint(maxTimestamp);
  else writeCheckpoint(new Date());
}

/* ======================
   CLI
====================== */

(async () => {
  try {
    if (command === 'init') {
      writeCheckpoint();
      return;
    }

    if (command === 'run') {
      const since = readCheckpoint();
      await runParser({ since });
      return;
    }

    log(`unknown command: ${command}`);
    log(`usage: node parser.js init | run`);
  } finally {
    await prisma.$disconnect();
  }
})();

