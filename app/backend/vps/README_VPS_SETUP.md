# Настройка VPS для проброса портов

## Быстрая инструкция

### 1. С вашего компьютера скопируйте скрипт на VPS:

```bash
# В PowerShell на вашем компьютере
cd C:\Users\studo\Downloads\p039-master\p039-master
scp backend/vps/synology-port-forward.sh root@185.104.248.130:/root/
```

### 2. Подключитесь к VPS:

```bash
ssh root@185.104.248.130
```

### 3. На VPS выполните:

```bash
cd /root
chmod +x synology-port-forward.sh
sudo ./synology-port-forward.sh
```

### 4. Проверка:

```bash
# Проверьте правила
sudo iptables -t nat -L PREROUTING -n -v | grep 5001

# Проверьте доступность (должен вернуть 200 OK после деплоя backend)
curl -I http://127.0.0.1:5001/health
```

## Что делает скрипт:

- Пробрасывает порт 5001 на VPS → 10.8.0.2:8080 (Synology)
- Настраивает IP forwarding
- Настраивает MASQUERADE для VPN сети
- Создаёт systemd service для автозапуска

## Важно:

- Скрипт должен запускаться с правами root (sudo)
- VPN туннель должен быть активен
- Synology должен иметь IP 10.8.0.2 в VPN сети


