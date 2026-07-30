import { useApp } from './store.ts'
import Home from '../features/home/Home.tsx'
import Editor from '../features/wordset/Editor.tsx'
import Practice from '../features/flash/Practice.tsx'
import Result from '../features/scoring/Result.tsx'
import FreePractice from '../features/typing/FreePractice.tsx'

export default function App() {
  const ready = useApp((s) => s.ready)
  const screen = useApp((s) => s.screen)
  const planSeq = useApp((s) => s.planSeq)

  if (!ready) return null

  switch (screen.name) {
    case 'home':
      return <Home />
    case 'edit':
      return <Editor wordsetId={screen.wordsetId} />
    case 'practice':
      // planSeq 키 — "다시" 재시작 시 강제 리마운트로 엔진을 새로 만든다
      return <Practice key={planSeq} />
    case 'result':
      return <Result record={screen.record} />
    case 'free':
      return <FreePractice />
  }
}
