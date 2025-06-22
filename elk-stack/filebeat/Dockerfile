FROM docker.elastic.co/beats/filebeat:8.13.4

USER root

RUN mkdir -p /var/log/apache2

COPY filebeat.yml /usr/share/filebeat/filebeat.yml

RUN chown root:root /usr/share/filebeat/filebeat.yml