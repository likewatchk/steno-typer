#!/usr/bin/env python3
"""
전사 조각(transcribe/*.json) → 부문별 단어장 JSON 조립.

규칙 (사용자 확정):
- 섹션 = 단어장. 이름은 '약어 · <부문>' 접두.
- 활용약자류 섹션에 끼어든 무관 낱말은 '약어 · 낱말 모음'으로 재분류.
- 제목 없는 페이지는 낱말 모음으로.
- 기본약어의 단독 조사·어미는 그대로 두되 '약어 · 기본 (캐리어)' 별도 생성.
- '약어 · 전체 통합' = 전 부문 중복 제거 합본 (캐리어판 제외).
"""
import glob
import json
import os

SRC = os.path.join(os.path.dirname(__file__), 'transcribe')
OUT = os.path.join(os.path.dirname(__file__), 'wordsets')
os.makedirs(OUT, exist_ok=True)

# 섹션 제목 → (단어장 이름, 잔류 판정용 어간들. None=전부 잔류)
SECTION_MAP = {
    '기본약어': ('약어 · 기본', None),
    '하다 동사의 약어': ('약어 · 하다', None),
    '종결형 어미': ('약어 · 종결형 어미', None),
    '대명사 활용 (이것, 저것, 우리)': ('약어 · 대명사', None),
    '접속사의 활용 (그래, 그리, 그러)': ('약어 · 접속사', None),
    '기타 수사·숫자': ('약어 · 숫자·수사', None),
    '활용조사': ('약어 · 활용조사', None),
    '활용형용사 (운·울·움·스러움)': ('약어 · 형용사 (운·울·움·스럽·새롭)', None),
    'ㄴ 받침활용': ('약어 · 받침활용 (ㄴ·ㄹ·ㅂ)', None),
    'ㄹ 받침활용': ('약어 · 받침활용 (ㄴ·ㄹ·ㅂ)', None),
    'ㅂ 받침활용': ('약어 · 받침활용 (ㄴ·ㄹ·ㅂ)', None),
    '명사 약어 정리': ('약어 · 명사', None),
    '이 활용약자': ('약어 · 이/에', None),
    '에 활용약자': ('약어 · 이/에', None),
    '기타 약어 정리': ('약어 · 국가·기관', None),
    '활용약자 기': ('약어 · 기', ['기']),
    '활용약자 해야': ('약어 · 해야', ['해야']),
    '활용약자 것/것에/것이': ('약어 · 것', ['것']),
    '활용약자 것 같': ('약어 · 것 같', ['것 같', '것같']),
    '활용약자 같': ('약어 · 같', ['같']),
    '활용약자 것과/것과 같': ('약어 · 것과', ['것과']),
    '활용약자 와 같': ('약어 · 와 같', ['와 같', '밖에']),
    '활용약자 이와/이와 같': ('약어 · 이와', ['이와']),
    '활용약자 그와/그와 같': ('약어 · 그와', ['그와']),
    '활용약자 들': ('약어 · 들', ['들']),
    '활용약자 들과': ('약어 · 들과', ['들과', '아울러', '기를']),
    '활용약자 들어/들에/들이': ('약어 · 들어/들에/들이', ['들어', '들에', '들이', '들인', '들일', '들입']),
    '활용약자 따르': ('약어 · 따르', ['따르', '따른', '따를', '따릅']),
    '활용약자 에 따르': ('약어 · 에 따르', ['에 따르', '에 따른', '에 따를', '에 따름', '에 따릅']),
    '활용약자 다르': ('약어 · 다르', ['다르', '다른', '다를', '다름', '다릅']),
    '활용약자 다른/다음': ('약어 · 다른/다음', ['다르', '다른', '다를', '다름', '다릅', '다음']),
    '활용약자 그래': ('약어 · 그래', ['그래', '그랬']),
    '활용약자 그러': ('약어 · 그러', ['그러', '그런', '그럼', '그럴', '그렇']),
    '활용약자 그리': ('약어 · 그리', ['그리', '그린', '그릴', '그림', '그립']),
    '활용약자 이러/이래': ('약어 · 이러/이래', ['이러', '이런', '이럴', '이럼', '이럽', '이렇', '이래', '이랬']),
    '활용약자 이루': ('약어 · 이루', ['이루', '이룬', '이룰', '이룩', '이룸', '이룹']),
    '활용약자 이라': ('약어 · 이라', ['이라', '이란', '이랄', '이랍']),
    '활용약자 만/만나': ('약어 · 만/만나', ['만']),
    '활용약자 많': ('약어 · 많/적', ['많']),
    '활용약자 적': ('약어 · 많/적', ['적']),
    '활용약자 면': ('약어 · 면', ['면']),
    '활용약자 안에/속에': ('약어 · 안에/속에', ['안에', '안을', '속에', '속으로']),
    '활용약자 시키/지키': ('약어 · 시키/지키', ['시키', '시킨', '시킬', '시킴', '시켜', '시켰', '지키', '지킨', '지킬', '지킴', '지켜', '지켰']),
    '활용약자 어떠/어려': ('약어 · 어떠/어려', ['어떠', '어떤', '어떨', '어떻', '어때', '어땠', '어려', '어렵']),
    '활용약자 아니': ('약어 · 아니', ['아니', '아닌', '아닐', '아님', '아닙']),
    '활용약자 안되': ('약어 · 안되', ['안되', '안된', '안될', '안됨', '안됩']),
    '활용약자 않': ('약어 · 않', ['않', '으며']),
    '활용약자 없': ('약어 · 없', ['없']),
    '활용약자 못하': ('약어 · 못하', ['못하', '못한', '못할', '못합']),
    '활용약자 했': ('약어 · 했', ['했']),
    '활용약자 았': ('약어 · 았', ['았']),
    '활용약자 었': ('약어 · 었', ['었', '았던', '였던']),
    '활용약자 였': ('약어 · 였', ['였']),
    '활용약자 있': ('약어 · 있', ['있', '없던']),
    '활용약자 겠': ('약어 · 겠', ['겠']),
    '활용약자 해 주': ('약어 · 해 주', ['해 주', '해주', '해 준', '해 줄', '해 줍', '해줍', '해줌', '해야']),
    '활용약자 을 위해/을 통해/기 위해': ('약어 · 을 위해/통해', ['위해', '위한', '위하', '위할', '통해', '통한', '통하', '통할']),
    '활용약자 에 관해/에 대해/에 의해/에 비해': ('약어 · 에 관해/대해/의해/비해', ['관해', '관한', '관하', '대해', '대하', '대한', '의해', '의하', '의한', '비해', '비하', '비한', '비할']),
    '기타약어모음': ('약어 · 낱말 모음', None),
    '기타 약어 모음': ('약어 · 낱말 모음', None),
}

