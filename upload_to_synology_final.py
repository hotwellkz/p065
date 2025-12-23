#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Final version - upload files via separate base64 file"""
import subprocess
import sys
import os
import base64

NAS_HOST = "adminv@192.168.100.222"
BASE_PATH = "/volume1/docker/shortsai/backend"

files_to_upload = [
    ("backend/src/routes/diagRoutes.ts", "src/routes/diagRoutes.ts"),
    ("backend/src/routes/telegramRoutes.ts", "src/routes/telegramRoutes.ts"),
    ("backend/src/index.ts", "src/index.ts"),
]

def upload_file_final(local_path, remote_path):
    """Upload file using temp base64 file and Python script"""
    if not os.path.exists(local_path):
        print(f"ERROR: File not found: {local_path}")
        return False
    
    print(f"Uploading {local_path} -> {remote_path}...")
    
    # Read and encode
    with open(local_path, 'rb') as f:
        content = f.read()
    encoded = base64.b64encode(content).decode('utf-8')
    
    remote_dir = os.path.dirname(remote_path)
    temp_b64 = f"/tmp/upload_{os.path.basename(remote_path)}.b64"
    
    # Step 1: Create base64 file on server using printf (handles large data better)
    # Split into smaller commands if needed
    chunk_size = 10000
    chunks = [encoded[i:i+chunk_size] for i in range(0, len(encoded), chunk_size)]
    
    # Remove old file first
    subprocess.run(f'ssh {NAS_HOST} "rm -f {temp_b64}"', shell=True, capture_output=True)
    
    # Write chunks
    for i, chunk in enumerate(chunks):
        # Escape single quotes in chunk
        chunk_escaped = chunk.replace("'", "'\"'\"'")
        cmd = f'ssh {NAS_HOST} "printf \'%s\' \'{chunk_escaped}\' >> {temp_b64}"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"ERROR writing chunk {i+1}/{len(chunks)}")
            subprocess.run(f'ssh {NAS_HOST} "rm -f {temp_b64}"', shell=True)
            return False
    
    # Step 2: Decode and write final file
    python_cmd = f'''python3 << 'PYEOF'
import base64
import os

os.chdir('{BASE_PATH}')
os.makedirs('{remote_dir}', exist_ok=True)

with open('{temp_b64}', 'r') as f:
    encoded = f.read()

content = base64.b64decode(encoded).decode('utf-8')

with open('{remote_path}', 'w', encoding='utf-8') as f:
    f.write(content)

os.remove('{temp_b64}')
print('OK')
PYEOF'''
    
    cmd = f'ssh -t {NAS_HOST} "{python_cmd}"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    
    if result.returncode == 0 and "OK" in result.stdout:
        print(f"OK: Successfully uploaded: {remote_path}")
        return True
    else:
        print(f"ERROR decoding/writing {remote_path}:")
        print(result.stderr)
        subprocess.run(f'ssh {NAS_HOST} "rm -f {temp_b64}"', shell=True)
        return False

if __name__ == "__main__":
    print("Starting file upload (final version)...")
    success_count = 0
    for local, remote in files_to_upload:
        if upload_file_final(local, remote):
            success_count += 1
    
    print(f"\nUploaded: {success_count}/{len(files_to_upload)}")
    sys.exit(0 if success_count == len(files_to_upload) else 1)

