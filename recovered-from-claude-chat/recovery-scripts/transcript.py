"""Write the shared conversation as readable Markdown: every message's text, with
a one-line summary of the tools each Claude turn used.

usage: python3 -I transcript.py <snapshot.json> <out.md>
"""
import json
import sys
from collections import Counter

snap = json.load(open(sys.argv[1], encoding='utf-8'))
msgs = sorted(snap['chat_messages'], key=lambda m: m['index'])
present = {m['index'] for m in msgs}
missing = [i for i in range(max(present) + 1) if i not in present]

out = [f"# {snap.get('snapshot_name') or 'Shared conversation'}",
       '',
       f"Exported from a shared claude.ai conversation, snapshot taken {snap['created_at'][:10]}. "
       f"{len(msgs)} messages. Files the user attached are not part of a shared conversation.",
       '',
       f"Messages missing from the shared snapshot (retried or unloaded turns): {', '.join(map(str, missing)) or 'none'}.",
       '']

for m in msgs:
    who = 'You' if m['sender'] == 'human' else 'Claude'
    out.append(f"## {who} · {m['created_at'][:16].replace('T', ' ')} UTC · message {m['index']}")
    out.append('')
    texts = [b.get('text', '') for b in m.get('content', []) if b.get('type') == 'text' and b.get('text')]
    text = '\n\n'.join(t.strip() for t in texts) or (m.get('text') or '').strip()
    if m.get('file_count') or m.get('files') or m.get('attachments'):
        out.append('_(files were attached to this message; they are hidden in shared conversations)_')
        out.append('')
    if text:
        out.append(text)
        out.append('')
    tools = Counter(b['name'] for b in m.get('content', []) if b.get('type') == 'tool_use')
    if tools:
        out.append('_Tools used: ' + ', '.join(f'{n} ×{c}' for n, c in tools.most_common()) + '_')
        out.append('')
    if m['sender'] != 'human' and m.get('stop_reason') not in (None, 'end_turn', 'stop_sequence', 'tool_use'):
        out.append(f"_(turn ended: {m['stop_reason']})_")
        out.append('')

with open(sys.argv[2], 'w', encoding='utf-8') as f:
    f.write('\n'.join(out).rstrip() + '\n')
print('wrote', sys.argv[2], sum(len(x) for x in out), 'chars')
