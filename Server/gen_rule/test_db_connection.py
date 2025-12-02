#!/usr/bin/env python3
"""
데이터베이스 연결과 MALICIOUS 세션 조회를 테스트하는 스크립트
"""

import psycopg2
import json
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres.cykbxbwpvkomvqqdbdrc:luckycookie2233!!@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true")

def test_db_connection():
    """데이터베이스 연결을 테스트합니다."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # 연결 테스트
        cur.execute("SELECT version();")
        version = cur.fetchone()
        print(f"✅ Database connected successfully!")
        print(f"PostgreSQL version: {version[0]}")
        
        # 테이블 존재 확인
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('Session', 'RawLog', 'Rule')
        """)
        tables = cur.fetchall()
        print(f"✅ Found tables: {[table[0] for table in tables]}")
        
        cur.close()
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

def test_malicious_sessions():
    """MALICIOUS 세션 조회를 테스트합니다."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # MALICIOUS 세션 수 조회
        cur.execute("SELECT COUNT(*) FROM \"Session\" WHERE label = 'MALICIOUS'")
        malicious_count = cur.fetchone()[0]
        print(f"📊 Found {malicious_count} malicious sessions")
        
        if malicious_count > 0:
            # MALICIOUS 세션과 연결된 로그 수 조회
            cur.execute("""
                SELECT COUNT(*) 
                FROM "RawLog" rl
                JOIN "Session" s ON rl.sessionId = s.id
                WHERE s.label = 'MALICIOUS'
            """)
            log_count = cur.fetchone()[0]
            print(f"📊 Found {log_count} logs from malicious sessions")
            
            # 샘플 데이터 조회
            cur.execute("""
                SELECT 
                    s.session_id,
                    s.ip_address,
                    COUNT(rl.id) as log_count
                FROM "Session" s
                LEFT JOIN "RawLog" rl ON s.id = rl.sessionId
                WHERE s.label = 'MALICIOUS'
                GROUP BY s.id, s.session_id, s.ip_address
                LIMIT 5
            """)
            samples = cur.fetchall()
            
            print("\n📋 Sample malicious sessions:")
            for session_id, ip_address, log_count in samples:
                print(f"  - Session: {session_id}, IP: {ip_address}, Logs: {log_count}")
        
        cur.close()
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Malicious sessions query failed: {e}")
        return False

def main():
    print("🔍 Testing database connection and queries...")
    print("=" * 50)
    
    # 데이터베이스 연결 테스트
    if not test_db_connection():
        return
    
    print("\n" + "=" * 50)
    
    # MALICIOUS 세션 조회 테스트
    test_malicious_sessions()
    
    print("\n" + "=" * 50)
    print("✅ Database tests completed!")

if __name__ == "__main__":
    main()
