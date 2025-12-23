#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Script to upload files to Synology via SSH - using stdin"""
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

def upload_file_via_stdin(local_path, remote_path):
    """Upload file using stdin to avoid command line length limits"""
    if not os.path.exists(local_path):
        print(f"ERROR: File not found: {local_path}")
        return False
    
    print(f"Uploading {local_path} -> {remote_path}...")
    
    # Read file content
    with open(local_path, 'rb') as f:
        content = f.read()
    
    # Encode to base64
    encoded = base64.b64encode(content).decode('utf-8')
    
    remote_dir = os.path.dirname(remote_path)
    
    # Create Python script that reads from stdin
    python_script = f'''import base64
import sys
import os

os.chdir('{BASE_PATH}')
os.makedirs('{remote_dir}', exist_ok=True)

encoded = sys.stdin.read()
content = base64.b64decode(encoded).decode('utf-8')

with open('{remote_path}', 'w', encoding='utf-8') as f:
    f.write(content)

print('OK: File {remote_path} created')
'''
    
    # Send base64 data via stdin to Python script on server
    cmd = f'ssh {NAS_HOST} "python3"'
    
    try:
        # Combine python script and encoded data
        full_input = python_script + "\n#ENCODED_DATA_START\n" + encoded
        
        process = subprocess.Popen(
            cmd,
            shell=True,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        stdout, stderr = process.communicate(input=full_input, timeout=60)
        
        if process.returncode == 0:
            print(f"OK: Successfully uploaded: {remote_path}")
            if stdout:
                print(stdout.strip())
            return True
        else:
            print(f"ERROR uploading {remote_path}:")
            print(stderr)
            return False
    except subprocess.TimeoutExpired:
        print(f"ERROR: Timeout uploading {remote_path}")
        process.kill()
        return False
    except Exception as e:
        print(f"ERROR exception: {e}")
        return False

if __name__ == "__main__":
    print("Starting file upload to Synology (v3 - stdin)...")
    success_count = 0
    for local, remote in files_to_upload:
        if upload_file_via_stdin(local, remote):
            success_count += 1
    
    print(f"\nUploaded files: {success_count}/{len(files_to_upload)}")
    if success_count == len(files_to_upload):
        print("All files successfully uploaded!")
        sys.exit(0)
    else:
        print("Some files failed to upload")
        sys.exit(1)

