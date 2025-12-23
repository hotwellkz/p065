#!/bin/bash
# Скрипт для очистки проблемного файла sudoers.d и проверки работы
# Выполните на Synology: sudo bash /tmp/cleanup-docker-sudo.sh

echo "Removing problematic file from /etc/sudoers.d/..."
rm -f /etc/sudoers.d/docker-nopasswd

echo ""
echo "Checking if passwordless sudo works..."
if sudo -n /usr/local/bin/docker ps > /dev/null 2>&1; then
    echo "✅ SUCCESS: Passwordless sudo for docker works!"
    echo ""
    echo "Testing docker commands:"
    sudo -n /usr/local/bin/docker ps
    echo ""
    echo "✅ Configuration is complete!"
else
    echo "❌ FAILED: Password still required"
    echo "Rules in /etc/sudoers may need to be checked"
fi


