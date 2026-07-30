/**
 * 전환 틱 소리 — 첫 사용자 제스처에서 AudioContext 1회 생성, 버퍼 사전 합성.
 * 재생 경로는 소스 노드 생성뿐이라 지연·GC 부담이 없다.
 */

let audioCtx: AudioContext | null = null
let tickBuf: AudioBuffer | null = null

export function initSound(): void {
  if (audioCtx) return
  try {
    audioCtx = new AudioContext()
    const sr = audioCtx.sampleRate
    const len = Math.floor(sr * 0.05)
    tickBuf = audioCtx.createBuffer(1, len, sr)
    const ch = tickBuf.getChannelData(0)
    for (let i = 0; i < len; i++) {
      // 1kHz 사인 + 빠른 감쇠 = 짧고 둔탁하지 않은 틱
      ch[i] = Math.sin((2 * Math.PI * 1000 * i) / sr) * Math.exp(-i / (sr * 0.008)) * 0.3
    }
  } catch {
    audioCtx = null
  }
}

export function playTick(): void {
  if (!audioCtx || !tickBuf) return
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  const src = audioCtx.createBufferSource()
  src.buffer = tickBuf
  src.connect(audioCtx.destination)
  src.start()
}
