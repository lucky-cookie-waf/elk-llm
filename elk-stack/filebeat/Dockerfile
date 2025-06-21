FROM docker.elastic.co/beats/filebeat:8.13.4

COPY filebeat.yml /tmp/filebeat_config/filebeat.yml
CMD ["filebeat", "-e", "-c", "/tmp/filebeat.yml"]