MISC = '약어 · 낱말 모음'

wordsets = {}   # name -> list of items (dict t,h,u)
order = []      # wordset insertion order
uncertain = 0
skipped_all = []
review_rows = []  # 검수 리포트용: 사진별 노트 순서 그대로

def put(name, item):
    if name not in wordsets:
        wordsets[name] = []
        order.append(name)
    wordsets[name].append(item)
    review_rows.append({
        'photo': item['_photo'], 't': item['t'], 'h': item['h'],
        'u': item.get('u', 0), 'ws': name,
    })

for path in sorted(glob.glob(f'{SRC}/*.json')):
    doc = json.load(open(path))
    for sk in doc.get('skipped', []):
        skipped_all.append({'photo': doc['photo'], **sk})
    for sec in doc['sections']:
        title = sec['title']
        if title is None:
            name, stems = MISC, None
        elif title in SECTION_MAP:
            name, stems = SECTION_MAP[title]
        else:
            raise SystemExit(f"매핑 없는 섹션: {title} ({doc['photo']})")
        for e in sec['entries']:
            item = {'t': e['t'], 'h': e['h']}
            if e.get('u'):
                item['u'] = 1
                uncertain += 1
            item['_photo'] = doc['photo']
            # 어간 불일치 → 낱말 모음으로 재분류 (사용자 확정 규칙)
            if stems is not None and not any(s in e['t'] for s in stems):
                put(MISC, item)
            else:
                put(name, item)

