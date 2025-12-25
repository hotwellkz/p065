#!/bin/bash
# Скрипт для настройки passwordless sudo для docker на Synology
# Выполните на Synology: sudo bash /tmp/setup-docker-sudo.sh

# Удаляем старый файл из sudoers.d (если есть)
rm -f /etc/sudoers.d/docker-nopasswd

# Добавляем правила в основной sudoers
echo "" >> /etc/sudoers
echo "# Docker commands without password" >> /etc/sudoers
echo "admin ALL=(ALL) NOPASSWD: /usr/local/bin/docker" >> /etc/sudoers
echo "admin ALL=(ALL) NOPASSWD: /usr/local/bin/docker-compose" >> /etc/sudoers
echo "adminv ALL=(ALL) NOPASSWD: /usr/local/bin/docker" >> /etc/sudoers
echo "adminv ALL=(ALL) NOPASSWD: /usr/local/bin/docker-compose" >> /etc/sudoers

echo "Rules added to /etc/sudoers"
echo "Test with: sudo -n /usr/local/bin/docker ps"



