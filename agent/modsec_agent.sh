#!/bin/bash
# ModSecurity 서버에서 실행하여 로그를 관리 서버로 전송

# 설정
MODSEC_LOG_PATH="/var/log/apache2/modsec_audit.log"
MANAGEMENT_SERVER_URL="http://your-management-server:3000"  # 관리 웹서버 주소
BATCH_SIZE=10           # 한 번에 보낼 로그 수
SEND_INTERVAL=30        # 전송 주기 (초)
TEMP_DIR="/tmp/modsec_agent"
BUFFER_FILE="$TEMP_DIR/log_buffer.json"
PROCESSED_FILE="$TEMP_DIR/processed.log"

# 초기화
init() {
    echo "🚀 ModSecurity 에이전트 시작..."
    echo "📡 관리 서버: $MANAGEMENT_SERVER_URL"
    
    mkdir -p "$TEMP_DIR"
    
    # 버퍼 파일 초기화
    if [ ! -f "$BUFFER_FILE" ]; then
        echo '[]' > "$BUFFER_FILE"
    fi
    
    if [ ! -f "$PROCESSED_FILE" ]; then
        touch "$PROCESSED_FILE"
    fi
}

# ModSecurity 로그 파싱
parse_modsec_log() {
    local log_line="$1"
    
    # 타임스탬프 추출
    timestamp=$(date -Iseconds)
    
    # 클라이언트 IP 추출
    client_ip=$(echo "$log_line" | grep -oP '\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b' | head -1)
    
    # HTTP 메소드 및 URI 추출
    method=$(echo "$log_line" | grep -oP '\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b' | head -1)
    uri=$(echo "$log_line" | grep -oP '"[A-Z]+ [^"]*"' | sed 's/"//g' | cut -d' ' -f2- | head -1)
    
    # User-Agent 추출
    user_agent=$(echo "$log_line" | grep -oP 'User-Agent: [^"]*' | cut -d':' -f2- | sed 's/^ *//')
    
    # 기본값 설정
    [ -z "$client_ip" ] && client_ip="unknown"
    [ -z "$method" ] && method="GET"
    [ -z "$uri" ] && uri="/"
    [ -z "$user_agent" ] && user_agent="unknown"
    
    # JSON 형태로 반환
    cat << EOF
{
    "timestamp": "$timestamp",
    "client_ip": "$client_ip",
    "client_port": "$(shuf -i 10000-65000 -n 1)",
    "request": {
        "method": "$method",
        "uri": "$uri",
        "headers": {
            "User-Agent": "$user_agent"
        }
    },
    "raw_log": $(echo "$log_line" | jq -R .)
}
EOF
}

# 버퍼에 로그 추가
add_to_buffer() {
    local log_data="$1"
    
    # 현재 버퍼 읽기
    local buffer=$(cat "$BUFFER_FILE")
    
    # 새 로그 추가
    local updated_buffer=$(echo "$buffer" | jq --argjson log "$log_data" '. + [$log]')
    
    echo "$updated_buffer" > "$BUFFER_FILE"
    
    # 버퍼 크기 확인
    local buffer_size=$(echo "$updated_buffer" | jq 'length')
    
    if [ "$buffer_size" -ge "$BATCH_SIZE" ]; then
        send_logs_to_management
    fi
}

# 관리 서버로 로그 전송
send_logs_to_management() {
    local buffer=$(cat "$BUFFER_FILE")
    local log_count=$(echo "$buffer" | jq 'length')
    
    if [ "$log_count" -eq 0 ]; then
        return
    fi
    
    echo "📤 관리 서버로 로그 전송 중... ($log_count개)"
    
    # 관리 서버 API 엔드포인트로 전송
    local response=$(curl -s -X POST "$MANAGEMENT_SERVER_URL/api/logs/ingest" \
        -H "Content-Type: application/json" \
        -d "{\"logs\": $buffer, \"source\": \"modsecurity\"}" \
        2>/dev/null)
    
    if [ $? -eq 0 ] && [ -n "$response" ]; then
        local status=$(echo "$response" | jq -r '.success' 2>/dev/null)
        
        if [ "$status" = "true" ]; then
            echo "✅ 로그 전송 성공 ($log_count개)"
            
            # 버퍼 초기화
            echo '[]' > "$BUFFER_FILE"
        else
            echo "❌ 로그 전송 실패: $(echo "$response" | jq -r '.error' 2>/dev/null)"
        fi
    else
        echo "❌ 관리 서버 통신 실패"
    fi
}

