import os

def patch_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "'ngrok-skip-browser-warning': 'true'" in content:
        # replace cases without comma
        content = content.replace("'ngrok-skip-browser-warning': 'true'", "'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true'")
        # fix cases with double comma if they already had a comma
        content = content.replace("'true', 'Bypass-Tunnel-Reminder': 'true',", "'true', 'Bypass-Tunnel-Reminder': 'true'")
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Patched {filepath}")

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts'):
            patch_file(os.path.join(root, file))
