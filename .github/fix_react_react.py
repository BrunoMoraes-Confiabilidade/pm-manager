#!/usr/bin/env python3
"""Hotfix: remove duplicated React. prefix (React.React.createElement) that broke render."""
import sys
FILE = 'index.html' if len(sys.argv) < 2 else sys.argv[1]
with open(FILE, 'r', encoding='utf-8') as f:
    s = f.read()
old = '),React.React.createElement("div",{className:"input-wrap"}'
new = '),React.createElement("div",{className:"input-wrap"}'
c = s.count(old)
print(f'bug pattern occurrences: {c}')
assert c == 1, f'expected 1, got {c}'
s = s.replace(old, new, 1)
assert 'React.React.createElement' not in s, 'still has React.React'
with open(FILE, 'w', encoding='utf-8') as f:
    f.write(s)
print('Fixed: React.React.createElement removed.')
