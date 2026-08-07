#!/usr/bin/env python3
"""검수 리포트 생성 — 사진과 전사를 나란히, 체크 진행은 localStorage 저장."""
import json
import os

BASE = os.path.dirname(__file__)
rows = json.load(open(f'{BASE}/wordsets/_review.json'))
skipped = json.load(open(f'{BASE}/wordsets/_skipped.json'))

photos = sorted({r['photo'] for r in rows})
by_photo = {p: [r for r in rows if r['photo'] == p] for p in photos}
skip_by_photo = {}
for s in skipped:
    skip_by_photo.setdefault(s['photo'], []).append(s)

total = len(rows)
unc = sum(1 for r in rows if r['u'])

html = ['''<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>속기약어노트 전사 검수</title>
<style>
body{font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;margin:0;background:#fafafa;color:#18181b}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #e4e4e7;padding:10px 16px;display:flex;gap:14px;align-items:center;z-index:5}
h1{font-size:16px;margin:0}
.prog{font-size:13px;color:#71717a}
section{max-width:1400px;margin:24px auto;padding:0 16px}
h2{font-size:15px;border-left:4px solid #2563eb;padding-left:8px}
.wrap{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.wrap img{flex:1 1 640px;max-width:min(100%,900px);border:1px solid #e4e4e7;border-radius:8px}
table{border-collapse:collapse;font-size:13px;background:#fff;flex:1 1 380px}
td,th{border:1px solid #e4e4e7;padding:3px 8px;text-align:left}
th{background:#f4f4f5;position:sticky;top:52px}
tr.u{background:#fef9c3}
td.h{letter-spacing:.08em;color:#3f3f46}
td.ws{color:#71717a;font-size:11px;white-space:nowrap}
.skip{color:#a1a1aa;font-size:12px;margin-top:6px}
input[type=checkbox]{transform:scale(1.2)}
.done-row{opacity:.45}
.legend{font-size:12px;color:#71717a}
</style></head><body>
<header><h1>속기약어노트 전사 검수</h1>
<span class="prog" id="prog"></span>
<span class="legend">노란 줄 = 판독 확신 낮음(우선 확인) · 체크하면 회색 처리(자동 저장)</span></header>''']

html.append(f'<section><p>총 {len(photos)}장 · {total}항목 · ⚠️ 확인 필요 {unc}건. '
            f'사진과 표를 대조하며 틀린 곳만 기억해 두시면 됩니다 (수정은 앱 편집기에서).</p></section>')

for p in photos:
    prow = by_photo[p]
    html.append(f'<section id="{p}"><h2>{p} <span class="legend">({len(prow)}항목)</span></h2><div class="wrap">')
    html.append(f'<img src="photos/{p}.jpg" loading="lazy" alt="{p}">')
    html.append('<table><tr><th>✓</th><th>원말</th><th>약어 타법</th><th>부문</th></tr>')
    for i, r in enumerate(prow):
        rid = f'{p}-{i}'
        cls = ' class="u"' if r['u'] else ''
        ws = r['ws'].replace('약어 · ', '')
        html.append(f'<tr{cls} id="tr-{rid}"><td><input type="checkbox" data-id="{rid}"></td>'
                    f'<td>{r["t"]}</td><td class="h">{r["h"]}</td><td class="ws">{ws}</td></tr>')
    html.append('</table>')
    for s in skip_by_photo.get(p, []):
        html.append(f'<p class="skip">제외됨: {s["t"]} — {s["reason"]}</p>')
    html.append('</div></section>')

html.append('''<script>
const boxes=[...document.querySelectorAll('input[type=checkbox]')];
const KEY='steno-review-check';
let st={};try{st=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
function upd(){const done=boxes.filter(b=>b.checked).length;
document.getElementById('prog').textContent=`검수 ${done} / ${boxes.length}`;}
boxes.forEach(b=>{const id=b.dataset.id;if(st[id]){b.checked=true;document.getElementById('tr-'+id).classList.add('done-row')}
b.addEventListener('change',()=>{st[id]=b.checked;document.getElementById('tr-'+id).classList.toggle('done-row',b.checked);
localStorage.setItem(KEY,JSON.stringify(st));upd()})});
upd();
</script></body></html>''')

os.makedirs(f'{BASE}/review', exist_ok=True)
open(f'{BASE}/review/index.html', 'w').write('\n'.join(html))
print(f'review/index.html 생성 — {len(photos)}장 · {total}행')
