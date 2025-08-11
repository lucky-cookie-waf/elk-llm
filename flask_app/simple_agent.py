# simple_agent.py - 5분짜리 테스트용 에이전트
from flask import Flask, request, jsonify
import os
import time
from datetime import datetime

app = Flask(__name__)

# 가짜 ModSecurity 룰 파일 경로
RULES_FILE = './test_rules.conf'

@app.route('/health', methods=['GET'])
def health():
    """에이전트 상태 확인"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'message': '에이전트가 정상 작동 중입니다!'
    })

@app.route('/api/rules', methods=['GET'])
def get_rules():
    """현재 룰 파일 내용 조회"""
    try:
        if os.path.exists(RULES_FILE):
            with open(RULES_FILE, 'r', encoding='utf-8') as f:
                content = f.read()
        else:
            content = "# 아직 룰이 없습니다.\n"
        
        return jsonify({
            'status': 'success',
            'rules': content,
            'file_path': RULES_FILE,
            'last_modified': os.path.getmtime(RULES_FILE) if os.path.exists(RULES_FILE) else None
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/rules', methods=['POST'])
def update_rules():
    """새 룰 추가/업데이트"""
    try:
        data = request.get_json()
        new_rule = data.get('rule_content', '')
        rule_name = data.get('rule_name', 'Unknown Rule')
        
        # 백업 생성 (시간스탬프 포함)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = f'./backup_rules_{timestamp}.conf'
        
        if os.path.exists(RULES_FILE):
            with open(RULES_FILE, 'r') as original:
                with open(backup_file, 'w') as backup:
                    backup.write(original.read())
        
        # 새 룰 추가 (기존 내용에 추가)
        with open(RULES_FILE, 'a', encoding='utf-8') as f:
            f.write(f'\n# {rule_name} - {datetime.now().isoformat()}\n')
            f.write(f'{new_rule}\n')
        
        # 가짜 Apache 재시작 시뮬레이션
        print(f"🔄 Apache 재시작 시뮬레이션 중...")
        time.sleep(1)  # 1초 대기로 재시작 시뮬레이션
        
        return jsonify({
            'status': 'success',
            'message': f'룰 "{rule_name}"이 성공적으로 추가되었습니다!',
            'backup_file': backup_file,
            'timestamp': datetime.now().isoformat(),
            'applied_rule': new_rule
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error', 
            'message': f'룰 적용 실패: {str(e)}'
        }), 500

@app.route('/api/logs', methods=['GET'])
def get_fake_logs():
    """가짜 ModSecurity 로그 시뮬레이션"""
    fake_logs = [
        f"[{datetime.now().isoformat()}] ModSecurity: Rule 100001 triggered - SQL Injection attempt blocked",
        f"[{datetime.now().isoformat()}] ModSecurity: Rule 100002 triggered - XSS attempt blocked",
        f"[{datetime.now().isoformat()}] Apache: Configuration reloaded successfully",
        f"[{datetime.now().isoformat()}] ModSecurity: All rules loaded successfully"
    ]
    
    return jsonify({
        'status': 'success',
        'logs': fake_logs,
        'log_count': len(fake_logs)
    })

if __name__ == '__main__':
    print("🚀 간단한 ModSecurity 에이전트 시작!")
    print("📡 http://localhost:8080 에서 실행 중...")
    print("🧪 테스트용 - 실제 ModSecurity와 연결되지 않음")
    
    # 초기 룰 파일 생성
    if not os.path.exists(RULES_FILE):
        with open(RULES_FILE, 'w') as f:
            f.write("# ModSecurity 테스트 룰 파일\n")
            f.write("# 생성 시간: " + datetime.now().isoformat() + "\n\n")
    
    app.run(host='0.0.0.0', port=8080, debug=True)