/**
 * 홈 최상위 셸 — [소리자바] / [예전거] 탭.
 * 소리자바 탭은 고유 액센트(청록)로 구분 — data-track 으로 토큰만 바꿔 하위 전체에 적용.
 */
import { useApp, type Track } from './store.ts'
import Home from '../features/home/Home.tsx'
import SoriJava from '../features/sorijava/SoriJava.tsx'
import s from './HomeShell.module.css'

const TABS: Array<[Track, string]> = [
  ['sorijava', '소리자바'],
  ['legacy', '예전거'],
]

export default function HomeShell() {
  const track = useApp((st) => st.track)
  const setTrack = useApp((st) => st.setTrack)

  return (
    <div className={s.shell} data-track={track}>
      <nav className={s.bar} aria-label="연습 구분">
        <span className={s.logo}>❤️ 나희의 속기 깜빡이</span>
        <span className={s.tabs} role="tablist">
          {TABS.map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={track === t}
              className={track === t ? s.tabOn : s.tab}
              onClick={() => setTrack(t)}
            >
              {label}
            </button>
          ))}
        </span>
      </nav>
      {track === 'sorijava' ? <SoriJava /> : <Home />}
    </div>
  )
}
