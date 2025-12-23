#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Script to upload files to Synology via SSH - using temp files"""
import subprocess
import sys
import os
import base64
import tempfile

NAS_HOST = "adminv@192.168.100.222"
BASE_PATH = "/volume1/docker/shortsai/backend"

files_to_upload = [
    ("backend/src/routes/diagRoutes.ts", "src/routes/diagRoutes.ts"),
    ("backend/src/routes/telegramRoutes.ts", "src/routes/telegramRoutes.ts"),
    ("backend/src/index.ts", "src/index.ts"),
]

def upload_file_via_temp(local_path, remote_path):
    """Upload file using temporary base64 file on server"""
    if not os.path.exists(local_path):
        print(f"ERROR: File not found: {local_path}")
        return False
    
    print(f"Uploading {local_path} -> {remote_path}...")
    
    # Read and encode file
    with open(local_path, 'rb') as f:
        content = f.read()
    
    encoded = base64.b64encode(content).decode('utf-8')
    
    # Split into chunks to avoid command line length limits
    chunk_size = 50000  # ~50KB chunks
    chunks = [encoded[i:i+chunk_size] for i in range(0, len(encoded), chunk_size)]
    
    remote_dir = os.path.dirname(remote_path)
    temp_file = f"/tmp/upload_{os.path.basename(remote_path)}.b64"
    
    # Upload chunks to temp file
    for i, chunk in enumerate(chunks):
        append_flag = ">>" if i > 0 else ">"
        cmd = f'ssh {NAS_HOST} "echo \'{chunk}\' {append_flag} {temp_file}"'
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"ERROR uploading chunk {i+1}/{len(chunks)}")
                print(result.stderr)
                return False
        except Exception as e:
            print(f"ERROR uploading chunk {i+1}: {e}")
            return False
    
    # Decode and write final file
    cmd = f'''ssh -t {NAS_HOST} "cd {BASE_PATH} && mkdir -p {remote_dir} && python3 << 'PYEOF'
import base64
import os

with open('{temp_file}', 'r') as f:
    encoded = f.read()

content = base64.b64decode(encoded).decode('utf-8')

os.makedirs('{remote_dir}', exist_ok=True)
with open('{remote_path}', 'w', encoding='utf-8') as f:
    f.write(content)

os.remove('{temp_file}')
print('OK: File {remote_path} created')
PYEOF
" '''
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"OK: Successfully uploaded: {remote_path}")
            return True
        else:
            print(f"ERROR decoding/writing {remote_path}:")
            print(result.stderr)
            # Cleanup temp file
            subprocess.run(f'ssh {NAS_HOST} "rm -f {temp_file}"', shell=True)
            return False
    except Exception as e:
        print(f"ERROR exception: {e}")
        subprocess.run(f'ssh {NAS_HOST} "rm -f {temp_file}"', shell=True)
        return False

if __name__ == "__main__":
    print("Starting file upload to Synology (v2)...")
    success_count = 0
    for local, remote in files_to_upload:
        if upload_file_via_temp(local, remote):
            success_count += 1
    
    print(f"\nUploaded files: {success_count}/{len(files_to_upload)}")
    if success_count == len(files_to_upload):
        print("All files successfully uploaded!")
        sys.exit(0)
    else:
        print("Some files failed to upload")
        sys.exit(1)

