/**
 * Builds today's roster, and optionally resets it to a clean pre-demo state.
 *
 *   node server/src/scripts/build-roster.js            # create today's tasks if missing
 *   node server/src/scripts/build-roster.js --reset    # also reset the day for a fresh run
 *
 * The --reset path is what you run between demo rehearsals: every task back to pending,
 * everyone available, every machine up.
 */
import '../env.js'
import mongoose from 'mongoose'
import { connectDB } from '../db.js'
import { ensureTodaysTasksForAll } from '../services/roster.js'
import { Task, Operator, Machine } from '../models/index.js'

const reset = process.argv.includes('--reset')

await connectDB()

if (reset) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tasks = await Task.updateMany(
    { scheduledDate: { $gte: today } },
    {
      $set: { status: 'pending' },
      $unset: { startedAt: 1, completedAt: 1, actualTimeMin: 1 }
    }
  )
  const ops = await Operator.updateMany(
    { available: false },
    { $set: { available: true }, $unset: { unavailability: 1 } }
  )
  const machines = await Machine.updateMany(
    { available: false },
    { $set: { available: true, status: 'idle' }, $unset: { fault: 1 } }
  )

  console.log('reset for demo:')
  console.log(`  ${tasks.modifiedCount} tasks back to pending`)
  console.log(`  ${ops.modifiedCount} operators marked available`)
  console.log(`  ${machines.modifiedCount} machines back in service`)
}

const n = await ensureTodaysTasksForAll()
console.log(`today's roster: ${n} tasks across all operators`)
await mongoose.disconnect()
