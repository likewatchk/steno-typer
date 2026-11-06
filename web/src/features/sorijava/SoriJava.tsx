/**
 * 소리자바 연습 가이드 — 자리 잡기 단계.
 * 단계별 연습은 아직 준비 중이며, 지금 쓸 수 있는 도구(자유연습·예전 깜빡이)로 연결한다.
 */
import { useApp } from '../../app/store.ts'
import s from './SoriJava.module.css'

interface Step {
  no: number
  title: string
  desc: string
}

const STEPS: Step[] = [
  { no: 1, title: '자리 익히기', desc: '초성·중성·종성 영역의 키 위치를 손에 익힙니다.' },
  { no: 2, title: '음절 조합', desc: '세 영역을 한 번에 눌러 한 글자를 만드는 감각을 잡습니다.' },
  { no: 3, title: '받침·겹받침', desc: '종성 조합과 겹받침을 정확하게 누르는 연습입니다.' },
  { no: 4, title: '낱말·어절', desc: '글자를 이어 낱말과 어절로, 띄어쓰기까지 함께 익힙니다.' },
  { no: 5, title: '약어', desc: '자주 쓰는 말을 한 번에 치는 소리자바 약어를 익힙니다.' },
  { no: 6, title: '실전 받아치기', desc: '뉴스·연설 속도로 들리는 대로 받아치는 실전 연습입니다.' },
]

/** 세 영역 동시 입력 개념도: ㄱ + ㅏ + ㄴ → 간 */
function ChordDiagram() {
  return (
    <figure className={s.chord} aria-label="세 영역을 동시에 눌러 한 음절을 만든다">
      <div className={s.zones}>
        <div className={s.zone}>
          <span className={s.zoneHand}>왼손</span>
          <span className={s.zoneName}>초성</span>
          <span className={s.zoneKey}>ㄱ</span>
        </div>
        <span className={s.plus}>+</span>
        <div className={`${s.zone} ${s.zoneMid}`}>
          <span className={s.zoneHand}>엄지</span>
          <span className={s.zoneName}>중성</span>
          <span className={s.zoneKey}>ㅏ</span>
        </div>
        <span className={s.plus}>+</span>
        <div className={s.zone}>
          <span className={s.zoneHand}>오른손</span>
          <span className={s.zoneName}>종성</span>
          <span className={s.zoneKey}>ㄴ</span>
        </div>
        <span className={s.plus}>=</span>
        <div className={s.result}>간</div>
      </div>
      <figcaption className={s.caption}>세 영역을 동시에 눌러 한 음절을 한 번에 입력합니다</figcaption>
    </figure>
  )
}

export default function SoriJava() {
  const { go, setTrack } = useApp.getState()

  return (
    <div className={s.page}>
      <section className={s.hero}>
        <span className={s.eyebrow}>소리자바 속기</span>
        <h1 className={s.title}>소리자바 연습 가이드</h1>
        <p className={s.lead}>
          초성·중성·종성을 한 번에 누르는 소리자바 방식에 맞춰, 자리 익히기부터 실전 받아치기까지
          단계별로 연습합니다.
        </p>
        <span className={s.badge}>준비 중 — 단계별 연습이 곧 열립니다</span>
      </section>

      <ChordDiagram />

      <div className={s.grid}>
        <section aria-label="연습 단계">
          <h2 className={s.h2}>연습 단계</h2>
          <ol className={s.steps}>
            {STEPS.map((st) => (
              <li key={st.no} className={s.step}>
                <span className={`${s.stepNo} num`}>{st.no}</span>
                <div className={s.stepBody}>
                  <div className={s.stepTitle}>{st.title}</div>
                  <div className={s.stepDesc}>{st.desc}</div>
                </div>
                <span className={s.soon}>준비 중</span>
              </li>
            ))}
          </ol>
        </section>

        <aside className={s.aside} aria-label="지금 할 수 있는 연습">
          <h2 className={s.h2}>지금 바로</h2>
          <div className={s.card}>
            <div className={s.cardTitle}>자유연습</div>
            <p className={s.cardDesc}>메모장처럼 자유롭게 쳐 보며 소리자바 입력을 확인합니다.</p>
            <button className="primary" onClick={() => go({ name: 'free' })}>
              자유연습 열기
            </button>
          </div>
          <div className={s.card}>
            <div className={s.cardTitle}>예전 깜빡이 연습</div>
            <p className={s.cardDesc}>
              기존 단어장·약어 깜빡이도 소리자바로 그대로 쓸 수 있어요. 타이핑 채점은 ‘연속’ 입력을
              권장합니다.
            </p>
            <button onClick={() => setTrack('legacy')}>예전거로 가기</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
