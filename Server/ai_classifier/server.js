import express from 'express';
import { OpenAI } from 'openai';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 미들웨어 설정
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100 // 요청 제한
});
app.use('/api/', limiter);

// 세션 포맷팅 함수 (Python 코드 포팅)
const formatSessionForAI = (session) => {
  let sessionText = "WAF 세션 분석:\n";
  
  // 처음 3개 요청만 사용 (토큰 제한 고려)
  const maxRequests = Math.min(session.length, 3);
  
  for (let i = 0; i < maxRequests; i++) {
    const req = session[i];
    sessionText += `요청${i + 1}: ${req.request_http_method || 'GET'} ${req.request_http_request || req.uri || ''}\n`;
    
    // 요청 본문이 있으면 추가 (100자 제한)
    if (req.request_body && req.request_body !== 'nan' && req.request_body.trim() !== '') {
      const body = req.request_body.toString().substring(0, 100);
      sessionText += `본문: ${body}\n`;
    }
    
    // 추가 헤더 정보
    if (req.user_agent) {
      sessionText += `User-Agent: ${req.user_agent}\n`;
    }
    
    sessionText += '\n';
  }
  
  return sessionText;
};

// 분류 결과 파싱 함수
const parseClassification = (response) => {
  const pred = response.trim().toUpperCase();
  
  if (pred.includes('SQL')) {
    return 'SQL Injection';
  } else if (pred.includes('CODE')) {
    return 'Code Injection';
  } else if (pred.includes('PATH') || pred.includes('TRAVERSAL')) {
    return 'Path Traversal';
  } else {
    return 'Normal';
  }
};

// 세션 분류 함수
const classifySession = async (session) => {
  try {
    const sessionText = formatSessionForAI(session);
    
    const response = await openai.chat.completions.create({
      model: process.env.FINE_TUNED_MODEL_ID || 'ft:gpt-3.5-turbo-0125:ecops::BynTqL1m',
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

    const classification = parseClassification(response.choices[0].message.content);
    
    return {
      success: true,
      classification,
      confidence: response.choices[0].finish_reason === 'stop' ? 'high' : 'low',
      raw_response: response.choices[0].message.content
    };
    
  } catch (error) {
    console.error('Classification error:', error);
    return {
      success: false,
      classification: 'Normal', // 기본값
      error: error.message
    };
  }
};

// API 라우트
app.post('/api/classify', async (req, res) => {
  try {
    const { session } = req.body;
    
    if (!session || !Array.isArray(session) || session.length === 0) {
      return res.status(400).json({
        error: 'Invalid session data. Expected non-empty array.'
      });
    }
    
    const result = await classifySession(session);
    res.json(result);
    
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 배치 분류 (여러 세션 한번에)
app.post('/api/classify/batch', async (req, res) => {
  try {
    const { sessions } = req.body;
    
    if (!sessions || !Array.isArray(sessions)) {
      return res.status(400).json({
        error: 'Invalid sessions data. Expected array of sessions.'
      });
    }
    
    const results = [];
    
    // 순차 처리 (API 제한 고려)
    for (const session of sessions) {
      const result = await classifySession(session);
      results.push(result);
      
      // API 제한 방지를 위한 딜레이
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    res.json({ results });
    
  } catch (error) {
    console.error('Batch API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ai-classifier' });
});

// 모델 테스트
app.get('/api/test', async (req, res) => {
  try {
    const testSession = [
      {
        request_http_method: 'GET',
        request_http_request: '/test',
        user_agent: 'Mozilla/5.0'
      }
    ];
    
    const result = await classifySession(testSession);
    res.json({ test: 'success', result });
    
  } catch (error) {
    res.status(500).json({ test: 'failed', error: error.message });
  }
});

app.listen(port, () => {
  console.log(`AI Classifier service running on port ${port}`);
  console.log(`Fine-tuned model: ${process.env.FINE_TUNED_MODEL_ID}`);
});