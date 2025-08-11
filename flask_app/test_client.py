# test_client.py - 에이전트와 통신하는 클라이언트 테스트
import requests
import json
import time

# 에이전트 주소
AGENT_URL = "http://localhost:8080"

def test_agent_connection():
    """에이전트 연결 테스트"""
    print("🔍 에이전트 연결 테스트 중...")
    try:
        response = requests.get(f"{AGENT_URL}/health")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 에이전트 연결 성공!")
            print(f"   상태: {data['status']}")
            print(f"   시간: {data['timestamp']}")
            return True
        else:
            print(f"❌ 연결 실패: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 연결 오류: {e}")
        return False

def test_get_current_rules():
    """현재 룰 조회 테스트"""
    print("\n📋 현재 룰 조회 테스트...")
    try:
        response = requests.get(f"{AGENT_URL}/api/rules")
        if response.status_code == 200:
            data = response.json()
            print("✅ 룰 조회 성공!")
            print("현재 룰 파일 내용:")
            print("-" * 40)
            print(data['rules'])
            print("-" * 40)
            return True
        else:
            print(f"❌ 룰 조회 실패: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 룰 조회 오류: {e}")
        return False

def test_add_new_rule(rule_name, rule_content):
    """새 룰 추가 테스트"""
    print(f"\n➕ 새 룰 추가 테스트: {rule_name}")
    try:
        payload = {
            "rule_name": rule_name,
            "rule_content": rule_content
        }
        
        response = requests.post(
            f"{AGENT_URL}/api/rules", 
            json=payload,
            headers={'Content-Type': 'application/json'}
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ 룰 추가 성공!")
            print(f"   메시지: {data['message']}")
            print(f"   백업 파일: {data['backup_file']}")
            print(f"   적용 시간: {data['timestamp']}")
            return True
        else:
            print(f"❌ 룰 추가 실패: {response.status_code}")
            print(f"   응답: {response.text}")
            return False
    except Exception as e:
        print(f"❌ 룰 추가 오류: {e}")
        return False

def test_get_logs():
    """로그 조회 테스트"""
    print("\n📄 로그 조회 테스트...")
    try:
        response = requests.get(f"{AGENT_URL}/api/logs")
        if response.status_code == 200:
            data = response.json()
            print("✅ 로그 조회 성공!")
            print("최근 로그:")
            for log in data['logs']:
                print(f"   {log}")
            return True
        else:
            print(f"❌ 로그 조회 실패: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 로그 조회 오류: {e}")
        return False

def main():
    """전체 테스트 실행"""
    print("🧪 ModSecurity 에이전트 통신 테스트 시작!\n")
    
    # 1. 연결 테스트
    if not test_agent_connection():
        print("❌ 에이전트에 연결할 수 없습니다. simple_agent.py를 먼저 실행하세요!")
        return
    
    # 2. 현재 룰 조회
    test_get_current_rules()
    
    # 3. 새 룰 추가 테스트들
    test_rules = [
        {
            "name": "SQL Injection 차단",
            "content": "SecRule ARGS \"@detectSQLi\" \"id:100001,phase:2,deny,msg:'SQL Injection detected'\""
        },
        {
            "name": "XSS 공격 차단", 
            "content": "SecRule ARGS \"@detectXSS\" \"id:100002,phase:2,deny,msg:'XSS attack detected'\""
        },
        {
            "name": "Path Traversal 차단",
            "content": "SecRule ARGS \"@contains ../\" \"id:100003,phase:2,deny,msg:'Path traversal detected'\""
        }
    ]
    
    for rule in test_rules:
        test_add_new_rule(rule["name"], rule["content"])
        time.sleep(1)  # 1초 대기
    
    # 4. 업데이트된 룰 다시 조회
    print("\n🔄 업데이트된 룰 확인...")
    test_get_current_rules()
    
    # 5. 로그 조회
    test_get_logs()
    
    print("\n🎉 테스트 완료! 에이전트 방식이 정상적으로 작동합니다!")
    print("💡 실제 환경에서는 ModSecurity 파일과 Apache 서비스에 연결됩니다.")

if __name__ == "__main__":
    main()