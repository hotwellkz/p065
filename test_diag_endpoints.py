#!/usr/bin/env python3
import subprocess
import json

TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijk4OGQ1YTM3OWI3OGJkZjFlNTBhNDA5MTEzZjJiMGM3NWU0NTJlNDciLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vcHJvbXB0LTZhNGZkIiwiYXVkIjoicHJvbXB0LTZhNGZkIiwiYXV0aF90aW1lIjoxNzY2NDE2MTYwLCJ1c2VyX2lkIjoid0pWV2Y3cXZ1b1hZYVZKU1piRUdwTkhVdHZhMiIsInN1YiI6IndKVldmN3F2dW9YWWFWSlNaYkVHcE5IVXR2YTIiLCJpYXQiOjE3NjY0MTYxODksImV4cCI6MTc2NjQxOTc4OSwiZW1haWwiOiJob3R3ZWxsLmt6QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyJob3R3ZWxsLmt6QGdtYWlsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6InBhc3N3b3JkIn19.NEP48IMMkAG58nZct5xk0ZAUD3jZBPkhfEPi9sc-gfyWdHANyRAMdCYkpmNNqUJ9pLehWlwUUbNzV-I9HJhBR7F6tSqIqQFTG6WN9-2LIuR2vsz8MM9Va9KE0On67aDlAkyEsCDs6XZ_zIIG4K_6MpI8FWWYFp39sBfXJAYZKQBwl_HxF7tXlHSOTaY50zGrt64mOkAX1J_3lazB4_vggPlqGW7mCG0F11LULHAvd8-31UXDBwoYICOERGtGRiQsSar4c_xyOBnaIWFtNHMiJuBSLn7rbJIk8m-KDoxoFdKP3a5A7dJjfIE6zGTFNXjmxxJH0zzW5l-B7f4kK5Pa3g"
API = "https://api.shortsai.ru"

print("=== 1. Check userId ===")
cmd1 = f'ssh adminv@192.168.100.222 "curl -sS -H \'Authorization: Bearer {TOKEN}\' \'{API}/api/diag/whoami\'"'
result1 = subprocess.run(cmd1, shell=True, capture_output=True, text=True)
if result1.returncode == 0:
    try:
        data1 = json.loads(result1.stdout)
        print(json.dumps(data1, indent=2, ensure_ascii=False))
    except:
        print(result1.stdout)
else:
    print(f"Error: {result1.stderr}")

print("\n=== 2. List channels ===")
cmd2 = f'ssh adminv@192.168.100.222 "curl -sS -H \'Authorization: Bearer {TOKEN}\' \'{API}/api/diag/channels\'"'
result2 = subprocess.run(cmd2, shell=True, capture_output=True, text=True, encoding='utf-8', errors='ignore')
if result2.returncode == 0:
    try:
        data2 = json.loads(result2.stdout)
        print(json.dumps(data2, indent=2, ensure_ascii=False))
    except:
        print(result2.stdout)
else:
    print(f"Error: {result2.stderr}")

print("\n=== 3. Check specific channel G8AXDO7PQn8nyU81nmm1 ===")
cmd3 = f'ssh adminv@192.168.100.222 "curl -sS -H \'Authorization: Bearer {TOKEN}\' \'{API}/api/diag/channel/G8AXDO7PQn8nyU81nmm1\'"'
result3 = subprocess.run(cmd3, shell=True, capture_output=True, text=True, encoding='utf-8', errors='ignore')
if result3.returncode == 0:
    try:
        data3 = json.loads(result3.stdout)
        print(json.dumps(data3, indent=2, ensure_ascii=False))
    except:
        print(result3.stdout)
else:
    print(f"Error: {result3.stderr}")

