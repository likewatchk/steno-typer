import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../app/store.ts'
import { cycleTheme, getThemePref } from '../../lib/theme.ts'
import { initSound } from '../../lib/sound.ts'
import * as repo from '../../lib/repo.ts'
import { syncNow } from '../../lib/sync.ts'
import { parseFileContent, parseWordsetJson } from '../wordset/importText.ts'
import { computeDuration } from '../../lib/scheduler.ts'
import type { RangeSpec, ResumeState, SessionRecord, Settings } from '../../lib/types.ts'
import s from './Home.module.css'

const THEME_LABEL = { system: '테마: 시스템', light: '테마: 라이트', dark: '테마: 다크' } as const

/** 자동 노출시간 미리보기: n글자 낱말이 몇 초 보이는지 */
function autoPreview(st: Settings, chars: number): string {
  const ms = computeDuration('가'.repeat(chars), {
    durationMode: 'auto',
    fixedMs: st.fixedMs,
    autoBaseMs: st.autoBaseMs,
    autoPerCharMs: st.autoPerCharMs,
    autoMinMs: st.autoMinMs,
    autoMaxMs: st.autoMaxMs,
    autoSpeed: st.autoSpeed,
    blankMs: 0,
    countdownMs: 0,
  })
  return (ms / 1000).toFixed(1)
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function Seg<T extends string>(props: {
  value: T
  options: Array<[T, string]>
  onChange: (v: T) => void
}) {
  return (
    <span className={s.seg} role="group">
      {props.options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className={props.value === v ? s.segOn : undefined}
          onClick={() => props.onChange(v)}
        >
          {label}
        </button>
      ))}
    </span>
  )
}

