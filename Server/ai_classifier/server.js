import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import path from 'path';

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

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

// 로컬 Mistral 모델로 분류하는 함수
const classifyWithMistral = async (sessionText) => {
  return new Promise((resolve, reject) => {
    const python = spawn('/app/venv/bin/python', [
      path.join(process.cwd(), 'model_inference.py'),
      sessionText
    ]);
    
    let result = '';
    let error = '';
    
    python.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    python.on('close', (code) => {
      if (code === 0) {
        try {
          const parsedResult = JSON.parse(result.trim());
          resolve(parsedResult);
        } catch (e) {
          reject(new Error(`JSON 파싱 실패: ${result}`));
        }
      } else {
        reject(new Error(`Python 프로세스 오류 (코드 ${code}): ${error}`));
      }
    });
    
    // 타임아웃 설정 (30초)
    setTimeout(() => {
      python.kill();
      reject(new Error('모델 추론 타임아웃'));
    }, 30000);
  });
};

// 세션 포맷팅 함수 (기존과 동일)
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

// 세션 분류 함수 (Mistral 모델 사용)
const classifySession = async (session) => {
  try {
    const sessionText = formatSessionForAI(session);
    console.log('분류 요청:', sessionText.substring(0, 200) + '...');
    
    const result = await classifyWithMistral(sessionText);
    
    console.log('분류 결과:', result);
    return result;
    
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
    
    // 순차 처리
    for (const session of sessions) {
      const result = await classifySession(session);
      results.push(result);
      
      // 모델 처리 간격 (리소스 관리)
      await new Promise(resolve => setTimeout(resolve, 200));
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
  res.json({ 
    status: 'ok', 
    service: 'ai-classifier-mistral',
    model: 'huggingface-mistral-7b'
  });
});

// 모델 테스트
app.get('/api/test', async (req, res) => {
  try {
    const testSession = [
      {
        request_http_method: 'GET',
        request_http_request: "/admin/config.php?id=1' UNION SELECT password FROM users--",
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
  console.log(`Using Hugging Face Mistral model`);
});