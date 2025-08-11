import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// OpenAI 클라이언트
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());

// 세션 분류 함수 (노트북 로직)
const classifySession = async (sessionLogs) => {
  try {
    // 세션 포맷팅
    let sessionText = "WAF 세션 분석:\n";
    for (let i = 0; i < Math.min(sessionLogs.length, 3); i++) {
      const req = sessionLogs[i];
      sessionText += `요청${i+1}: ${req.method || 'GET'} ${req.uri || req.request_uri}\n`;
      if (req.request_body && req.request_body !== 'nan') {
        const body = String(req.request_body).substring(0, 100);
        sessionText += `본문: ${body}\n`;
      }
    }

    // 파인튜닝된 모델 호출
    const response = await openai.chat.completions.create({
      model: process.env.FINETUNED_MODEL_ID || 'ft:gpt-3.5-turbo-0125:ecops::BynTqL1m',
      messages: [
        {
          role: "system", 
          content: "WAF 분석가입니다. Normal, SQL Injection, Code Injection, Path Traversal 중 하나로 분류하세요."
        },
        {
          role: "user", 
          content: sessionText
        }
      ],
      max_tokens: 20,
      temperature: 0.1
    });

    const pred = response.choices[0].message.content.strip();

    // 정규화 (노트북과 동일)
    if (pred.toUpperCase().includes('SQL')) {
      return 'SQL Injection';
    } else if (pred.toUpperCase().includes('CODE')) {
      return 'Code Injection';
    } else if (pred.toUpperCase().includes('PATH') || pred.toUpperCase().includes('TRAVERSAL')) {
      return 'Path Traversal';
    } else {
      return 'Normal';
    }

  } catch (error) {
    console.error('분류 실패:', error);
    return 'Normal';
  }
};

// 세션 키 생성
const createSessionKey = (log) => {
  const ua = log.user_agent || '';
  const port = log.src_port || '';
  let browser = 'Unknown';
  
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  
  return `${port}_${browser}`;
};

// 로그 파싱 (ModSecurity 로그 → 표준 형식)
const parseModSecLog = (logEntry) => {
  return {
    timestamp: logEntry.timestamp || new Date().toISOString(),
    src_ip: logEntry.client_ip || logEntry.src_ip,
    src_port: logEntry.client_port || logEntry.src_port,
    method: logEntry.request?.method || logEntry.request_http_method || 'GET',
    uri: logEntry.request?.uri || logEntry.request?.url || logEntry.request_http_request,
    user_agent: logEntry.request?.headers?.['User-Agent'] || logEntry.user_agent || '',
    request_body: logEntry.request?.body || logEntry.request_body || ''
  };
};

// API 엔드포인트

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    model: process.env.FINETUNED_MODEL_ID || 'default'
  });
});

// 세션 분류
app.post('/api/classify-session', async (req, res) => {
  try {
    const { session_logs } = req.body;
    
    if (!session_logs?.length) {
      return res.status(400).json({ 
        error: '세션 로그가 필요합니다' 
      });
    }

    // 로그 파싱
    const parsedLogs = session_logs.map(parseModSecLog);
    const sessionKey = createSessionKey(parsedLogs[0]);
    
    // AI 분류
    const classification = await classifySession(parsedLogs);

    res.json({
      session_key: sessionKey,
      classification: {
        label: classification,
        confidence: 0.9
      },
      log_count: parsedLogs.length,
      parsed_logs: parsedLogs
    });

  } catch (error) {
    console.error('분류 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 단일 로그 분류 (호환성)
app.post('/api/classify', async (req, res) => {
  try {
    const { log_data } = req.body;
    
    if (!log_data) {
      return res.status(400).json({ error: '로그 데이터가 필요합니다' });
    }
    
    const parsedLog = parseModSecLog(log_data);
    const classification = await classifySession([parsedLog]);
    
    res.json({
      classification: {
        label: classification,
        confidence: 0.9
      },
      parsed_log: parsedLog
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`AI 분류 서버 실행: http://localhost:${port}`);
  console.log(`모델: ${process.env.FINETUNED_MODEL_ID || 'default'}`);
});