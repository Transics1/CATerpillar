# CAT Copilot — Real Device Test Plan

Work through this on a physical phone. Tick each box. Anything that fails, note the step number.

> **Use an Android phone with Chrome.** iOS Safari does not support `navigator.vibrate` at all
> and its speech recognition is unreliable — two of our differentiators will look broken on an
> iPhone through no fault of the code. Test on iPhone too if you have one, but demo on Android.

---

## 0 · Before you pick up the phone

Everything below must be running on the laptop. Check each:

```bash
curl http://127.0.0.1:8000/health
```
```bash
curl http://127.0.0.1:5000/api/health
```

- [ ] ML service (port 8000) responds
- [ ] Node API (port 5000) responds
- [ ] Vite (port 5173) responds
- [ ] Tunnel is up

**Reset to a clean demo state:**
```bash
node server/src/scripts/build-roster.js --reset
```

**If the tunnel died, restart it and regenerate the QR:**
```bash
cloudflared tunnel --url http://localhost:5173
```
```bash
python scripts/demo-qr.py <new-url>
```

> The tunnel hostname changes every run. If you restart it, the old URL is dead — regenerate
> the QR and re-open on the phone.

**Current URL:** `https://webpage-specialized-lectures-affair.trycloudflare.com`
**PINs:** operators `1234` · supervisor `SUP001` / `9999`

---

## 1 · First load (beat 0)

- [ ] Scan the QR — page loads within ~5 seconds
- [ ] No horizontal scrolling anywhere
- [ ] Text is readable **outdoors in daylight** (go outside — this is a real risk we designed for and have never verified)
- [ ] Rotate to landscape and back: layout does not break
- [ ] Chrome menu → **Add to Home screen** works
- [ ] Launch from the home-screen icon: opens fullscreen with no browser chrome, yellow status bar

**Bottleneck to watch:** first paint over the tunnel can be slow on mobile data. Test on both
WiFi and 4G — the venue may have neither working well.

---

## 2 · Login and auth

- [ ] Operator list loads (25 operators + 1 supervisor at the top)
- [ ] Tap a name — PIN pad appears
- [ ] **Keys are comfortably hittable with a thumb.** Try with a glove if you have one
- [ ] Enter a wrong PIN (e.g. `0000`) → "Incorrect ID or PIN", dots clear, you can retry
- [ ] Enter `1234` → lands on Today's Plan without an extra confirm tap
- [ ] **Kill the app and reopen** → still logged in (session persists)
- [ ] Go to **Me → logout** → returns to the operator list

**Bottleneck:** if the PIN pad feels cramped one-handed, that's a design finding — tell me.

---

## 3 · Shift walkaround (beat 1)

Bottom nav → **Shift**

- [ ] Checklist loads with items matching the machine type (an excavator shows track tension,
      hydraulic hoses, bucket teeth — not generic items)
- [ ] "Sign on" button is **disabled** until everything is ticked
- [ ] Tick all items but leave the **seat restraint** unticked → button stays disabled
- [ ] Tick everything → button enables → tap it
- [ ] "Machine cleared" appears in green

**Now test the gate actually blocks.** Untick one item, re-submit:

- [ ] Red panel appears naming **the specific failed item** and "Seat restraint not confirmed"
- [ ] It does not say something vague like "checklist failed"

---

## 4 · Task dashboard (beat 2)

Bottom nav → **Tasks**

- [ ] 4 task cards, numbered, ordered morning → afternoon
- [ ] Each shows a large ETA in minutes
- [ ] The **80% likely range** bar renders with the marker inside the band
- [ ] Driver chips show units — "Volume 48 m3", "Machine age 3 yr", not bare numbers
- [ ] Green chips (down arrow) reduce time, amber chips (up arrow) increase it
- [ ] The "why ordered" line matches reality — if a card says "heaviest morning job", confirm no
      other **morning** card has a bigger number
- [ ] Zone matches the work (Demolition in Zone-D, not Zone-A)

**Bottleneck:** each card triggers an ML call. If the cards take more than ~3 seconds to
appear, the tunnel is adding latency — note it, because it affects the demo's opening.

---

## 5 · Voice command (beat 3)

Still on Tasks. The yellow **mic button** is top-right.

- [ ] Tap it → Chrome asks for microphone permission → **Allow**
- [ ] Button turns red and pulses, "Listening" appears
- [ ] Say **"start trenching"** (or any task type on your list)
- [ ] "Heard: ..." shows your words
- [ ] It speaks "Starting …" and navigates to the live task screen

