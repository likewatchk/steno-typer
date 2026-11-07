/**
 * 소리자바 기본자리연습 1~10단계 코스 데이터.
 *
 * 출처: 소리자바 기본자리 교재 1~10단계 (p38~111).
 * - book*  : 교재에 실린 기본자리·약어·문장 연습 그대로
 * - extra  : 단계 취지에 맞춰 추가한 낱말 — 그 단계까지 배운 자리만으로 칠 수 있고,
 *            그 단계에서 새로 배운 자리를 최소 하나 쓴다 (basicCourses.test.ts 가 검증)
 *
 * 약어 표기: 교재의 ⇦(자동 붙여쓰기)·*(자동 띄어쓰기)는 화면에 찍히지 않으므로 뺀다.
 */

export interface SjItem {
  t: string
  /** 약어 타법 힌트 (표시 전용) */
  h?: string
}

export interface KeyRef {
  /** L=왼손(초성) R=오른손(종성) T=엄지(중성) */
  side: 'L' | 'R' | 'T'
  key: string
}

export interface BasicStage {
  no: number
  title: string
  /** 이 단계에서 새로 배우는 자리 (교재 표기) */
  focus: string
  /** 키보드 그림에서 강조할 키 */
  keys: KeyRef[]
  /** 운지 요령 (교재 요약) */
  tips: string[]
  /** 교재 기본자리 연습 낱말 */
  bookWords: string[]
  /** 추가 낱말 — 교재 낱말의 3배 이상 (basicExtra.ts) */
  extra: string[]
  /** 약어·부호 연습 — 힌트 포함 */
  abbr: SjItem[]
  /** 교재 문장 연습 */
  sentences: string[]
}

// ---- 자리 허용 집합 (누적) — 추가 낱말 검증 + 키보드 강조의 근거 ----
export const NEW_CHO: Record<number, string> = {
  1: 'ㄱㅈㄷㅅㅇ', // ㅇ 은 자동 (중성만 눌러도 초성 ㅇ)
  3: 'ㅎㄴㄹㅁ',
  5: 'ㅍㅂㅋㅌㅊ',
  7: 'ㄲㄸㅃㅆㅉ',
}
export const NEW_JUNG: Record<number, string> = {
  1: 'ㅗㅏㅜㅡㅓㅣ',
  3: 'ㅢ',
  8: 'ㅐㅔㅘㅝㅟㅚㅙㅞㅖ',
  9: 'ㅑㅕㅛㅠㅒ',
}
export const NEW_JONG: Record<number, string> = {
  2: 'ㄱㄴㄹㅅㅂㅋ',
  4: 'ㅆㅇㅁㄷㅈ',
  6: 'ㄲㅎㅌㅊㅍ',
  10: 'ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ',
}

import { EXTRA_WORDS } from './basicExtra.ts'
import { isScored, type ScoreOpts } from './liveAlign.ts'

const split = (s: string) => s.split(/\s+/).filter(Boolean)
const abbr = (words: string, h: string): SjItem[] => split(words).map((t) => ({ t, h }))

