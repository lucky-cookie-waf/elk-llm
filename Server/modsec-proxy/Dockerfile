FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# 필수 패키지 설치
RUN apt-get update
RUN apt-get install -y --no-install-recommends \
    apache2 \
    libapache2-mod-security2 \
    git \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# CRS 설치
RUN git clone --branch v3.2.0 --depth 1 https://github.com/coreruleset/coreruleset /opt/coreruleset && \
    mkdir -p /etc/modsecurity/rules/crs/rules && \
    cp /opt/coreruleset/crs-setup.conf.example /etc/modsecurity/rules/crs/crs-setup.conf && \
    find /opt/coreruleset/rules -type f \( -name "*.conf" -o -name "*.data" \) -exec cp {} /etc/modsecurity/rules/crs/rules/ \; && \
    rm -rf /opt/coreruleset

# 로그 디렉토리 생성 및 권한 설정
RUN mkdir -p /var/log/apache2 && \
    chown -R www-data:www-data /var/log/apache2/

RUN mkdir -p /etc/apache2/logs && \
    chown -R www-data:www-data /etc/apache2/logs/

# Apache 설정 파일 및 ModSecurity 설정 파일 복사
# 이 파일들은 modsec-proxy 디렉토리에 위치해야 합니다.
COPY apache2.conf /etc/apache2/apache2.conf
COPY modsecurity.conf /etc/modsecurity/modsecurity.conf

# Apache 모듈 활성화
RUN a2dismod mpm_event && \
    a2enmod mpm_prefork && \
    a2enmod rewrite && \
    a2enmod security2 && \
    a2enmod proxy && \
    a2enmod proxy_http

# ServerTokens Prod 설정 (보안 강화)
RUN sed -i "s/ServerTokens OS/ServerTokens Prod/" /etc/apache2/conf-available/security.conf && \
    a2enconf security

# 컨테이너 시작 시 Apache를 포그라운드에서 실행
CMD ["apache2ctl", "-D", "FOREGROUND"]