Go back and try the other intents:

- [ ] "what's my status" → speaks how many tasks and roughly how many hours
- [ ] "log an incident" → navigates to Safety
- [ ] Say something nonsense → speaks "Sorry, I did not catch that"

**Bottlenecks:**
- Mic permission is per-origin. If you restart the tunnel, **the new URL asks again** — grant it
  before the demo, not during.
- Speech recognition needs a network round trip on Chrome. On bad WiFi it will hang. Have the
  tap-to-start path ready as your fallback and don't make voice the first thing you show.
- If nothing is heard, check the phone is not on silent and that Chrome has mic access in
  Android settings.

---

## 6 · Live task: pace + idle (beat 4)

You should be on the live screen after starting a task.

- [ ] Cycle count climbs every ~1.5 seconds
- [ ] Progress bar advances
- [ ] Elapsed / revised ETA / vs-plan all update
- [ ] The pace label **changes over time** — it should not sit on one state the whole run
- [ ] Idle minutes accumulate, and ₹ and kg CO₂ climb with them
- [ ] When idle runs 3+ minutes: **the phone vibrates**, a spoken warning plays, and the idle
      panel border turns amber
- [ ] Lock the screen for ~20 seconds, unlock → numbers have kept moving (they come from the
      server, so they should have)
- [ ] Tap **Finish task** → returns to Today's Plan

**Bottlenecks:**
- **Audio may be silent until you have interacted with the page.** Browsers block autoplay
  audio. Because you tapped "Start task", you should be fine — but if the spoken alert never
  plays, that is why.
- Vibration is **silently unsupported on iOS**. On Android confirm the phone is not in a mode
  that suppresses haptics.
- If numbers freeze, the Socket.IO connection dropped. Check whether the websocket survives the
  tunnel — pull down to refresh and see if it recovers.

---

## 7 · The coaching loop (beat 5) — the important one

Start a task and **leave it running for 30–60 seconds** without touching anything.

- [ ] A red/amber toast slides in from the top with an anomaly (e.g. "Idle 67% of the last 30 minutes")
- [ ] The phone vibrates and speaks the alert
- [ ] Shortly after, a second toast appears: a **lesson**, with "Assigned from your machine data"
- [ ] **Tap the lesson toast** → jumps to Learn
- [ ] The lesson card cites your own telemetry — "You were idle 67% of a 30-minute window · on EXC004"
- [ ] Open it: body text plus 3 quiz questions
- [ ] "Finish lesson" is disabled until every question is answered
- [ ] Answer all → Finish
- [ ] Completion screen shows: quiz %, the sub-score moving (e.g. efficiency 91.4 → 94.4), and
      **"What this is worth"** with a ₹ figure and kg CO₂ per week
- [ ] Go to **Me** → the DNA ring reflects the new score
- [ ] Go to **Tasks** → the ETA numbers have changed slightly (small — around half a percent)

> **This chain is the entire pitch.** If any link breaks, tell me before anything else on this
> list. A lesson that does not cite the operator's own data, or a DNA score that does not move,
> means we do not have a product — we have five screens.

---

## 8 · Offline and sync (beat 6)

Bottom nav → **Safety**. Header should show a green "Synced" pill.

- [ ] Tap **Report an incident**, choose a type and severity
- [ ] Tap **Speak** and dictate a description — text appears in the box
- [ ] Save → green confirmation, report appears in "My reports"

**Now the real test. Turn on airplane mode.**

- [ ] Header switches to amber **"Offline — reports will sync"**
- [ ] File another incident → saves without error, pill shows **"1 queued"**
- [ ] **Refresh the page while still in airplane mode** → the app still loads (this is the
      service worker doing its job — it would have been a blank screen without it)
- [ ] Navigate between tabs offline — nothing crashes, cached screens render

**Turn airplane mode off.**

- [ ] Within a few seconds the pill returns to green "Synced" and the queued count hits 0
- [ ] The incident appears in "My reports" tagged `OFFLINE-QUEUE`

**The duplicate test — do not skip this:**

- [ ] Go offline, file **one** incident, come back online, wait for sync
- [ ] Force-close the app, reopen, go to Safety
- [ ] **Exactly one** copy of that incident exists, not two

---

## 9 · Profile (beat 8 setup)

Bottom nav → **Me**

- [ ] DNA ring renders with the arc matching the number
- [ ] Safety / Efficiency / Skill bars all present with values
- [ ] Trend chart renders (needs 2+ history points — complete a lesson first if empty)
- [ ] "How this is scored" explains each sub-score and the 50/30/20 weighting
- [ ] Lessons-completed count is right

