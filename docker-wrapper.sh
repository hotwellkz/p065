#!/bin/bash
# Обёртка для выполнения docker команд без пароля
# Устанавливается в /usr/local/bin/docker-wrapper
# Использование: docker-wrapper <команда> [аргументы]

/usr/local/bin/docker "$@"



