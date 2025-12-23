#!/bin/bash
# Полная диагностика с новым токеном
# Выполнить: bash test_diag_complete.sh

TOKEN="eyJhbGciOiJSUzI1NiIsImtpZCI6Ijk4OGQ1YTM3OWI3OGJkZjFlNTBhNDA5MTEzZjJiMGM3NWU0NTJlNDciLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vcHJvbXB0LTZhNGZkIiwiYXVkIjoicHJvbXB0LTZhNGZkIiwiYXV0aF90aW1lIjoxNzY2NDE2MTYwLCJ1c2VyX2lkIjoid0pWV2Y3cXZ1b1hZYVZKU1piRUdwTkhVdHZhMiIsInN1YiI6IndKVldmN3F2dW9YWWFWSlNaYkVHcE5IVXR2YTIiLCJpYXQiOjE3NjY0MTc5ODcsImV4cCI6MTc2NjQyMTU4NywiZW1haWwiOiJob3R3ZWxsLmt6QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyJob3R3ZWxsLmt6QGdtYWlsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6InBhc3N3b3JkIn19.UGxswL08yTdzwz06x23f0bPQKGYXkSchxG5iGDlOoT9Lpg6VsebZQDxGfB1QHk0NqLzSCFrtjo3rggFtYkgreSsyEXdyJNhX1Jj35XoSemYRc8kZ6TGPNBnwhkY5Fxu192qT1lqRgMX-pGnznXNcL86B9R1_YGzkZbJb0NdiGHkUKf0EHAZVd_5QTgSR3YRXxj1Y59dZXOL1KZ6Y7wimcGxVOBVnYsv7OFNGFqT_6Qrg1tte7owB6GqfALDM6JRbgFSiGwlWysQBkkppk_cwSQ3QCAQry3CbZahXnP07nFM6P4_dYA-qOAsc1gz-eN0QFv-sNAhLcInJnamHlB7avg"
API="https://api.shortsai.ru"
CHANNEL_ID="G8AXDO7PQn8nyU81nmm1"

echo "=== 1. Проверка userId ==="
curl -sS -H "Authorization: Bearer $TOKEN" "$API/api/diag/whoami" | python3 -m json.tool

echo ""
echo "=== 2. Список каналов (первые 5) ==="
curl -sS -H "Authorization: Bearer $TOKEN" "$API/api/diag/channels" | python3 -m json.tool | head -30

echo ""
echo "=== 3. Проверка конкретного канала $CHANNEL_ID ==="
curl -sS -H "Authorization: Bearer $TOKEN" "$API/api/diag/channel/$CHANNEL_ID" | python3 -m json.tool

echo ""
echo "=== 4. Тест запроса fetchAndSaveToServer ==="
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"channelId\":\"$CHANNEL_ID\",\"videoTitle\":\"Test Video\"}" \
  "$API/api/telegram/fetchAndSaveToServer" | python3 -m json.tool

echo ""
echo "=== 5. Логи после запроса (выполнить на Synology) ==="
echo "ssh -t adminv@192.168.100.222 \"sudo /usr/local/bin/docker logs --tail 150 shorts-backend 2>&1 | grep -iE 'fetchAndSaveToServer|downloadAndSaveToLocal|error from downloadAndSaveToLocal|CHANNEL_NOT_FOUND|Канал не найден|channel check result|checking channel' | tail -60\""