export const BASIC_STAGES: BasicStage[] = [
  {
    no: 1,
    title: '첫 기본자리',
    focus: '초성 ㄱ ㅈ ㄷ ㅅ · 중성 ㅗ ㅏ ㅜ ㅡ ㅓ ㅣ',
    keys: [
      ...[...'ㅅㄷㅈㄱ'].map((key) => ({ side: 'L' as const, key })),
      ...[...'ㅗㅏㅜㅡㅓㅣ'].map((key) => ({ side: 'T' as const, key })),
    ],
    tips: [
      '왼손 소지 ㅅ · 약지 ㄷ · 중지 ㅈ · 검지 ㄱ',
      '왼엄지 ㅗ ㅏ ㅜ · 오른엄지 ㅡ ㅓ ㅣ',
      '초성 ㅇ 은 없다 — 모음만 누르면 ㅇ 이 자동으로 붙는다 (아·어·우)',
      '띄어쓰기는 스페이스바가 아니라 종성 ㄴㄹ 동시',
    ],
    bookWords: split(`아아 어어 오오 이이 우우 으으 가가 거거 고고 그그 기기 구구
      자자 저저 조조 즈즈 지지 주주 다다 더더 도도 드드 디디 두두 사사 서서 소소 시시 스스 수수`),
    extra: EXTRA_WORDS[1],
    abbr: [
      ...abbr('가 자 다 사 고 저 더', '띄어쓰기: 종성 ㄴㄹ'),
      ...abbr('가. 자. 다. 소. 어. 아. 오.', '마침표: 종성 ㅇㅁ'),
      ...abbr('가, 자, 다, 사, 고, 도, 지,', '쉼표: 종성 ㅎㅌㅊ'),
    ],
    sentences: [
      '그자가 다 주고 가다.',
      '거기가 수도지.',
      '드디어 이기다.',
      '가도 가도 도시다.',
      '사서 가지고 가자.',
      '가시가 다시 이어지다.',
      '소시지, 자두, 가지, 우거지',
      '어디서 오고, 어디 가지.',
      '아기가 저기 다가오자',
      '더 가서 사고 가다.',
    ],
  },
  {
    no: 2,
    title: '첫 받침',
    focus: '종성 ㄱ ㄴ ㄹ ㅅ ㅂ · ㉿',
    keys: [
      ...[...'ㄱㄴㄹㅅㅂ'].map((key) => ({ side: 'R' as const, key })),
      { side: 'L', key: '㉿' },
    ],
    tips: [
      '오른손 검지 ㄴ · 중지 ㄹ · 약지 ㅅ · 소지 ㅂ',
      '종성 ㄱ 은 오른손 검지만 왼쪽으로 옮겨 누른다',
      '종성 ㉿(받침 ㅋ·약어 띄어쓰기)은 왼손 검지를 한 칸 옮겨 누른다',
      '누르고 나면 반드시 기본자리로 돌아온다',
    ],
    bookWords: split(`운운 알알 올올 일일 을을 업업 긴긴 존존 준준 단단 산산 선선 신신 갈갈 길길 졸졸 들들 실실
      것것 숫숫 잡잡 줍줍 돕돕 섭섭 시간 간다 수온 온다 주산 산다 전갈 갈다 도달 달다 좁살 살다
      진갑 갑다 조잡 잡다 전답 답다`),
    extra: EXTRA_WORDS[2],
    abbr: [
      ...abbr('시간이 산이 달이 운이 적이', '이: ㉿ + ㅣ'),
      ...abbr('가다. 오다. 시다. 자다. 지다.', '다.: 종성 ㅂ'),
      ...abbr('가고 오고 사고 살고 알고', '고: 종성 ㄱ'),
    ],
    sentences: [
      '작은 옥수수알을 사 온다.',
      '산을 돌아서 걸어간다.',
      '사실 이곳이 서울이다.',
      '설거지 하자고 속삭이다.',
      '수건을 들고 살살 다가간다.',
      '돌고 돌아 가을이 온다.',
      '그 도전이 기적인 것을 안다.',
      '저긴 알고도 돌아온 곳이다.',
    ],
  },
  {
    no: 3,
    title: '아랫줄 초성',
    focus: '초성 ㅎ ㄴ ㄹ ㅁ · 중성 ㅢ',
    keys: [...[...'ㅁㄹㄴㅎㅢ'].map((key) => ({ side: 'L' as const, key }))],
    tips: [
      '왼손 소지 ㅁ · 약지 ㄹ · 중지 ㄴ · 검지 ㅎ (아랫줄의 가장 가까운 부분)',
      '중성 ㅢ 는 왼손 검지만 오른쪽으로 옮겨 누른다',
      '‘희’는 왼손 검지 하나로 ㅎ 과 ㅢ 사이를 누른다',
      '손가락 끝마디를 글쇠와 90° 가까이 세운다',
    ],
    bookWords: split(`하하 허허 호호 흐흐 히히 후후 나나 너너 노노 느느 니니 누누 라라 러러 로로 르르 리리 루루
      마마 머머 모모 므므 미미 무무 간다 한다 잔다 난다 단다 란다 산다 만다 갈지 할지 살고 말고
      각자 학자 작사 낙서 산고 만두`),
    extra: EXTRA_WORDS[3],
    abbr: [
      ...abbr('그가 오기가 하기가 우리가 자기가', '가: 종성 ㄱㄲ 사이'),
      ...abbr('가지 하지 할지 말지 갈지', '지: 종성 ㅈ'),
      ...abbr('나의 너의 우리의 나라의 그의', '의: ㉿ + ㅢ'),
    ],
    sentences: [
      '누군가 너의 말을 한다.',
      '기사의 눈길을 모은다.',
      '그들의 말을 막지 말고 들으시오.',
      '덧니가 하나 더 난다고 말한다.',
      '날마다 만들어 간다고 전하자.',
      '아기의 손이 아주 작다.',
      '멀리서 오신 할머니를 눕힌다.',
      '한국 만두의 맛이 난다고 합니다.',
      '마늘을 먹을지 말지 고민하지 말고',
      '하늘의 달로 날아가 마주하다.',
    ],
  },
  {
    no: 4,
    title: '아랫줄 받침',
    focus: '종성 ㅆ ㅇ ㅁ ㄷ ㅈ',
    keys: [...[...'ㅆㅇㅁㄷㅈ'].map((key) => ({ side: 'R' as const, key }))],
    tips: [
      '오른손 검지 ㅇ · 중지 ㅁ · 약지 ㄷ · 소지 ㅈ',
      '‘ㅆ’은 손 전체가 아니라 오른손 검지만 살짝 옮겨 누른다',
      '로서(자격·신분) / 로써(도구·수단)를 구별한다',
    ],
    bookWords: split(`았았 었었 있있 앙앙 암암 엄엄 음음 임임 언언 엇엇 잊잊 항항 홍홍 낭낭 능능 랑랑 렁렁 망망
      함함 험험 남남 넘넘 람람 림림 몸몸 곰곰 김김 심심 감감 났났 갔갔 섰섰 렀렀 잤잤 낮잠 믿음
      짖짖 샀샀 덤덤 공갈 공감 농담 궁중 중앙 당장 항상 할증 증설 설문 문답 답장 장롱`),
    extra: EXTRA_WORDS[4],
    abbr: [
      ...abbr('가는 하는 자는 우는 나는', '는: 종성 ㄴ'),
      ...abbr('강은 산은 달은 상은 좋은', '은: 종성 ㅇㄴ'),
      ...abbr('나로서 선수로서 의사로서 속기사로서', '로서: 종성 ㄹㅅ'),
      ...abbr('이로써 그로써 사물로써 기술로써', '로써: 종성 ㄹㅆ'),
    ],
    sentences: [
      '그는 낭만적인 사람이었다.',
      '남은 곧 자신의 거울이다.',
      '한마디로 그는 모두의 희망이다.',
      '농구를 하러 가는 길입니다.',
      '지는 것이 이기는 거라는 속담도 몰랐다.',
      '독서는 성공의 도구로써 적절하다.',
      '나는 엄마로서 무엇을 할지 상상한다.',
      '직접 만든 기술로써 가지고 있다.',
      '자랑스러운 국가로서 자리잡았다.',
    ],
  },
  {
    no: 5,
    title: '윗줄 초성',
    focus: '초성 ㅍ ㅂ ㅋ ㅌ ㅊ',
    keys: [...[...'ㅊㅌㅋㅂㅍ'].map((key) => ({ side: 'L' as const, key }))],
    tips: [
      '왼손 소지 ㅊ · 약지 ㅌ · 중지 ㅋ · 검지 ㅂ, ㅍ 은 검지를 오른쪽으로',
      '윗글쇠의 가장 가까운 부분을 누르고, 엄지는 위로 따라가지 않게 구부린다',
      '을·를, 으로·로 는 앞 글자 받침에 따라 자동 인식된다',
    ],
    bookWords: split(`바바 버버 보보 비비 부부 카카 키키 코코 크크 타타 터터 토토 트트 티티 차차 처처 초초
      치치 추추 피피 푸푸 바지 토지 코일 포일 통장 총장 창설 선축 착출 출발 통풍 풍토
      파리 리본 틀니 니트 보통 고통 사탕 바탕 쿵후 후추 충분 분칠 통일 일반 림프 프로 펑크 크림`),
    extra: EXTRA_WORDS[5],
    abbr: [
      ...abbr('아기를 차를 누를 공을 산을', '를·을: 종성 ㄹ'),
      ...abbr('하므로 되므로 강으로 산으로 손으로', '므로·으로: 종성 ㅇㄹ'),
      ...abbr('기차로 속도로 서로 스스로 버스로', '로: 초성 ㄹ'),
      ...abbr('방석을 갔었을 바로바로 정통으로 홀로', '을·로·으로'),
    ],
    sentences: [
      '파란 코트를 걸치고 거리로 걸어간다.',
      '반지를 선물하기로 마음먹다.',
      '비가 오므로 우산을 들고 찾는다.',
      '올바른 헌법을 바탕으로 판단하라.',
      '낮은 움직임으로 발자국을 찾았다.',
      '강으로 산으로 멀리 놀러가자.',
      '저기로 총총걸음으로 걷는 모습을 보았어.',
      '빈칸을 음악으로 가득 차고도 남았습니다.',
    ],
  },
  {
    no: 6,
    title: '윗줄 받침',
    focus: '종성 ㄲ ㅎ ㅌ ㅊ ㅍ',
    keys: [...[...'ㄲㅎㅌㅊㅍ'].map((key) => ({ side: 'R' as const, key }))],
    tips: [
      '오른손 검지 ㅎ · 중지 ㅌ · 약지 ㅊ · 소지 ㅍ',
      '‘ㄲ’ 받침은 오른손 검지만 왼쪽 위로 옮겨 끝부분을 가볍게 누른다',
      '완성된 글자가 아니면 입력되지 않는다 — ㄲ 만 누르면 안 찍힌다',
      '입니다. · 입니까? 약어는 속도를 크게 올려 준다',
    ],
    bookWords: split(`밖밖 낚낚 닦닦 묶묶 볶볶 좋좋 앞앞 엎엎 섞섞 렇렇 놓놓 랗랗 같같 짙짙 밭밭 겉겉 낱낱
      밑밑 붙붙 낯낯 몇몇 빛빛 덮덮 갚갚 덫덫 덧덧 낚시 콩팥 맡기 넣지`),
    extra: EXTRA_WORDS[6],
    abbr: [
      ...abbr('나도 너도 그것도 우리도 국가도 의사도', '도: 종성 ㄷ'),
      ...abbr('것입니다. 바입니다. 사고입니다. 국민입니다.', '입니다.: ㅣ + 종성 ㅂㅈ'),
      ...abbr('것입니까? 보입니까? 당선입니까? 밖입니까?', '입니까?: ㅣ + 종성 ㅂㅍ'),
      ...abbr('착한 복잡한 밋밋한 우울한 사랑한', '한: 종성 ㅎㄴ'),
      ...abbr('말할 답답할 초조할 창창할 각오할', '할: 종성 ㅎㄹ'),
    ],
    sentences: [
      '비슷한 점수를 높이는 공부법입니다.',
      '사랑할 수 있는 감정도 드러났다.',
      '안전한 도시를 맡았던 방법입니다.',
      '급한 나머지 키친타올로 닦은 것입니까?',
      '높은 수준의 다양한 서비스를 섞어도',
      '오늘도 민속놀이를 하는 날입니까?',
      '복잡할 것입니다. 안 할 것입니까?',
    ],
  },
  {
    no: 7,
    title: '쌍자음',
    focus: '초성 ㄲ ㄸ ㅃ ㅆ ㅉ',
    keys: [...[...'ㄱㄷㅂㅅㅈㅎㄹㄴㅁ'].map((key) => ({ side: 'L' as const, key }))],
    tips: [
      '쌍자음 = 왼쪽 초성 자음 + 바로 아래 키를 함께',
      'ㄲ=ㄱ+ㅎ · ㄸ=ㄷ+ㄹ · ㅉ=ㅈ+ㄴ · ㅆ=ㅅ+ㅁ · ㅃ=ㅂ+ㄱ',
      '‘ㄲ’은 왼손 검지로 ㄱ 과 ㅎ 의 중간을 가볍게',
      '손가락 끝 첫마디만 써서 90°를 유지한다',
    ],
    bookWords: split(`까까 꺼꺼 꼬꼬 끄끄 끼끼 꾸꾸 따따 떠떠 또또 뜨뜨 띠띠 뚜뚜 빠빠 뻐뻐 쁘쁘 뿌뿌 싸싸
      씨씨 써써 쓰쓰 짜짜 쪼쪼 찌찌 꼬치 꽁치 짜장 짬뽕 짱구 꾸중 식빵 빵집 사또 또랑 바삐 삐침
      반짝 짝꿍 글씨 씨앗 이빨 빨리 진짜 껑충 쌍쌍 떵떵 깔창 빨판`),
    extra: EXTRA_WORDS[7],
    abbr: [
      ...abbr('가서 어서 사서 자서 차서', '서: 종성 ㅅ'),
      ...abbr('벌써 힘써', '써: 종성 ㅆ'),
      ...abbr('함으로써 그럼으로써 콩으로써 살찜으로써', '으로써: 종성 ㅇㄹㅆ'),
      ...abbr('가정으로서 사람으로서 자식으로서 시민으로서', '으로서: 종성 ㅇㄹㅅ'),
    ],
    sentences: [
      '똑같이 따라서 움직인다.',
      '소금으로써 짠맛, 쑥으로써 쓴맛',
      '씹고 뜯고 섞어서 먹는다.',
      '이곳의 팀장으로서 자부심이 있었다.',
      '깡마르고 재빠른 움직임으로써 붙잡기',
      '일을 함으로써 벌써 보람을 느낀다.',
      '시민으로서 의식을 지킬 수 있다.',
      '힘써 땀 흘린 만큼 성공을 이룹니다.',
    ],
  },
  {
    no: 8,
    title: '이중모음',
    focus: 'ㅐ ㅔ ㅘ ㅝ ㅟ ㅚ ㅙ ㅞ ㅖ',
    keys: [...[...'ㅗㅏㅜㅡㅓㅣ'].map((key) => ({ side: 'T' as const, key }))],
    tips: [
      'ㅐ=왼엄 ㅏ + 오른엄 ㅣ · ㅔ=오른엄 ㅓㅣ 동시 · ㅘ=왼엄 ㅗㅏ 동시',
      'ㅝ=ㅜ+ㅓ · ㅟ=ㅜ+ㅣ · ㅚ=ㅗ+ㅣ · ㅙ=ㅗㅏ+ㅣ · ㅞ=ㅜ+ㅓㅣ · ㅖ=ㅏ+ㅓㅣ',
      '엄지를 안으로 구부리지 말고 두 키 사이를 가볍게',
    ],
    bookWords: split(`개개 게게 과과 네네 되되 래래 매매 메메 뭐뭐 배배 베베 새새 세세 애애 에에 워워 위위 재재
      제제 체체 태태 패패 회회 화화 예예 례례 계계 폐폐 인생 생활 존재 재정 태백 백합
      승패 패자 소재 재산 논쟁 쟁기 어제 제일 공책 책상 불행 행복 예제 실례 합계`),
    extra: EXTRA_WORDS[8],
    abbr: [
      ...abbr('운과 산과 너와 나와 우리와', '와·과: ㉿ + ㅗㅏ'),
      ...abbr('산에 강에 들에 일에 하늘에', '에: ㉿ + ㅓㅣ'),
    ],
    sentences: [
      '말과 행동에 워낙 꼼꼼한 예의범절',
      '산과 바다 위에 노을이 훼방을 놓는다.',
      '우리와 나뉘어 너희는 외국에 있다.',
      '일과 휴식에 확실한 구분을 원한다.',
      '마음에 주름살이 깊숙하게 생긴다.',
      '신과 악마가 승패를 놓고 위험한 싸움',
      '외로움에 왠지 하늘과 휘파람이 함께',
      '특혜를 받음과 동시에 위험한 궤적을 피해',
    ],
  },
  {
    no: 9,
    title: '중모음',
    focus: 'ㅑ ㅕ ㅛ ㅠ ㅒ ㅖ',
    keys: [...[...'ㅗㅏㅜㅡㅓ'].map((key) => ({ side: 'T' as const, key }))],
    tips: [
      'ㅑ ㅕ ㅛ ㅠ = 단모음 ㅏ ㅓ ㅗ ㅜ + ㅡ 동시',
      'ㅠ 는 왼엄 ㅜ + 오른엄 ㅡ — 엄지를 과하게 펼치지 않는다',
      'ㅒ = ㅏ + ㅓ · ㅖ = ㅏ + ㅓ + ㅣ',
    ],
    bookWords: split(`갸갸 겨겨 교교 규규 계계 냐냐 녀녀 려려 효효 휴휴 벼벼 셔셔 여여 요요 유유 얘얘 예예 져져
      쳐쳐 켜켜 혀혀 혜혜 화병 병원 삼풍 풍년 태평 평안 주변 변모 공예 예절 공경 경찰
      실현 현실 봉변 여야 야구 얘기 걔네 쟤들 섀도`),
    extra: EXTRA_WORDS[9],
    abbr: [
      ...abbr('가며 사며 오며 하며', '며: 종성 ㅁ'),
      ...abbr('이기면 자라면 우기면 참으면', '면: 종성 ㅁㄴ'),
      ...abbr('가면서 하면서 주면서 그러면서', '면서: 종성 ㅁㅅ'),
    ],
    sentences: [
      '교묘한 변화를 주면서 세상을 쥐락펴락',
      '가장 영리하며 때론 현저히 미련하다.',
      '야인으로 살면서 인생의 율법을 배운다.',
      '당연히 안 보면 명확히 멀어진다.',
      '지갑이 가벼우면 마음은 매우 무거워진다.',
      '미래는 요염하면서도 뾰족한 묘수를 야기한다.',
      '열광의 도가니에 뜨겁게 빠져들며 춤췄다.',
      '길을 이야기하며 이동하면 빠르게 도착한다.',
      '제게 운전은 직업이면서 취미이며 특기입니다.',
    ],
  },
  {
    no: 10,
    title: '겹받침',
    focus: 'ㄳ ㄵ ㄶ ㄺ ㄻ ㄼ ㅀ ㄾ ㄿ ㅄ',
    keys: [...[...'ㄱㄴㄹㅅㅂㅁㅎㅌㅍㅈ'].map((key) => ({ side: 'R' as const, key }))],
    tips: [
      '겹받침은 종성 두 개를 동시에 누른다',
      '완벽할 필요는 없다 — 어색하지 않게 입력할 정도로',
      '숫자: 1~5 = 초성 ㅊㅌㅋㅂㅍ, 6~0 = 종성 ㄲㅎㅌㅊㅍ',
      '물음표 ?=초성 ㅎㄴㄹ · 느낌표 !=초성 ㄱㅈㄷ · %=초성 ㅂㅋㅌ · -=종성 ㅍㅂ',
    ],
    bookWords: split(`몫몫 삯삯 얹얹 많많 잖잖 않않 늙늙 맑맑 밝밝 읽읽 넓넓 싫싫 닭닭 핥핥 읊읊 값값 삶삶 앉앉
      몫은 앉다 얹어 넓다 많다 않지 늙다 맑다 밝다 읽다 싫다 않다 몫이 앉아 얹지 넓고 많아 늙고
      맑아 밝아 읽어 싫지 넓어 핥다 읊다 값은 삶의 삯은 잃다`),
    extra: EXTRA_WORDS[10],
    abbr: [
      ...abbr('내게 가게 오게 놀라게 모르게', '게: 종성 ㄱㅆ'),
      ...abbr('샀습니다. 있습니다. 했습니다. 갔습니다. 없었습니다.', '습니다.: 종성 ㅅㄷ'),
      ...abbr('없습니까? 맞습니까? 덥습니까? 알겠습니까? 가잖습니까?', '습니까?: 종성 ㅅㅊ'),
      ...abbr('그렇다! 미인이다! 기억해! 운명이다!', '!: 초성 ㄱㅈㄷ'),
      ...abbr('가-나 서울-부산', '-: 종성 ㅍㅂ'),
      ...abbr('25% 0.73% 90% 100%-40%', '%: 초성 ㅂㅋㅌ · 숫자 1~5 초성 / 6~0 종성'),
    ],
    sentences: [
      '많은 사람에게 약속하지 않았습니까?',
      '죄수번호 246-01 몫을 배당했습니다.',
      '삶이 그대를 속일지라도 포기란 없습니다.',
      '물을 끓게 한 지금이 중요한 시기라고 읽었습니다.',
      '넓은 평원을 마주하게 되었습니까?',
      '정말 닮았는지 눈이 뚫어져라 쳐다봤나요?',
      '괜찮다며 모두 제자리에 앉았습니다.',
      '정교한 기술로 만듦으로써 30% 굵어졌다.',
      '잃어버린 것으로 밝혀졌는지 훑어봅시다!',
      // 기본자리 학습을 마치며 — 복습 문장
      '거지는 거지를 시기하고, 시인은 시인을 시기한다.',
      '굳은 결심은 가장 유용한 지식이다.',
      '너의 적을 용서하라, 너도 은혜 받으리.',
      '남자는 마음으로 늙고 여자는 얼굴로 늙는다.',
      '돈 빌려 주면 돈도 잃고 친구도 잃는다.',
      '두렵다고 피하면 두려움의 포로가 된다.',
      '사랑은 오두막집도 황금의 궁전으로 만든다.',
      '조상의 영광은 자손의 등불이다.',
      '이 세상에 악이 없다면 선도 없을 것이다.',
    ],
  },
]

