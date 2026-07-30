import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app/store.ts'
import * as repo from '../../lib/repo.ts'
import { downloadJson, parseFileContent, splitText, type SplitMode } from './importText.ts'
import s from './Editor.module.css'

const SPLIT_LABEL: Record<SplitMode, string> = {
  line: '줄바꿈마다',
  sentence: '문장마다 (. ! ? …)',
  eojeol: 'N어절씩 묶기',
}

export default function Editor({ wordsetId }: { wordsetId: string | null }) {
  const { go, reloadWordsets, select } = useApp.getState()
  const existing = useApp((st) => st.wordsets.find((w) => w.id === wordsetId) ?? null)

  const [name, setName] = useState(existing?.name ?? '')
  const [items, setItems] = useState<string[]>(existing?.items ?? [])
  const [dirty, setDirty] = useState(false)
  const [bulk, setBulk] = useState('')
  const [splitMode, setSplitMode] = useState<SplitMode>('line')
  const [eojeolN, setEojeolN] = useState(2)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 편집 중 이탈 방지 (브라우저 새로고침/닫기)
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  function mutate(next: string[]) {
    setItems(next)
    setDirty(true)
  }

  function addBulk() {
    const parsed = splitText(bulk, splitMode, eojeolN)
    if (!parsed.length) return
    mutate([...items, ...parsed])
    setBulk('')
  }

  async function addFiles(files: FileList | File[] | null) {
    if (!files) return
    const added: string[] = []
    for (const file of files) {
      added.push(...parseFileContent(file.name, await file.arrayBuffer()))
      if (!name.trim() && file.name) setName(file.name.replace(/\.[^.]+$/, ''))
    }
    if (added.length) mutate([...items, ...added])
  }

  function dedupe() {
    mutate([...new Set(items)])
  }

  function shuffle() {
    const next = [...items]
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    mutate(next)
  }

  async function save() {
    const cleanItems = items.map((x) => x.trim()).filter(Boolean)
    const finalName = name.trim() || '이름 없는 단어장'
    if (existing) {
      await repo.saveWordset({ ...existing, name: finalName, items: cleanItems, updatedAt: Date.now() })
    } else {
      const ws = await repo.createWordset(finalName, cleanItems)
      select(ws.id)
    }
    await reloadWordsets()
    go({ name: 'home' })
  }

  function back() {
    if (dirty && !confirm('저장하지 않은 변경이 있습니다. 나갈까요?')) return
    go({ name: 'home' })
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <button className="ghost" onClick={back}>
          ← 홈
        </button>
        <input
          className={s.name}
          type="text"
          placeholder="단어장 이름"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setDirty(true)
          }}
        />
        {existing && (
          <button onClick={() => downloadJson(`${name || 'wordset'}.json`, { name, items })}>내보내기</button>
        )}
        <button className="primary" onClick={() => void save()}>
          저장
        </button>
      </header>

      <section
        className={`${s.addBox} ${dragOver ? s.dragOver : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void addFiles(e.dataTransfer.files)
        }}
      >
        <textarea
          placeholder={'항목을 붙여넣으세요. 아래 기준으로 잘라서 추가합니다.\n.txt / .csv 파일을 여기로 끌어와도 됩니다 (CP949 인코딩 자동 인식).'}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
        />
        <div className={s.addRow}>
          자르는 기준
          <select value={splitMode} onChange={(e) => setSplitMode(e.target.value as SplitMode)}>
            {(Object.keys(SPLIT_LABEL) as SplitMode[]).map((m) => (
              <option key={m} value={m}>
                {SPLIT_LABEL[m]}
              </option>
            ))}
          </select>
          {splitMode === 'eojeol' && (
            <label>
              N ={' '}
              <input
                className={`${s.nInput} num`}
                type="number"
                min={1}
                max={20}
                value={eojeolN}
                onChange={(e) => setEojeolN(Math.max(1, Math.min(20, +e.target.value || 1)))}
              />
            </label>
          )}
          <button onClick={addBulk} disabled={!bulk.trim()}>
            목록에 추가
          </button>
          <button onClick={() => fileRef.current?.click()}>파일 선택</button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv"
            multiple
            hidden
            onChange={(e) => {
              void addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      </section>

      <div className={s.toolbar}>
        <span className={`${s.count} num`}>{items.length}개 항목</span>
        <button onClick={dedupe} disabled={!items.length}>
          중복 제거
        </button>
        <button onClick={shuffle} disabled={items.length < 2}>
          섞기
        </button>
        <button
          onClick={() => {
            if (confirm('모든 항목을 지울까요?')) mutate([])
          }}
          disabled={!items.length}
        >
          전체 삭제
        </button>
      </div>

      <section className={s.list}>
        {items.length === 0 ? (
          <p className={s.empty}>아직 항목이 없습니다. 위에 붙여넣거나 파일을 끌어오세요.</p>
        ) : (
          items.map((item, i) => (
            <div key={i} className={s.item}>
              <span className={`${s.itemNo} num`}>{i + 1}</span>
              <input
                type="text"
                value={item}
                onChange={(e) => {
                  const next = [...items]
                  next[i] = e.target.value
                  mutate(next)
                }}
              />
              <button
                className={s.itemDel}
                aria-label={`${i + 1}번 삭제`}
                onClick={() => mutate(items.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))
        )}
      </section>

      <footer className={s.footer}>
        <button className="primary" onClick={() => void save()}>
          저장
        </button>
      </footer>
    </div>
  )
}
