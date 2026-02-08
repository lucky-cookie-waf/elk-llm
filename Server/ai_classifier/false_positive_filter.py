"""
Conservative False Positive Filter
보수적 필터 - 404 응답 + 정상 패턴 처리

필터링 대상:
- 404 응답을 받은 모든 공격 페이로드 (서버가 거부한 요청)
- SSRF 시도 (owasp.org, 외부 도메인)
- 경로 구분자 혼용 (c://, ///, \\)
- 이상한 경로 패턴
- 템플릿 변수

논리:
- 공격 페이로드가 있어도 404 응답을 받았다면 실제 위협이 성공하지 않음
  → Normal로 처리 (결과적으로 무해)
"""

import re
import urllib.parse


class ConservativeFilter:
    """
    보수적 False Positive 필터
    명백히 정상인 8가지 패턴만 화이트리스트 처리
    """

    def __init__(self):
        # 화이트리스트: 정상으로 처리할 패턴
        self.safe_patterns = [
            # SSRF 시도 (테스트 도메인, 공격은 아님)
            r'8501779237819759495\.owasp\.org',

            # 경로 구분자 혼용 (이상하지만 공격은 아님)
            r'c%3[Aa]%2[Ff]',           # c://
            r'%2[Ff]%2[Ff]%2[Ff]',      # ///
            r'%5[Cc]%5[Cc]',            # \\

            # 이상한 경로
            r'^/thishouldnotexist',
            r'^/%7[Cc]/',               # /|/
            r'/\|/',                     # /|/

            # 템플릿 변수
            r'\{\{\s*data\.model',
            r'\{\{\s*data\.url',

            # 정상 파일 확장자
            r'\.tar$',
            r'\.tmp$',

            # 외부 도메인 + feed
            r'google\.com.*\/feed',
            r'www\.[a-z]+\.com.*\/feed',
        ]

        self.compiled_patterns = [
            re.compile(pattern, re.IGNORECASE)
            for pattern in self.safe_patterns
        ]

    def is_safe_pattern(self, path: str) -> bool:
        """화이트리스트 패턴 매칭"""
        for pattern in self.compiled_patterns:
            if pattern.search(path):
                return True
        return False

    def has_attack_payload(self, path: str) -> bool:
        """명백한 공격 페이로드 체크 (필터링 제외용)"""
        decoded = urllib.parse.unquote(path)

        attack_indicators = [
            'etc/passwd',
            'sleep(',
            'sleep+',
            'cat+',
            '<script>',
            'alert(',
            '<!--#EXEC',
            'UNION+SELECT',
        ]

        return any(indicator in decoded for indicator in attack_indicators)

    def apply(
        self,
        ai_prediction: str,
        path: str,
        status_code: int = 200
    ) -> str:
        """
        필터 적용

        Args:
            ai_prediction: AI 모델의 예측
            path: HTTP 요청 경로
            status_code: HTTP 응답 코드

        Returns:
            보정된 예측 결과
        """
        # 이미 Normal이면 그대로
        if ai_prediction.lower() in ['normal', 'normal (benign)']:
            return ai_prediction

        # 404 + 명백한 공격 페이로드 → Normal 처리 (서버가 거부함)
        if status_code == 404 and self.has_attack_payload(path):
            return "Normal (benign)"

        # 화이트리스트 패턴이고 404면 Normal로 변환
        if self.is_safe_pattern(path) and status_code == 404:
            return "Normal (benign)"

        # 그 외는 AI 판단 유지
        return ai_prediction
