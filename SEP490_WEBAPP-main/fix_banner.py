import re

file_path = r"d:\Sep_G36\SEP490_G36\SEP490_WEBAPP-main\frontend_v2\src\pages\DataPrepView.tsx"

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Find the hero card line
hero_line = -1
for i in range(3030, 3070):
    if "1e293b" in lines[i] and "16px" in lines[i] and "32px" in lines[i]:
        hero_line = i
        break

if hero_line == -1:
    print("Hero card not found!")
    exit(1)

print(f"Found hero card at line {hero_line + 1}")

comment_line = hero_line - 1  # {/* Hero card */}
end_line = hero_line + 23     # closing </div>

new_banner = [
    '            {/* Hero card */}\n',
    '            <div style={{ background: \'#ffffff\', border: \'1px solid #e2e8f0\', borderRadius: \'16px\', padding: \'32px\', display: \'flex\', alignItems: \'center\', gap: \'32px\', flexWrap: \'wrap\', boxShadow: \'0 1px 3px rgba(0,0,0,0.06)\' }}>\n',
    '              <div style={{ flex: \'1\', minWidth: \'240px\' }}>\n',
    '                <div style={{ fontSize: \'12px\', fontWeight: \'700\', color: \'#64748b\', textTransform: \'uppercase\', letterSpacing: \'1px\', marginBottom: \'8px\' }}>STAGE 4 \u2014 CH\u1EDE STAFF HO\u00C0N TH\u00C0NH</div>\n',
    '                <h2 style={{ margin: \'0 0 8px 0\', fontSize: \'22px\', fontWeight: \'800\', color: \'#1e293b\' }}>\u0110ang ch\u1EDD Staff ho\u00E0n th\u00E0nh Stage 3</h2>\n',
    '                <p style={{ margin: 0, fontSize: \'14px\', color: \'#64748b\', lineHeight: \'1.6\' }}>\n',
    '                  Sau khi t\u1EA5t c\u1EA3 Staff n\u1ED9p \u0111\u1EE7 s\u1ED1 m\u1EABu labeling, h\u1EC7 th\u1ED1ng s\u1EBD t\u1EF1 \u0111\u1ED9ng gi\u1EA3i kho\u00E1 Stage 4 \u0111\u1EC3 ch\u1EA1y AI Judges.\n',
    '                </p>\n',
    '              </div>\n',
    '              <div style={{ display: \'flex\', flexDirection: \'column\', alignItems: \'center\', gap: \'8px\' }}>\n',
    '                <div style={{ position: \'relative\', width: \'100px\', height: \'100px\' }}>\n',
    '                  <svg width="100" height="100" viewBox="0 0 100 100">\n',
    '                    <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />\n',
    '                    <circle cx="50" cy="50" r="42" fill="none" stroke="#4f46e5" strokeWidth="8"\n',
    '                      strokeDasharray={`${(77 / 100) * 264} 264`}\n',
    '                      strokeLinecap="round" transform="rotate(-90 50 50)" />\n',
    '                  </svg>\n',
    '                  <div style={{ position: \'absolute\', inset: 0, display: \'flex\', flexDirection: \'column\', alignItems: \'center\', justifyContent: \'center\' }}>\n',
    '                    <span style={{ fontSize: \'22px\', fontWeight: \'900\', color: \'#1e293b\' }}>77%</span>\n',
    '                    <span style={{ fontSize: \'10px\', color: \'#64748b\' }}>ho\u00E0n th\u00E0nh</span>\n',
    '                  </div>\n',
    '                </div>\n',
    '                <span style={{ fontSize: \'12px\', color: \'#64748b\' }}>3 Staff ch\u01B0a n\u1ED9p \u0111\u1EE7</span>\n',
    '              </div>\n',
    '            </div>\n',
]

# Build new content
new_lines = []
for i in range(len(lines)):
    if i == comment_line:
        new_lines.extend(new_banner)
    elif i > comment_line and i <= end_line:
        continue
    else:
        new_lines.append(lines[i])

# Remove duplicate return block
remove_start = -1
remove_end = -1
for i in range(4500, len(new_lines)):
    stripped = new_lines[i].strip()
    if stripped == 'return (' and remove_start == -1:
        remove_start = i
        print(f"First return( at line {i+1}")
    elif stripped == 'return (' and remove_start != -1:
        remove_end = i - 1
        print(f"Second return( at line {i+1}, will remove {remove_start+1}-{remove_end+1}")
        break

if remove_start > 0 and remove_end > remove_start:
    final_lines = [new_lines[i] for i in range(len(new_lines)) if i < remove_start or i > remove_end]
else:
    final_lines = new_lines
    print("No duplicate return block found")

# Fix encoding issues
content = ''.join(final_lines)
content = content.replace('getStaffPrintitials', 'getStaffInitials')
content = content.replace('Printcrease', 'Increase')
content = content.replace('Printitials', 'Initials')
content = content.replace('setcurrentSubStep5', 'setCurrentSubStep5')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

final_count = content.count('\n')
print(f"Done. Final lines: ~{final_count}")