export type CoursePart = 'words' | 'abbr' | 'sentences' | 'mix'

export const PART_LABEL: Record<CoursePart, string> = {
  words: '자리 낱말',
  abbr: '약어',
  sentences: '문장',
  mix: '전부 섞기',
}

/** 한 단계의 연습 항목 — part 별 */
export function stageItems(stage: BasicStage, part: CoursePart): SjItem[] {
  const words = [...stage.bookWords, ...stage.extra].map((t) => ({ t }))
  const sents = stage.sentences.map((t) => ({ t }))
  switch (part) {
    case 'words':
      return words
    case 'abbr':
      return stage.abbr
    case 'sentences':
      return sents
    case 'mix':
      return [...words, ...stage.abbr, ...sents]
  }
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface BuildOptions {
  stage: number
  part: CoursePart
  /** 누적: 앞 단계 항목도 섞어 넣는다 */
  cumulative: boolean
  shuffle: boolean
  /** 목표 분량 (채점 단위 수) — 모자라면 다시 섞어 이어 붙인다. 'all' = 범위의 항목을 한 번씩 전부 */
  targetSyllables: number | 'all'
  rand?: () => number
}

/** 분량 하한 — 아주 낮은 타수·짧은 시간에도 연습이 성립하게 */
export const MIN_SYLLABLES = 30

/** 약어(부호) 연습은 마침표·쉼표 자체가 연습 대상 — 부호도 채점·분량에 넣는다 */
export function scoreOptsFor(part: CoursePart): ScoreOpts {
  return { punct: part === 'abbr' }
}

/** 채점 단위 수 (채점과 같은 셈법 — 공백 제외, 부호는 옵션) */
export function syllableCount(text: string, opts: ScoreOpts = {}): number {
  let n = 0
  for (const ch of text.normalize('NFC')) if (isScored(ch, opts)) n++
  return n
}

/** 세션 목표 분량 — 타수 × 분, 하한 적용 */
export function targetSyllablesFor(tasu: number, minutes: Minutes): number | 'all' {
  return minutes === 'all' ? 'all' : Math.max(MIN_SYLLABLES, tasu * minutes)
}

/** 분량 선택지 — 'all' = 범위 전부 한 번씩 (기본), 숫자 = 목표 타수로 그 분량(분) */
export type Minutes = 'all' | 1 | 2 | 3 | 5

/** 항목 수 안전 상한 — 분량 목표가 비정상이어도 무한히 늘지 않게 */
const MAX_ITEMS = 20_000

/**
 * 연습 본문 항목 열 만들기.
 * 누적이 켜지면 매 바퀴마다 현재 단계 항목 전부 + 앞 단계에서 같은 수만큼 새로 표본 —
 * 현재 단계 비중을 절반 이상 유지하면서, 긴 세션에서는 앞 단계 항목이 고루 나온다.
 */
export function buildSessionItems(o: BuildOptions): SjItem[] {
  const rand = o.rand ?? Math.random
  const cur = BASIC_STAGES.find((s) => s.no === o.stage)
  if (!cur) return []
  const own = stageItems(cur, o.part)
  if (own.length === 0) return []
  const prev =
    o.cumulative && o.stage > 1 ? BASIC_STAGES.filter((s) => s.no < o.stage).flatMap((s) => stageItems(s, o.part)) : []
  const opts = scoreOptsFor(o.part)
  // 전부 = 한 바퀴 (현재 단계 전부 + 누적이면 앞 단계에서 같은 수만큼)
  if (o.targetSyllables === 'all') {
    const pool = prev.length > 0 ? [...own, ...shuffle(prev, rand).slice(0, own.length)] : own
    return o.shuffle ? shuffle(pool, rand) : pool.slice()
  }
  const target = Number.isNaN(o.targetSyllables) ? 1 : Math.max(1, o.targetSyllables) // Infinity 는 MAX_ITEMS 가 막는다
  const out: SjItem[] = []
  let total = 0
  // 분량을 채울 때까지 (섞기면 매 바퀴 새로 섞음, 누적이면 앞 단계도 매 바퀴 새로 뽑음)
  while (total < target && out.length < MAX_ITEMS) {
    let pool = own
    if (prev.length > 0) pool = [...own, ...shuffle(prev, rand).slice(0, own.length)]
    const seq = o.shuffle ? shuffle(pool, rand) : pool
    for (const it of seq) {
      out.push(it)
      total += syllableCount(it.t, opts)
      if (total >= target || out.length >= MAX_ITEMS) break
    }
  }
  return out
}
