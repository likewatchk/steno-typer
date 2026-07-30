/// <reference lib="webworker" />
import { scoreSession, type ScoreRequest } from './score.ts'

self.onmessage = (e: MessageEvent<ScoreRequest>) => {
  self.postMessage(scoreSession(e.data))
}