---

## 10 · Report card (beat 8)

Complete at least one task and one lesson first, then **Shift → the document icon** (top right),
or go to `/report`.

- [ ] Tasks done / cycles / flags across the top
- [ ] Idle waste shows minutes, ₹ and kg CO₂ for the shift
- [ ] "Coaching today" lists lessons completed
- [ ] DNA before → after with the delta badge
- [ ] "Tomorrow's estimates adjust …" line appears when DNA moved

---

## 11 · Supervisor (beat 7)

Log out. Log back in as **SUP001 / 9999**.

- [ ] You get the Command Center, **not** the operator bottom nav
- [ ] Four stats: Tasks / Out / Down / To fix
- [ ] Roster lists operators with DNA and load

**Operator goes down:**
- [ ] Tap an operator → sheet offers sick / injured / leave / training
- [ ] Pick one → they jump to the **top** of the roster with a warning triangle
- [ ] Their task chips turn amber; "Out" and "To fix" counters increase

**Reassign:**
- [ ] Tap one of their amber task chips → ranked candidates appear
- [ ] Each candidate shows a score bar and **reasons** ("Certified Loader-L1 · 28 past LOAD jobs")
- [ ] **Sanity-check the top pick**: for a loading job, the leaders should be Loader-L1 certified
      with loader experience. If an uncertified operator is top, that is a bug — tell me
- [ ] Tap a candidate → sheet closes, "To fix" drops by one, the chip leaves that operator
- [ ] Switch to the **Machine** tab in the same sheet → alternative machines of the same type

**Machine goes down:**
- [ ] Machines tab → tap one → report a fault → badge flips to red DOWN, "Down" counter increases
- [ ] Bring it back in service → returns to green UP

**Security check — do this one:**
- [ ] Log out, log in as a normal **operator**, and try to reach `/supervisor` or the admin
      screen. You must not get in. (The API returns 403 — verified — but confirm the UI never
      exposes the route.)

---

## 12 · Two devices at once

Have a second phone or a laptop browser open as a different operator.

- [ ] Both can be logged in simultaneously as different operators
- [ ] Supervisor reassigning a task does not corrupt the other session
- [ ] Alerts go to the right operator only — operator A should not see operator B's anomalies

**Bottleneck:** this is the judge-picks-up-your-phone scenario. Worth 2 minutes.

---

## 13 · Resilience — deliberately break things

These are the ones that will actually happen on stage.

**Kill the ML service** (Ctrl-C the uvicorn process), then load Tasks:
- [ ] Cards still show ETAs and drivers (the Node fallback)
- [ ] Small "estimate from local model" note appears under the card
- [ ] Nothing errors or spins forever
- [ ] Restart the ML service — cards go back to full model predictions

**Kill the Node API**, then use the app:
- [ ] Screens show an error message rather than hanging or going blank
- [ ] Restart it — the app recovers on navigation or refresh

**Restart the tunnel:**
- [ ] Old URL stops working (expected)
- [ ] New URL works after regenerating the QR
- [ ] **Mic permission must be granted again** on the new origin

---

## 14 · Endurance

- [ ] Leave a task running 5+ minutes — no memory issues, numbers keep flowing
- [ ] Use the app continuously for 10 minutes — no crash, no runaway battery drain
- [ ] Background the app for 2 minutes, return — it reconnects rather than sitting frozen

---

## Known limitations — say these before a judge finds them

Be upfront; it reads as engineering judgment rather than a gap.

1. **iOS**: no vibration, unreliable speech recognition. Demo on Android.
2. **The ETA change from one lesson is small (~0.5%)** — because a 90-second lesson genuinely
   does not make someone measurably faster. The honest payoff is fuel, which is why the
   completion screen leads with ₹/week instead.
3. **Proximity is modelled from simulated BLE personnel tags**, not vision. Real sites use
   exactly this approach.
4. **Telemetry is a replay of the generated dataset**, not a live machine feed. The ingestion
   path is real; the source is simulated.
5. **Certifications are randomly assigned in the generator**, so an operator can hold Dozer-L1
   while having loader history. Not visible in the UI today.
6. **Auth is PIN-based** by choice. Real deployment would federate to the site's identity
   provider.

---

## Report back

For anything that fails, give me: **step number, what you expected, what happened, and the
device/browser.** If a screen misbehaves, Chrome DevTools remote debugging over USB will show
the console — that is much faster than guessing.
