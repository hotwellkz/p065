#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Script to upload files to Synology via SSH"""
import subprocess
import sys
import os
import io

# Set UTF-8 encoding for Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

NAS_HOST = "adminv@192.168.100.222"
BASE_PATH = "/volume1/docker/shortsai/backend"

files_to_upload = [
    ("backend/src/routes/diagRoutes.ts", "src/routes/diagRoutes.ts"),
    ("backend/src/routes/telegramRoutes.ts", "src/routes/telegramRoutes.ts"),
    ("backend/src/index.ts", "src/index.ts"),
]

def upload_file(local_path, remote_path):
    """Upload file to Synology via SSH using base64"""
    if not os.path.exists(local_path):
        print(f"ERROR: File not found: {local_path}")
        return False
    
    print(f"Uploading {local_path} -> {remote_path}...")
    
    # Читаем файл и кодируем в base64
    with open(local_path, 'rb') as f:
        content = f.read()
    
    import base64
    encoded = base64.b64encode(content).decode('utf-8')
    
    # Создаем команду для декодирования и записи файла на сервере
    remote_dir = os.path.dirname(remote_path)
    remote_filename = os.path.basename(remote_path)
    
    cmd = f"""ssh -t {NAS_HOST} "cd {BASE_PATH} && mkdir -p {remote_dir} && python3 << 'PYEOF'
import base64
import os

encoded = '''{encoded}'''
content = base64.b64decode(encoded).decode('utf-8')

os.makedirs('{remote_dir}', exist_ok=True)
with open('{remote_path}', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'OK: Файл {remote_path} создан')
PYEOF
" """
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"OK: Successfully uploaded: {remote_path}")
            return True
        else:
            print(f"ERROR uploading {remote_path}:")
            print(result.stderr)
            return False
    except Exception as e:
        print(f"ERROR exception uploading {remote_path}: {e}")
        return False

if __name__ == "__main__":
    print("Starting file upload to Synology...")
    success_count = 0
    for local, remote in files_to_upload:
        if upload_file(local, remote):
            success_count += 1
    
    print(f"\nUploaded files: {success_count}/{len(files_to_upload)}")
    if success_count == len(files_to_upload):
        print("All files successfully uploaded!")
        sys.exit(0)
    else:
        print("Some files failed to upload")
        sys.exit(1)

