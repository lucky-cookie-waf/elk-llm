#!/bin/bash

echo "🚀 Starting ModSecurity Rule Generator..."
echo "========================================"

# 환경 변수 파일 확인
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp env_example.txt .env
    echo "📝 Please edit .env file with your actual configuration"
    exit 1
fi

# 데이터베이스 연결 테스트
echo "🔍 Testing database connection..."
python test_db_connection.py

if [ $? -ne 0 ]; then
    echo "❌ Database connection failed. Please check your configuration."
    exit 1
fi

echo ""
echo "🤖 Starting rule generation..."
python main.py

echo ""
echo "✅ Rule generation completed!"