# 주기적 전송 (백그라운드)
periodic_send() {
    while true; do
        sleep "$SEND_INTERVAL"
        
        # 버퍼에 로그가 있으면 전송
        local buffer=$(cat "$BUFFER_FILE" 2>/dev/null || echo '[]')
        local log_count=$(echo "$buffer" | jq 'length' 2>/dev/null || echo "0")
        
        if [ "$log_count" -gt 0 ]; then
            echo "⏰ 주기적 전송 ($log_count개 로그)"
            send_logs_to_management
        fi
    done
}

# 메인 로그 모니터링
monitor_logs() {
    echo "👀 로그 모니터링 시작: $MODSEC_LOG_PATH"
    
    # 주기적 전송 백그라운드 실행
    periodic_send &
    local periodic_pid=$!
    
    # 종료 시 백그라운드 프로세스도 종료
    trap "kill $periodic_pid 2>/dev/null; cleanup" SIGINT SIGTERM
    
    # 실시간 로그 감시
    tail -F "$MODSEC_LOG_PATH" 2>/dev/null | while read line; do
        # 이미 처리된 로그 스킵
        local line_hash=$(echo -n "$line" | md5sum | cut -d' ' -f1)
        
        if grep -q "$line_hash" "$PROCESSED_FILE" 2>/dev/null; then
            continue
        fi
        
        echo "$line_hash" >> "$PROCESSED_FILE"
        
        # ModSecurity 관련 로그만 처리
        if [[ "$line" == *"ModSecurity"* ]] || [[ "$line" == *"audit"* ]] || [[ "$line" == *"error"* ]]; then
            echo "📝 새 로그 감지"
            
            # 로그 파싱
            local parsed_log=$(parse_modsec_log "$line")
            
            # 버퍼에 추가
            add_to_buffer "$parsed_log"
        fi
    done
}

# 정리 작업
cleanup() {
    echo ""
    echo "🛑 에이전트 종료 중..."
    
    # 남은 로그들 전송
    echo "📤 남은 로그들 전송 중..."
    send_logs_to_management
    
    echo "✅ 정리 완료"
    exit 0
}

# 관리 서버 연결 테스트
test_management_connection() {
    echo "🔌 관리 서버 연결 테스트..."
    
    local response=$(curl -s "$MANAGEMENT_SERVER_URL/api/health" 2>/dev/null)
    
    if [ $? -eq 0 ] && [ -n "$response" ]; then
        echo "✅ 관리 서버 연결 성공"
        return 0
    else
        echo "❌ 관리 서버에 연결할 수 없습니다: $MANAGEMENT_SERVER_URL"
        echo "💡 관리 서버 URL을 확인하세요"
        return 1
    fi
}

# 메인 실행
main() {
    init
    
    # 로그 파일 확인
    if [ ! -f "$MODSEC_LOG_PATH" ]; then
        echo "❌ ModSecurity 로그 파일을 찾을 수 없습니다: $MODSEC_LOG_PATH"
        echo "💡 올바른 경로를 설정하세요"
        exit 1
    fi
    
    # 관리 서버 연결 테스트
    if ! test_management_connection; then
        echo "⚠️  관리 서버 연결 실패. 그래도 계속 진행합니다..."
    fi
    
    monitor_logs
}

# 도움말
show_help() {
    cat << EOF
ModSecurity → 관리서버 연결 에이전트

사용법: $0 [옵션]

옵션:
  -h, --help          이 도움말 표시
  -s, --server URL    관리 서버 URL 설정
  -l, --log PATH      ModSecurity 로그 파일 경로
  -i, --interval SEC  전송 주기 (초, 기본값: 30)

예시:
  $0 -s http://192.168.1.100:3000 -l /var/log/apache2/modsec_audit.log
EOF
}

# 인자 처리
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -s|--server)
            MANAGEMENT_SERVER_URL="$2"
            shift 2
            ;;
        -l|--log)
            MODSEC_LOG_PATH="$2"
            shift 2
            ;;
        -i|--interval)
            SEND_INTERVAL="$2"
            shift 2
            ;;
        *)
            echo "알 수 없는 옵션: $1"
            show_help
            exit 1
            ;;
    esac
done

main "$@"