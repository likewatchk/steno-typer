import { create } from 'zustand'
import * as repo from '../lib/repo.ts'
import { prepareItems, type EngineItem } from '../lib/scheduler.ts'
import type { SessionRecord, Settings, Wordset } from '../lib/types.ts'
import { DEFAULT_SETTINGS } from '../lib/types.ts'

export type Screen =
  | { name: 'home' }
  | { name: 'edit'; wordsetId: string | null } // null = 새 단어장
  | { name: 'practice' }
  | { name: 'result'; record: SessionRecord }
  | { name: 'free' } // 자유연습 (메모장형)

export interface PracticePlan {
  wordset: Wordset
  items: EngineItem[]
}

interface AppState {
  ready: boolean
  screen: Screen
  wordsets: Wordset[]
  selectedId: string | null
  settings: Settings
  recent: SessionRecord[]
  plan: PracticePlan | null
  /** 연습 재시작 시 Practice 컴포넌트를 강제 리마운트하기 위한 키 */
  planSeq: number

  init(): Promise<void>
  go(screen: Screen): void
  select(id: string): void
  reloadWordsets(): Promise<void>
  removeWordset(id: string): Promise<void>
  patchSettings(patch: Partial<Settings>): void
  patchScoring(patch: Partial<Settings['scoring']>): void
  startPractice(): void
  /** 오답 재연습 등 — 임의 항목으로 즉시 시작 */
  startPracticeWith(wordset: Wordset, items: EngineItem[]): void
  finishPractice(record: SessionRecord | null): void
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  screen: { name: 'home' },
  wordsets: [],
  selectedId: null,
  settings: DEFAULT_SETTINGS,
  recent: [],
  plan: null,
  planSeq: 0,

  async init() {
    const [wordsets, settings, recent] = await Promise.all([
      repo.listWordsets(),
      repo.getSettings(),
      repo.listSessions(10),
    ])
    set({
      wordsets,
      settings,
      recent,
      selectedId: wordsets[0]?.id ?? null,
      ready: true,
    })
  },

  go(screen) {
    set({ screen })
  },

  select(id) {
    set({ selectedId: id })
  },

  async reloadWordsets() {
    const wordsets = await repo.listWordsets()
    const { selectedId } = get()
    set({
      wordsets,
      selectedId: selectedId && wordsets.some((w) => w.id === selectedId) ? selectedId : (wordsets[0]?.id ?? null),
    })
  },

  async removeWordset(id) {
    await repo.deleteWordset(id)
    await get().reloadWordsets()
  },

  patchSettings(patch) {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    void repo.saveSettings(settings)
  },

  patchScoring(patch) {
    const { settings } = get()
    get().patchSettings({ scoring: { ...settings.scoring, ...patch } })
  },

  startPractice() {
    const { wordsets, selectedId, settings } = get()
    const wordset = wordsets.find((w) => w.id === selectedId)
    if (!wordset || wordset.items.length === 0) return
    const items = prepareItems(wordset.items, settings.range, settings.order, settings.repeat)
    if (items.length === 0) return
    set((st) => ({ plan: { wordset, items }, screen: { name: 'practice' }, planSeq: st.planSeq + 1 }))
  },

  startPracticeWith(wordset, items) {
    if (items.length === 0) return
    set((st) => ({ plan: { wordset, items }, screen: { name: 'practice' }, planSeq: st.planSeq + 1 }))
  },

  finishPractice(record) {
    set({ plan: null })
    if (record) {
      void repo.saveSession(record).then(async () => {
        set({ recent: await repo.listSessions(10) })
      })
      set({ screen: record.result ? { name: 'result', record } : { name: 'home' } })
    } else {
      set({ screen: { name: 'home' } })
    }
  },
}))
