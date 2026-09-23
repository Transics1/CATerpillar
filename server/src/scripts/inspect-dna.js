import '../env.js'
import mongoose from 'mongoose'
import { connectDB } from '../db.js'
import { Operator } from '../models/index.js'

await connectDB()
const docs = await Operator.find({ role: 'operator' }, 'operatorId name skillLevel dnaScore').lean()

const col = (k) => docs.map((d) => d.dnaScore[k]).sort((a, b) => a - b)
console.log('sub-score distributions')
for (const k of ['safety', 'efficiency', 'skill', 'overall']) {
  const v = col(k)
  console.log(
    `  ${k.padEnd(11)} min ${String(v[0]).padStart(5)}   med ${String(v[Math.floor(v.length / 2)]).padStart(5)}   max ${String(v[v.length - 1]).padStart(5)}   spread ${(v[v.length - 1] - v[0]).toFixed(1)}`
  )
}

console.log('\nmean overall by skill level')
for (const s of ['Beginner', 'Intermediate', 'Expert']) {
  const g = docs.filter((d) => d.skillLevel === s)
  if (!g.length) continue
  const mean = g.reduce((a, d) => a + d.dnaScore.overall, 0) / g.length
  console.log(`  ${s.padEnd(13)} ${mean.toFixed(1)}  (n=${g.length})`)
}

await mongoose.disconnect()
