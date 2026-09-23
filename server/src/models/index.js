/**
 * All Mongoose schemas in one file — deliberate. Two people navigating one screen during a
 * 6-hour sprint jump between models constantly; eight tiny files costs more than it saves.
 */
import mongoose from 'mongoose'

const { Schema, model } = mongoose

// --------------------------------------------------------------------------- Operator

const dnaShape = {
  safety: { type: Number, default: 70 },
  efficiency: { type: Number, default: 70 },
  skill: { type: Number, default: 70 },
  overall: { type: Number, default: 70 }
}

const operatorSchema = new Schema({
  operatorId: { type: String, required: true, unique: true, index: true },
  name: String,
  language: { type: String, default: 'en' },   // 'en' | 'hi'
  skillLevel: String,                          // Beginner | Intermediate | Expert
  certifications: [String],
  joinDate: Date,
  role: { type: String, default: 'operator', index: true },  // operator | supervisor
  pinHash: String,                             // bcrypt; PINs are never stored in plaintext

  // Availability drives the supervisor's reassignment flow.
  available: { type: Boolean, default: true },
  unavailability: { reason: String, since: Date, note: String },

  dnaScore: dnaShape,
  dnaHistory: [{ date: Date, safety: Number, efficiency: Number, skill: Number, overall: Number }],
  assignedLessons: [String],
  completedLessons: [{ lessonId: String, completedAt: Date, quizScore: Number }]
})

// --------------------------------------------------------------------------- Machine

const machineSchema = new Schema({
  machineId: { type: String, required: true, unique: true, index: true },
  machineType: String,                         // EXC | LOAD | DOZ | GRD
  model: String,
  ageYears: Number,
  attachment: String,
  status: { type: String, default: 'idle' },   // idle | active | maintenance
  available: { type: Boolean, default: true },
  fault: { reason: String, since: Date, note: String },
  lastKnown: { lat: Number, lng: Number, ts: Date }
})

// --------------------------------------------------------------------------- Telemetry
// MongoDB time-series collection: append-only, compressed, and the "industry grade" answer
// when a judge asks how this scales. Note: no unique indexes and no in-place updates.

const telemetrySchema = new Schema(
  {
    timestamp: { type: Date, required: true },
    meta: {
      machineId: String,
      operatorId: String,
      machineType: String
    },
    engineHours: Number,
    fuelUsedL: Number,
    loadCycles: Number,
    idlingTimeMin: Number,
    seatbeltStatus: String,
    safetyAlertTriggered: Boolean,

    lat: Number,
    lng: Number,
    geofenceZone: String,
    terrainSlopeDeg: Number,

    engineTempC: Number,
    hydraulicPressureBar: Number,
    oilPressureBar: Number,
    batteryVoltage: Number,

    rpm: Number,
    throttlePct: Number,
    payloadKg: Number,
    swingRateDegSec: Number,
    vibrationEvents: Number,

    ambientTempC: Number,
    humidityPct: Number,
    windKph: Number,
    weather: String,

    nearestPersonnelM: Number,
    personnelInRadius: Number,

    continuousOperatingMin: Number,
    shiftStartTs: Date,
    cycleTimeSec: Number,
    cycleTimeStdRolling: Number
  },
  {
    timeseries: { timeField: 'timestamp', metaField: 'meta', granularity: 'minutes' },
    autoCreate: true
  }
)

// --------------------------------------------------------------------------- Task

const taskSchema = new Schema({
  taskId: { type: String, required: true, unique: true, index: true },
  taskType: String,
  machineType: String,
  machineId: { type: String, index: true },
  operatorId: { type: String, index: true },
  siteZone: String,
  scheduledDate: { type: Date, index: true },
  shiftPeriod: String,
  weather: String,
  ambientTempC: Number,
  operatorSkill: String,
  machineAgeYrs: Number,
  targetVolumeM3: Number,
  payloadTargetKg: Number,
  terrainType: String,
  terrainSlope: Number,
  estimatedTimeMin: Number,
  actualTimeMin: Number,
  interruptions: Number,
  status: { type: String, default: 'pending' },   // pending | active | done
  startedAt: Date,
  completedAt: Date
})

// --------------------------------------------------------------------------- Incident
// clientId is generated on the PHONE and uniquely indexed. This is what makes the offline
// queue replay idempotent — without it, one reconnect duplicates every queued incident.

const incidentSchema = new Schema({
  clientId: { type: String, required: true, unique: true, index: true },
  operatorId: { type: String, index: true },
  machineId: String,
  type: String,
  severity: { type: String, default: 'medium' },   // low | medium | high
  rawText: String,
  description: String,
  lat: Number,
  lng: Number,
  photoUrl: String,
  occurredAt: Date,
  syncedAt: Date,
  source: { type: String, default: 'online' }      // online | offline-queue
})

// --------------------------------------------------------------------------- Anomaly

const anomalySchema = new Schema({
  anomalyId: { type: String, index: true },
  operatorId: { type: String, index: true },
  machineId: String,
  type: String,
  severity: String,
  detectedAt: { type: Date, default: Date.now },
  window: { from: Date, to: Date },
  evidence: Schema.Types.Mixed,
  lessonAssigned: String,
  source: String                                   // rule | model
})

// --------------------------------------------------------------------------- Lesson

const lessonSchema = new Schema({
  lessonId: { type: String, required: true, unique: true, index: true },
  title: String,
  durationSec: Number,
  forAnomalyType: { type: String, index: true },
  videoUrl: String,
  body: String,
  quiz: [{ q: String, options: [String], answerIndex: Number }]
})

// --------------------------------------------------------------------------- Shift

const shiftSchema = new Schema({
  shiftId: { type: String, index: true },
  operatorId: { type: String, index: true },
  machineId: String,
  startedAt: Date,
  endedAt: Date,
  checklist: [{ item: String, passed: Boolean, note: String }],
  checklistPhotoUrl: String,
  seatbeltConfirmed: Boolean
})

// ---------------------------------------------------------------------------

export const Operator = model('Operator', operatorSchema)
export const Machine = model('Machine', machineSchema)
export const Telemetry = model('Telemetry', telemetrySchema)
export const Task = model('Task', taskSchema)
export const Incident = model('Incident', incidentSchema)
export const Anomaly = model('Anomaly', anomalySchema)
export const Lesson = model('Lesson', lessonSchema)
export const Shift = model('Shift', shiftSchema)