export default function Home() {
  const wordsets = useApp((st) => st.wordsets)
  const selectedId = useApp((st) => st.selectedId)
  const settings = useApp((st) => st.settings)
  const recent = useApp((st) => st.recent)
  const { go, select, patchSettings, patchScoring, startPractice, reloadWordsets } = useApp.getState()

  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'all' | 'normal' | 'abbr'>('all')
  const [themeLabel, setThemeLabel] = useState(() => THEME_LABEL[getThemePref()])
  const [syncState, setSyncState] = useState<'idle' | 'busy' | string>('idle')
  const [resume, setResume] = useState<ResumeState | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 선택 단어장의 이어하기 존재 여부 (선택 변경·홈 복귀 시 조회)
  useEffect(() => {
    let stale = false
    setResume(null)
    if (selectedId) {
      void repo.getResume(selectedId).then((r) => {
        if (!stale) setResume(r ?? null)
      })
    }
    return () => {
      stale = true
    }
  }, [selectedId])

  const selected = wordsets.find((w) => w.id === selectedId) ?? null
  const isAbbr = (name: string) => name.startsWith('약어') || name.startsWith('오답 — 약어')
  const counts = useMemo(
    () => ({
      abbr: wordsets.filter((w) => isAbbr(w.name)).length,
      normal: wordsets.filter((w) => !isAbbr(w.name)).length,
    }),
    [wordsets],
  )
  const filtered = useMemo(() => {
    let list = wordsets
    if (tab === 'abbr') list = list.filter((w) => isAbbr(w.name))
    else if (tab === 'normal') list = list.filter((w) => !isAbbr(w.name))
    return query.trim() ? list.filter((w) => w.name.includes(query.trim())) : list
  }, [wordsets, query, tab])

  const range = settings.range
  const canStart = !!selected && selected.items.length > 0

  function setRange(r: RangeSpec) {
    patchSettings({ range: r })
  }

  async function onImportFiles(files: FileList | null) {
    if (!files?.length) return
    for (const file of files) {
      const buf = await file.arrayBuffer()
      if (/\.json$/i.test(file.name)) {
        try {
          for (const ws of parseWordsetJson(new TextDecoder().decode(buf))) {
            await repo.createWordset(ws.name, ws.items)
          }
        } catch (e) {
          alert(`JSON 형식 오류: ${(e as Error).message}`)
        }
      } else {
        const items = parseFileContent(file.name, buf)
        if (items.length) await repo.createWordset(file.name.replace(/\.[^.]+$/, ''), items)
      }
    }
    await reloadWordsets()
  }

  function openResult(rec: SessionRecord) {
    if (rec.result) go({ name: 'result', record: rec })
  }

  async function onSync() {
    // 수동 트리거 전용 — 서버(사우디) 호출은 이 버튼이 유일한 경로
    let token = settings.syncToken
    if (!token) {
      const entered = prompt('동기화 암호 (서버 배포 시 발급된 값)')
      if (!entered) return
      token = entered.trim()
      patchSettings({ syncToken: token })
    }
    setSyncState('busy')
    const out = await syncNow(token)
    if (out.ok) {
      await reloadWordsets()
      await useApp.getState().reloadRecent() // pull 로 바뀐 기록도 반영
      setSyncState(out.message)
    } else {
      if (out.message.includes('암호가 틀립')) patchSettings({ syncToken: '' })
      setSyncState(out.message)
    }
    window.setTimeout(() => setSyncState('idle'), 4000)
  }

  function onStart() {
    initSound() // 사용자 제스처 시점에 AudioContext 준비
    if (settings.fullscreen && !document.fullscreenElement) {
      // 제스처 컨텍스트 안에서만 허용되므로 여기서 요청. 실패해도 연습은 계속.
      void document.documentElement.requestFullscreen?.().catch(() => {})
    }
    startPractice()
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <span className={s.logo}>❤️ 나희의 속기 깜빡이</span>
        <button className="ghost" onClick={() => go({ name: 'free' })}>
          자유연습
        </button>
        <button className="ghost" disabled={syncState === 'busy'} onClick={() => void onSync()}>
          {syncState === 'idle' ? '동기화' : syncState === 'busy' ? '동기화 중…' : syncState}
        </button>
        <button className="ghost" onClick={() => setThemeLabel(THEME_LABEL[cycleTheme()])}>
          {themeLabel}
        </button>
      </header>

      <div className={s.grid}>
        {/* ---- 좌: 단어장 목록 ---- */}
        <section className={s.panel} aria-label="단어장 목록">
          <div className={s.tabs} role="tablist">
            <button
              role="tab"
              className={tab === 'all' ? s.tabOn : s.tab}
              onClick={() => setTab('all')}
            >
              전체 <span className="num">{wordsets.length}</span>
            </button>
            <button
              role="tab"
              className={tab === 'normal' ? s.tabOn : s.tab}
              onClick={() => setTab('normal')}
            >
              일반 연습 <span className="num">{counts.normal}</span>
            </button>
            <button
              role="tab"
              className={tab === 'abbr' ? s.tabOn : s.tab}
              onClick={() => setTab('abbr')}
            >
              약어 <span className="num">{counts.abbr}</span>
            </button>
          </div>
          <div className={s.listHead}>
            <input
              type="text"
              placeholder="검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button onClick={() => go({ name: 'edit', wordsetId: null })}>새 단어장</button>
            <button onClick={() => fileRef.current?.click()}>가져오기</button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,.json"
              multiple
              hidden
              onChange={(e) => {
                void onImportFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          <div className={s.list}>
            {filtered.length === 0 ? (
              <p className={s.empty}>
                {wordsets.length === 0
                  ? '단어장이 없습니다. [새 단어장]으로 만들거나 .txt 파일을 가져오세요.'
                  : '검색 결과가 없습니다.'}
              </p>
            ) : (
              filtered.map((w) => (
                <button
                  key={w.id}
                  className={`${s.row} ${w.id === selectedId ? s.rowSelected : ''}`}
                  onClick={() => select(w.id)}
                  onDoubleClick={() => go({ name: 'edit', wordsetId: w.id })}
                >
                  <span className={s.rowName}>{w.name}</span>
                  <span className={`${s.rowCount} num`}>{w.items.length}개</span>
                </button>
              ))
            )}
          </div>
        </section>

        {/* ---- 우: 연습 설정 ---- */}
        <section className={`${s.panel} ${s.config}`} aria-label="연습 설정">
          {selected ? (
            <>
              <div>
                <div className={s.selName}>
                  {selected.name}
                  <span className={`${s.selCount} num`}>{selected.items.length}개</span>
                  <button className="ghost" onClick={() => go({ name: 'edit', wordsetId: selected.id })}>
                    편집
                  </button>
                </div>
                <div className={s.preview}>{selected.items.slice(0, 5).map((it) => it.t).join(' · ')}</div>
              </div>

              <div className={s.group}>
                <span className={s.groupLabel}>모드 — 보기만 하거나, 받아치며 채점하거나</span>
                <Seg
                  value={settings.mode}
                  options={[
                    ['view', '보기만'],
                    ['typing', '타이핑 채점'],
                  ]}
                  onChange={(mode) =>
                    patchSettings({
                      mode,
                      // 무제한은 타이핑 전용 — 보기 모드로 바꾸면 자동으로 복귀
                      ...(mode === 'view' && settings.durationMode === 'untimed'
                        ? { durationMode: 'auto' as const }
                        : {}),
                    })
                  }
                />
              </div>

              <div className={s.group}>
                <span className={s.groupLabel}>노출 시간 — 항목이 화면에 머무는 시간</span>
                <div className={s.inline}>
                  <Seg
                    value={settings.durationMode}
                    options={
                      settings.mode === 'typing'
                        ? [
                            ['auto', '글자수 자동'],
                            ['fixed', '고정'],
                            ['untimed', '무제한'],
                          ]
                        : [
                            ['auto', '글자수 자동'],
                            ['fixed', '고정'],
                          ]
                    }
                    onChange={(durationMode) => patchSettings({ durationMode })}
                  />
                  {settings.durationMode === 'fixed' && (
                    <>
                      <input
                        type="range"
                        min={500}
                        max={10000}
                        step={100}
                        value={settings.fixedMs}
                        onChange={(e) => patchSettings({ fixedMs: +e.target.value })}
                      />
                      <span className="num">{(settings.fixedMs / 1000).toFixed(1)}초</span>
                    </>
                  )}
                </div>
                {settings.durationMode === 'untimed' && (
                  <span className={s.hint}>
                    시간 제한 없음 — 맞게 치면 자동으로 다음 항목. 낱말 끝에 띄어쓰기를 치면 확정됩니다.
                  </span>
                )}
                {settings.durationMode === 'auto' && (
                  <>
                    <div className={s.inline}>
                      <span className={s.hint}>완전 여유</span>
                      <input
                        type="range"
                        min={20}
                        max={200}
                        step={5}
                        value={Math.round(settings.autoSpeed * 100)}
                        onChange={(e) => patchSettings({ autoSpeed: +e.target.value / 100 })}
                      />
                      <span className={s.hint}>빡세게</span>
                      <span className={`${s.hint} num`}>
                        {autoPreview(settings, 3)}초/3글자 · {autoPreview(settings, 8)}초/8글자
                      </span>
                    </div>
                    <div className={s.inline}>
                      {(
                        [
                          ['여유롭게', 0.7],
                          ['더 여유롭게', 0.5],
                          ['더더 여유롭게', 0.35],
                          ['완전 여유롭게', 0.2],
                        ] as const
                      ).map(([label, v]) => (
                        <button
                          key={label}
                          className={`${s.presetChip} ${Math.abs(settings.autoSpeed - v) < 0.011 ? s.presetOn : ''}`}
                          onClick={() => patchSettings({ autoSpeed: v })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {selected.items.some((it) => it.h) && (
                <div className={s.group}>
                  <span className={s.groupLabel}>약어 힌트 — 항목에 저장된 타법 표시</span>
                  <div className={s.inline}>
                    <Seg
                      value={settings.hintMode}
                      options={[
                        ['show', '바로 표시'],
                        ['delayed', '지연 표시'],
                        ['off', '끔 (실전)'],
                      ]}
                      onChange={(hintMode) => patchSettings({ hintMode })}
                    />
                    {settings.hintMode === 'delayed' && (
                      <label className={s.inline}>
                        <input
                          type="range"
                          min={300}
                          max={4000}
                          step={100}
                          value={settings.hintDelayMs}
                          onChange={(e) => patchSettings({ hintDelayMs: +e.target.value })}
                        />
                        <span className="num">{(settings.hintDelayMs / 1000).toFixed(1)}초 뒤</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              <div className={s.group}>
                <span className={s.groupLabel}>글자 크기</span>
                <div className={s.inline}>
                  <label className={s.inline}>
                    깜빡이
                    <input
                      type="range"
                      min={50}
                      max={150}
                      step={5}
                      value={Math.round(settings.flashScale * 100)}
                      onChange={(e) => patchSettings({ flashScale: +e.target.value / 100 })}
                    />
                    <span className="num">{Math.round(settings.flashScale * 100)}%</span>
                  </label>
                  {settings.mode === 'typing' && (
                    <label className={s.inline}>
                      입력창
                      <input
                        type="range"
                        min={16}
                        max={48}
                        step={1}
                        value={settings.inputFontPx}
                        onChange={(e) => patchSettings({ inputFontPx: +e.target.value })}
                      />
                      <span className="num">{settings.inputFontPx}px</span>
                    </label>
                  )}
                </div>
              </div>

              <div className={s.group}>
                <span className={s.groupLabel}>순서와 범위</span>
                <div className={s.inline}>
                  <Seg
                    value={settings.order}
                    options={[
                      ['seq', '순차'],
                      ['shuffle', '셔플'],
                    ]}
                    onChange={(order) => patchSettings({ order })}
                  />
                  <label className={s.inline}>
                    반복
                    <input
                      className={`${s.numInput} num`}
                      type="number"
                      min={1}
                      max={99}
                      value={settings.repeat}
                      onChange={(e) => patchSettings({ repeat: Math.max(1, Math.min(99, +e.target.value || 1)) })}
                    />
                    회
                  </label>
                  <select
                    value={range.kind}
                    onChange={(e) => {
                      const kind = e.target.value as RangeSpec['kind']
                      if (kind === 'all') setRange({ kind: 'all' })
                      else if (kind === 'span') setRange({ kind: 'span', from: 1, to: selected.items.length })
                      else setRange({ kind: 'random', n: Math.min(20, selected.items.length) })
                    }}
                  >
                    <option value="all">전체</option>
                    <option value="span">구간</option>
                    <option value="random">랜덤 N개</option>
                  </select>
                  {range.kind === 'span' && (
                    <span className={s.inline}>
                      <input
                        className={`${s.numInput} num`}
                        type="number"
                        min={1}
                        max={selected.items.length}
                        value={range.from}
                        onChange={(e) => setRange({ ...range, from: +e.target.value || 1 })}
                      />
                      ~
                      <input
                        className={`${s.numInput} num`}
                        type="number"
                        min={1}
                        max={selected.items.length}
                        value={range.to}
                        onChange={(e) => setRange({ ...range, to: +e.target.value || selected.items.length })}
                      />
                      번
                    </span>
                  )}
                  {range.kind === 'random' && (
                    <span className={s.inline}>
                      <input
                        className={`${s.numInput} num`}
                        type="number"
                        min={1}
                        max={selected.items.length}
                        value={range.n}
                        onChange={(e) => setRange({ kind: 'random', n: +e.target.value || 1 })}
                      />
                      개
                    </span>
                  )}
                </div>
              </div>

              {settings.mode === 'typing' && (
                <div className={s.scoringBox}>
                  <div className={s.inline}>
                    <span className={s.groupLabel}>채점 기준</span>
                    <Seg
                      value={settings.scoring.profile ?? 'custom'}
                      options={[
                        ['exam', '공인시험 기준'],
                        ['custom', '직접 설정'],
                      ]}
                      onChange={(profile) => patchScoring({ profile })}
                    />
                  </div>
                  {(settings.scoring.profile ?? 'custom') === 'exam' ? (
                    <span className={s.hint}>
                      속기 공인시험식 — 음절 단위 감점, 띄어쓰기·문장부호 무시,
                      첨가도 감점. 정확률 = (글자수 − 오자·탈자·첨가) ÷ 글자수
                    </span>
                  ) : (
                    <>
                      <label className={s.check}>
                        <input
                          type="checkbox"
                          checked={settings.scoring.ignoreSpace}
                          onChange={(e) => patchScoring({ ignoreSpace: e.target.checked })}
                        />
                        띄어쓰기 무시 — 공백 차이는 틀림으로 치지 않음
                      </label>
                      <label className={s.check}>
                        <input
                          type="checkbox"
                          checked={settings.scoring.ignorePunct}
                          onChange={(e) => patchScoring({ ignorePunct: e.target.checked })}
                        />
                        문장부호 무시
                      </label>
                      <div className={s.inline}>
                        <span className={s.groupLabel}>채점 단위</span>
                        <Seg
                          value={settings.scoring.unit}
                          options={[
                            ['syllable', '음절'],
                            ['jamo', '자모'],
                            ['keystroke', '타수'],
                          ]}
                          onChange={(unit) => patchScoring({ unit })}
                        />
                      </div>
                    </>
                  )}
                  <div className={s.inline}>
                    <span className={s.groupLabel}>입력 방식</span>
                    <Seg
                      value={settings.scoring.inputStyle}
                      options={[
                        ['continuous', '연속 (실전형)'],
                        ['discrete', '항목마다 새로'],
                      ]}
                      onChange={(inputStyle) => patchScoring({ inputStyle })}
                    />
                  </div>
                  {settings.scoring.inputStyle === 'discrete' && (
                    <span className={s.hint}>
                      속기 프로그램(소리자바 등)으로 칠 때는 '연속'을 권장 — 항목마다 입력창을
                      비우는 방식이라 속기 프로그램의 지웠다 다시 쓰기와 어긋날 수 있습니다.
                    </span>
                  )}
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={settings.liveStats}
                      onChange={(e) => patchSettings({ liveStats: e.target.checked })}
                    />
                    실시간 채점 표시 — 연습 중 좌상단에 정확도·타수 (실전처럼 가리려면 끄기)
                  </label>
                </div>
              )}

              <details className={s.advanced}>
                <summary>고급 설정</summary>
                <div className={s.advBody}>
                  {settings.durationMode === 'auto' && (
                    <>
                      <div className={s.advRow}>
                        <label>기본 시간 (ms)</label>
                        <input
                          type="number"
                          className="num"
                          step={100}
                          value={settings.autoBaseMs}
                          onChange={(e) => patchSettings({ autoBaseMs: +e.target.value || 0 })}
                        />
                      </div>
                      <div className={s.advRow}>
                        <label>글자당 추가 (ms)</label>
                        <input
                          type="number"
                          className="num"
                          step={10}
                          value={settings.autoPerCharMs}
                          onChange={(e) => patchSettings({ autoPerCharMs: +e.target.value || 0 })}
                        />
                      </div>
                      <div className={s.advRow}>
                        <label>최소~최대 (ms)</label>
                        <input
                          type="number"
                          className="num"
                          step={100}
                          value={settings.autoMinMs}
                          onChange={(e) => patchSettings({ autoMinMs: +e.target.value || 0 })}
                        />
                        <input
                          type="number"
                          className="num"
                          step={100}
                          value={settings.autoMaxMs}
                          onChange={(e) => patchSettings({ autoMaxMs: +e.target.value || 0 })}
                        />
                      </div>
                    </>
                  )}
                  <div className={s.advRow}>
                    <label>깜빡임 간격 (ms) — 같은 단어 연속에도 전환이 보이게</label>
                    <input
                      type="number"
                      className="num"
                      step={50}
                      min={0}
                      value={settings.blankMs}
                      onChange={(e) => patchSettings({ blankMs: Math.max(0, +e.target.value || 0) })}
                    />
                  </div>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={settings.countdown}
                      onChange={(e) => patchSettings({ countdown: e.target.checked })}
                    />
                    시작 전 3초 카운트다운
                  </label>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={settings.sound}
                      onChange={(e) => patchSettings({ sound: e.target.checked })}
                    />
                    전환 소리
                  </label>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={settings.fullscreen}
                      onChange={(e) => patchSettings({ fullscreen: e.target.checked })}
                    />
                    브라우저 전체화면으로 연습
                  </label>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={settings.previewNext}
                      onChange={(e) => patchSettings({ previewNext: e.target.checked })}
                    />
                    다음 항목 흐리게 미리 보기
                  </label>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={settings.safeMode}
                      onChange={(e) => patchSettings({ safeMode: e.target.checked })}
                    />
                    안전 모드 — 소리·페이드·미리보기 끔 (입력 문제 시)
                  </label>
                  <span className={s.hint}>
                    입력 진단은 항상 기록됩니다 — 글자가 안 쳐지는 순간이 있으면 자유연습 하단의
                    [진단 내보내기]로 저장해 주세요.
                  </span>
                </div>
              </details>

              <button className={`primary ${s.start}`} disabled={!canStart} onClick={onStart}>
                연습 시작
              </button>
              {resume && (
                <button
                  className={s.resumeBtn}
                  onClick={() => {
                    initSound()
                    if (settings.fullscreen && !document.fullscreenElement) {
                      void document.documentElement.requestFullscreen?.().catch(() => {})
                    }
                    useApp.getState().startPracticeResume(resume)
                  }}
                >
                  이어서 시작 — <span className="num">{resume.index + 1} / {resume.items.length}</span>
                  <span className={s.resumeMeta}>{fmtDate(resume.savedAt)} 저장</span>
                </button>
              )}
            </>
          ) : (
            <p className={s.empty}>왼쪽에서 단어장을 선택하거나 새로 만드세요.</p>
          )}
        </section>
      </div>

      {/* ---- 최근 기록 ---- */}
      {recent.length > 0 && (
        <section className={s.recent}>
          <h2 className={s.recentTitle}>최근 기록</h2>
          <div className={s.panel}>
            {recent.map((r) => (
              <button key={r.id} className={s.recentRow} onClick={() => openResult(r)} disabled={!r.result}>
                <span className={`${s.recentDate} num`}>{fmtDate(r.startedAt)}</span>
                <span className={s.recentName}>{r.wordsetName}</span>
                {r.result ? (
                  <span className={`${s.recentStat} num`}>
                    정확도 {(r.result.accuracy * 100).toFixed(1)}% · {Math.round(r.result.kpm)}타/분
                  </span>
                ) : (
                  <span className={s.recentStat}>보기만</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
