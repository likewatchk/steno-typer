// @vitest-environment jsdom
/** 동기화 클라이언트 — fetch 모킹으로 프로토콜·오류 경로 검증 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as repo from './repo.ts'
import { syncNow } from './sync.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('syncNow', () => {
  it('토큰 없으면 네트워크 호출 자체가 없다', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const out = await syncNow('')
    expect(out.ok).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('푸시 페이로드에 로컬 단어장·삭제목록이 실리고, 응답 스냅샷으로 교체된다', async () => {
    const a = await repo.createWordset('로컬A', ['가'])
    const b = await repo.createWordset('로컬B', ['나'])
    await repo.deleteWordset(b.id) // pendingDeletes 에 기록

    let sentBody: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string) as Record<string, unknown>
        return new Response(
          JSON.stringify({
            wordsets: [{ ...a, name: '서버병합A' }, { id: 'srv1', name: '서버추가', items: ['다'], createdAt: 1, updatedAt: 1 }],
            sessions: [],
          }),
          { status: 200 },
        )
      }),
    )

    const out = await syncNow('tok')
    expect(out.ok).toBe(true)

    expect((sentBody.wordsets as unknown[]).length).toBe(1) // 삭제된 B 는 로컬 목록에 없음
    expect(sentBody.deletedWordsetIds).toEqual([b.id])
    const auth = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(auth.Authorization).toBe('Bearer tok')

    const list = await repo.listWordsets()
    expect(list.map((w) => w.name).sort()).toEqual(['서버병합A', '서버추가'])
    expect(await repo.getPendingDeletes()).toEqual([]) // 성공 시 비움
  })

  it('401 → 암호 오류 메시지', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    const out = await syncNow('bad')
    expect(out.ok).toBe(false)
    expect(out.message).toContain('암호')
  })

  it('타임아웃 → 실패해도 예외 없이 메시지, 로컬은 그대로', async () => {
    const before = await repo.listWordsets()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))),
    )
    const out = await syncNow('tok')
    expect(out.ok).toBe(false)
    expect(out.message).toContain('시간 초과')
    expect((await repo.listWordsets()).length).toBe(before.length)
  })

  it('네트워크 단절 → 오프라인 안내, 예외 전파 없음', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    const out = await syncNow('tok')
    expect(out.ok).toBe(false)
    expect(out.message).toContain('오프라인')
  })
})
