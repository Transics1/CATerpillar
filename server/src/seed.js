/**
 * Seeds MongoDB from the CSVs produced by `python data/generate.py`.
 *
 * Run:  npm run seed
 *
 * Safe to re-run: it drops the collections it owns first. Telemetry is a time-series
 * collection, which cannot be partially updated, so a full reload is the only option anyway.
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import { parse } from 'csv-parse/sync'
import { connectDB } from './db.js'
import { Operator, Machine, Telemetry, Task, Lesson } from './models/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../data/out')

const BATCH = 5000

function readCsv(name) {
  const file = path.join(OUT, name)
  if (!fs.existsSync(file)) {
    throw new Error(`${name} not found in data/out — run "npm run generate" first`)
  }
  return parse(fs.readFileSync(file), { columns: true, skip_empty_lines: true })
}

const num = (v) => (v === '' || v == null ? undefined : Number(v))
const bool = (v) => v === 'True' || v === 'true' || v === '1'

async function insertBatched(Model, docs, label) {
  for (let i = 0; i < docs.length; i += BATCH) {
    await Model.insertMany(docs.slice(i, i + BATCH), { ordered: false })
    process.stdout.write(`\r  ${label}: ${Math.min(i + BATCH, docs.length).toLocaleString()} / ${docs.length.toLocaleString()}`)
  }
  process.stdout.write('\n')
}

// Video URLs are public YouTube embeds — keyless, free, and real operator-training content.
const LESSON_CONTENT = {
  L01: {
    videoUrl: 'https://www.youtube.com/embed/videoseries?list=PLxSTGRqTpSSLD0iLRnvsRfLoHbHNIQxZB',
    body: 'Idling burns roughly 4.5 L/hr and puts hours on the engine without moving material. Shut down when the wait is longer than three minutes.',
    quiz: [
      { q: 'Roughly how much fuel does an idling mid-size excavator burn per hour?', options: ['0.5 L', '4.5 L', '15 L'], answerIndex: 1 },
      { q: 'Above what wait time should you shut the engine down?', options: ['30 seconds', '3 minutes', '20 minutes'], answerIndex: 1 },
      { q: 'Does idle time still accumulate engine hours?', options: ['Yes', 'No'], answerIndex: 0 }
    ]
  },
  L02: {
    body: 'On slopes and uneven ground the restraint is what keeps you inside the protective structure during a roll. Fasten before the engine starts, not after.',
    quiz: [
      { q: 'When should the restraint be fastened?', options: ['Before engine start', 'After the first cycle', 'Only on slopes'], answerIndex: 0 },
      { q: 'What protects the operator during a rollover?', options: ['The cab glass', 'ROPS plus restraint', 'The boom'], answerIndex: 1 },
      { q: 'Is the restraint optional for short repositioning moves?', options: ['Yes', 'No'], answerIndex: 1 }
    ]
  },
  L03: {
    body: 'Harsh swing and abrupt boom stops spike hydraulic pressure and shorten component life. Feather the joystick into and out of each movement.',
    quiz: [
      { q: 'What does an abrupt swing stop spike?', options: ['Hydraulic pressure', 'Battery voltage', 'Ambient temperature'], answerIndex: 0 },
      { q: 'What is the recommended joystick technique?', options: ['Full deflection', 'Feather in and out', 'Rapid pulses'], answerIndex: 1 },
      { q: 'Harsh operation primarily affects what?', options: ['Component life', 'Fuel colour', 'Seat height'], answerIndex: 0 }
    ]
  },
  L04: {
    body: 'The swing radius is a no-go zone. Confirm eye contact with the spotter before any swing, and stop the moment a person enters the arc.',
    quiz: [
      { q: 'What must you confirm before swinging?', options: ['Eye contact with the spotter', 'Fuel level', 'Radio channel'], answerIndex: 0 },
      { q: 'A person enters the swing arc. You:', options: ['Swing faster', 'Stop immediately', 'Sound horn and continue'], answerIndex: 1 },
      { q: 'The swing radius is classified as:', options: ['A no-go zone', 'A walkway', 'A storage area'], answerIndex: 0 }
    ]
  },
  L05: {
    body: 'Eco mode holds engine speed lower while delivering the same hydraulic flow for most tasks. Full throttle rarely moves more material per litre.',
    quiz: [
      { q: 'Eco mode primarily reduces what?', options: ['Engine speed', 'Bucket size', 'Track tension'], answerIndex: 0 },
      { q: 'Does full throttle always move more material per litre?', options: ['Yes', 'No'], answerIndex: 1 },
      { q: 'Fuel per cycle is a measure of:', options: ['Efficiency', 'Safety', 'Payload weight'], answerIndex: 0 }
    ]
  },
  L06: {
    body: 'Most overheats trace back to a blocked radiator core or low coolant found during the walkaround. Check the core for packed dust before every shift.',
    quiz: [
      { q: 'Most overheats trace back to:', options: ['A blocked radiator core', 'Cold weather', 'Low tyre pressure'], answerIndex: 0 },
      { q: 'When should the core be checked?', options: ['Every shift', 'Monthly', 'Only when the alarm sounds'], answerIndex: 0 },
      { q: 'Engine temperature above 105C indicates:', options: ['Normal operation', 'An overheat condition', 'Idle state'], answerIndex: 1 }
    ]
  }
}

async function main() {
  await connectDB()

  console.log('reading CSVs ...')
  const operators = readCsv('operators.csv')
  const machines = readCsv('machines.csv')
  const tasks = readCsv('tasks.csv')
  const lessons = readCsv('lessons.csv')
  const cohort = readCsv('improvement_cohort.csv')
  const telemetry = readCsv('telemetry.csv')

  console.log('clearing existing collections ...')
  await Promise.all([
    Operator.deleteMany({}),
    Machine.deleteMany({}),
    Task.deleteMany({}),
    Lesson.deleteMany({})
  ])
  // Time-series collections must be dropped wholesale rather than emptied.
  try {
    await mongoose.connection.db.dropCollection('telemetries')
  } catch {
    /* first run - collection does not exist yet */
  }

  const cohortBy = Object.fromEntries(cohort.map((c) => [c.operatorId, c]))
  const firstDay = new Date(Math.min(...telemetry.slice(0, 200).map((t) => new Date(t.timestamp))))

  await Operator.insertMany(
    operators.map((o) => {
      const c = cohortBy[o.operatorId]
      const completed = c
        ? [{
            lessonId: c.lessonId,
            completedAt: new Date(firstDay.getTime() + Number(c.lessonDayIndex) * 86400000),
            quizScore: 100
          }]
        : []
      return {
        operatorId: o.operatorId,
        name: o.name,
        language: o.language,
        skillLevel: o.skillLevel,
        certifications: JSON.parse(o.certifications || '[]'),
        joinDate: new Date(o.joinDate),
        completedLessons: completed
      }
    })
  )
  console.log(`  operators: ${operators.length}`)

  await Machine.insertMany(
    machines.map((m) => ({
      machineId: m.machineId,
      machineType: m.machineType,
      model: m.model,
      ageYears: num(m.ageYears),
      attachment: m.attachment,
      status: m.status
    }))
  )
  console.log(`  machines: ${machines.length}`)

  await Lesson.insertMany(
    lessons.map((l) => ({
      lessonId: l.lessonId,
      title: l.title,
      durationSec: num(l.durationSec),
      forAnomalyType: l.forAnomalyType,
      ...(LESSON_CONTENT[l.lessonId] || {})
    }))
  )
  console.log(`  lessons: ${lessons.length}`)

  await insertBatched(
    Task,
    tasks.map((t) => ({
      ...t,
      scheduledDate: new Date(t.scheduledDate),
      ambientTempC: num(t.ambientTempC),
      machineAgeYrs: num(t.machineAgeYrs),
      targetVolumeM3: num(t.targetVolumeM3),
      payloadTargetKg: num(t.payloadTargetKg),
      terrainSlope: num(t.terrainSlope),
      estimatedTimeMin: num(t.estimatedTimeMin),
      actualTimeMin: num(t.actualTimeMin),
      interruptions: num(t.interruptions)
    })),
    'tasks'
  )

  await insertBatched(
    Telemetry,
    telemetry.map((t) => ({
      timestamp: new Date(t.timestamp),
      meta: { machineId: t.machineId, operatorId: t.operatorId, machineType: t.machineType },
      engineHours: num(t.engineHours),
      fuelUsedL: num(t.fuelUsedL),
      loadCycles: num(t.loadCycles),
      idlingTimeMin: num(t.idlingTimeMin),
      seatbeltStatus: t.seatbeltStatus,
      safetyAlertTriggered: bool(t.safetyAlertTriggered),
      lat: num(t.lat),
      lng: num(t.lng),
      geofenceZone: t.geofenceZone,
      terrainSlopeDeg: num(t.terrainSlopeDeg),
      engineTempC: num(t.engineTempC),
      hydraulicPressureBar: num(t.hydraulicPressureBar),
      oilPressureBar: num(t.oilPressureBar),
      batteryVoltage: num(t.batteryVoltage),
      rpm: num(t.rpm),
      throttlePct: num(t.throttlePct),
      payloadKg: num(t.payloadKg),
      swingRateDegSec: num(t.swingRateDegSec),
      vibrationEvents: num(t.vibrationEvents),
      ambientTempC: num(t.ambientTempC),
      humidityPct: num(t.humidityPct),
      windKph: num(t.windKph),
      weather: t.weather,
      nearestPersonnelM: num(t.nearestPersonnelM),
      personnelInRadius: num(t.personnelInRadius),
      continuousOperatingMin: num(t.continuousOperatingMin),
      shiftStartTs: new Date(t.shiftStartTs),
      cycleTimeSec: num(t.cycleTimeSec),
      cycleTimeStdRolling: num(t.cycleTimeStdRolling)
    })),
    'telemetry'
  )

  console.log('\nseed complete.')
  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('\nseed failed:', e.message)
  process.exit(1)
})
