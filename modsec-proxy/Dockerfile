FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# 필수 패키지 설치
RUN apt-get update
RUN apt-get install -y --no-install-recommends \
    apache2 \
    libapache2-mod-security2 \
    modsecurity-crs \
    nodejs \
    npm

RUN rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 로그 디렉토리 생성 및 권한 설정
RUN mkdir -p /var/log/apache2 && \
    chown -R www-data:www-data /var/log/apache2/

RUN mkdir -p /etc/apache2/logs && \
    chown -R www-data:www-data /etc/apache2/logs/

# Apache 설정 파일 및 ModSecurity 설정 파일 복사
# 이 파일들은 modsec-proxy 디렉토리에 위치해야 합니다.
COPY apache2.conf /etc/apache2/apache2.conf
COPY modsecurity.conf /etc/modsecurity/modsecurity.conf

WORKDIR /var/www/express_app
COPY package.json .
COPY app.js .
RUN npm install --production

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
CMD ["/bin/bash", "-c", "cd /var/www/express_app && npm start & apache2ctl -D FOREGROUND"]