# ---- 세트 내 중복 정리: 같은 원말은 하나로, 타법이 다르면 ' / ' 병기 ----
for name in order:
    by_t = {}
    seq = []
    for it in wordsets[name]:
        it = dict(it)
        it['t'] = it['t'].replace(' (2)', '')
        if it['t'] in by_t:
            prev = by_t[it['t']]
            if it['h'] and it['h'] not in prev['h']:
                prev['h'] = f"{prev['h']} / {it['h']}"
            if it.get('u'):
                prev['u'] = 1
        else:
            by_t[it['t']] = it
            seq.append(it)
    wordsets[name] = seq

# ---- 낱말 모음 분할 (연습 단위로 3분할) ----
misc = wordsets.pop(MISC)
order = [n for n in order if n != MISC]
third = (len(misc) + 2) // 3
for i in range(3):
    part = misc[i * third:(i + 1) * third]
    if part:
        nm = f'{MISC} {"①②③"[i]}'
        wordsets[nm] = part
        order.append(nm)

# ---- 캐리어판 (단독 조사·어미 → 실제 어절) ----
CARRIER = [
    ('책을', '을'), ('나를', '를'), ('밥은', '은'), ('나는', '는'), ('오늘의', '의'),
    ('조용히', '히'), ('가며', '며'), ('나도', '도'), ('집에서', '서'), ('갔지', '지'),
    ('가고', '고'), ('너와', '와'), ('밥과', '과'), ('집에', '에'), ('길이', '이'),
    ('고마워', '워'), ('내가', '가'), ('쉽게', '게'), ('간다', '다'), ('해라', '라'),
    ('먹어', '어'), ('좋아요', '요'), ('가야', '야'), ('그렇죠', '죠'), ('학교로', '로'),
    ('가나', '나'), ('크니', '니'), ('크니까', '니까'), ('가면', '면'), ('가면서', '면서'),
    ('가도록', '도록'), ('크지만', '지만'), ('지금부터', '부터'), ('끝까지', '까지'),
    ('가자', '자'), ('하기', '기'), ('영원토록', '토록'),
]
# 원본 코드 찾기: 기본·활용조사에서 해당 조사 코드 추출
particle_code = {}
for src_name in ('약어 · 기본', '약어 · 활용조사'):
    for it in wordsets.get(src_name, []):
        key = it['t'].replace(' ', '')
        particle_code.setdefault(key, it['h'])
        for alt in it['t'].split(','):  # "을, 를" 같은 병기
            particle_code.setdefault(alt.strip(), it['h'])
carrier_items = []
for text, particle in CARRIER:
    code = particle_code.get(particle)
    if code:
        carrier_items.append({'t': text, 'h': f'{code} ← {particle}', '_photo': 'carrier'})
wordsets['약어 · 기본 (캐리어 연습)'] = carrier_items
order.append('약어 · 기본 (캐리어 연습)')

# ---- 전체 통합 (캐리어 제외, t 중복 제거) ----
seen = set()
combined = []
for name in order:
    if '캐리어' in name:
        continue
    for it in wordsets[name]:
        if it['t'] in seen:
            continue
        seen.add(it['t'])
        combined.append(it)
wordsets['약어 · 전체 통합'] = combined
order.append('약어 · 전체 통합')

# ---- 저장 + 요약 ----
manifest = []
for idx, name in enumerate(order, 1):
    items = [
        ({'t': it['t'], 'h': it['h']} if not it.get('u') else {'t': it['t'], 'h': it['h'], 'u': 1})
        for it in wordsets[name]
    ]
    fn = f'{idx:02d}-{name.replace("약어 · ", "").replace("/", "·").replace(" ", "")}.json'
    json.dump({'name': name, 'items': items}, open(f'{OUT}/{fn}', 'w'), ensure_ascii=False, indent=1)
    manifest.append((fn, name, len(items), sum(1 for i in items if i.get('u'))))

json.dump(skipped_all, open(f'{OUT}/_skipped.json', 'w'), ensure_ascii=False, indent=1)
json.dump(review_rows, open(f'{OUT}/_review.json', 'w'), ensure_ascii=False)

print(f'{"파일":44s} {"항목":>4s} {"⚠️":>3s}')
for fn, name, n, u in manifest:
    print(f'{fn:44s} {n:4d} {u:3d}')
print(f'\n단어장 {len(manifest)}개 · 총 {sum(m[2] for m in manifest)}항목(통합 포함) · 불확실 ⚠️ {uncertain}건 · 제외 {len(skipped_all)}건')
