/**
 * Builds today's roster for every operator without a full reseed.
 * Useful on demo day to reset the board between run-throughs.
 *
 *   node server/src/scripts/build-roster.js
 */
import '../env.js'
import mongoose from 'mongoose'
import { connectDB } from '../db.js'
import { ensureTodaysTasksForAll } from '../services/roster.js'

await connectDB()
const n = await ensureTodaysTasksForAll()
console.log(`today's roster: ${n} tasks across all operators`)
await mongoose.disconnect()
