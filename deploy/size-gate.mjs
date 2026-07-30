#!/usr/bin/env node
/**
 * 성능 예산 게이트 — 초과 시 non-zero exit 로 배포를 중단시킨다.
 * 예산 (플랜 §1): JS ≤ 120KB gzip, CSS ≤ 15KB gzip, 웹폰트·이미지 0.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../web/dist')
const BUDGET = { js: 120 * 1024, css: 15 * 1024 }

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}

let js = 0
let css = 0
const banned = []
for (const file of walk(DIST)) {
  const gz = gzipSync(readFileSync(file), { level: 9 }).length
  if (/\.js$/.test(file)) js += gz
  else if (/\.css$/.test(file)) css += gz
  else if (/\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif)$/i.test(file)) banned.push(file)
}

const kb = (n) => (n / 1024).toFixed(1) + 'KB'
let fail = false
const check = (label, actual, budget) => {
  const ok = actual <= budget
  if (!ok) fail = true
  console.log(`${ok ? '✓' : '✗'} ${label}: ${kb(actual)} gzip (예산 ${kb(budget)})`)
}
check('JS ', js, BUDGET.js)
check('CSS', css, BUDGET.css)
if (banned.length) {
  fail = true
  console.log(`✗ 웹폰트/이미지 금지 위반: ${banned.join(', ')}`)
} else {
  console.log('✓ 웹폰트·이미지 0')
}

if (fail) {
  console.error('\n성능 예산 초과 — 배포 중단')
  process.exit(1)
}
console.log('\n성능 게이트 통과')
