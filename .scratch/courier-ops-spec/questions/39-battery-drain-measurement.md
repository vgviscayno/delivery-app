# Battery drain measurement — protocol and recording sheet

For ticket [39 — Battery drain measurement on pilot handsets](https://github.com/vgviscayno/delivery-app/issues/39).

This is the agent's half of the ticket: what to run, in what order, and what to write down.
The runs themselves need a real handset and a real working day, so a person has to do them.

---

## What this is actually for

Ticket 03 picked a background-location library on the strength of its docs and found **no primary
source** for any battery figure. Ticket 07 then set a cadence — roughly a 40–50 m distance filter
while the driver is moving, a 60-second heartbeat while parked — on the same absence of numbers.
Ticket 34 widened it further: capture now runs for the **whole duty period, 08:00–16:00**, not just
while a driver is carrying something, so a quiet day is ~8 hours of the 60-second heartbeat.

So there are two questions, and the second one matters more than the first:

1. **How much battery does a duty day cost?**
2. **Did the phone keep reporting all day, or did Android quietly kill it?**

A handset that ends the day at 60% having stopped reporting at 11:40 is a **failure**, not a good
result. Android's OEM battery optimisation is the known culprit, and ticket 18 found there is **no
way to switch it off remotely** — someone has to tap it off on each handset during kitting. This
exercise is what tells us whether that manual step is worth keeping on the checklist.

## What you need

- One pilot handset, the exact model the drivers will carry — not a spare of a different make.
- The driver app installed, the driver logged in, location permission granted as "Allow all the time".
- A vehicle charger and cable that fit the handset (for Run C).
- A way to see whether the dispatcher console showed that driver continuously through the day.
  Watching it live is fine; so is checking at the times listed below.

## Before you start any run

Charge to **100%** overnight and unplug at the start. Note the **screen-on brightness** and leave it
alone across all three runs — a brighter screen will swamp the thing we're trying to measure. Don't
use the handset for anything else: no browsing, no calls, no music. It sits in the vehicle cradle
the way it would on a real day.

## The three runs

Do them on three separate days, in this order. Stop early if Run C is clean — that's the answer.

### Run A — worst case

OEM battery optimisation **left on** (the factory default). **No charger.** Driver on duty
08:00–16:00. If the day is quiet and no deliveries happen, that's ideal: idle-but-on-duty is the
condition we know least about and the one that now dominates a slow day.

This run exists to find the floor. Expect it to look bad.

### Run B — the kitting step, on its own

OEM battery optimisation **turned off** for the driver app (the kitting-checklist step from ticket
18). Still **no charger**. Same 08:00–16:00 day.

Run B minus Run A is the value of that manual step. If the difference is small *and* Run A never
dropped out, the step can come off the checklist.

### Run C — the intended setup

OEM battery optimisation **off**, handset **in the vehicle charger** for the whole duty period, the
way it will actually be used. The handsets stay with the vehicles overnight rather than going home,
so this is close to free to arrange.

**"Ends the day at 40% but it's plugged in anyway" is a perfectly good outcome.** Record it as the
answer rather than treating it as a problem to solve.

## What to write down

Fill one sheet per run.

### Run sheet

| Field | Value |
| --- | --- |
| Run (A / B / C) | |
| Date | |
| Handset make and model | |
| Android version | |
| Battery optimisation for the driver app | on / off |
| In-vehicle charger | yes / no |
| Screen brightness setting | |
| Battery % at 08:00 (unplugged) | |
| Battery % at 16:00 | |
| Deliveries carried that day | |
| Roughly how much of the day was spent parked | |

### Hourly check

The percentages are secondary. **The "driver visible on the console?" column is the one that
decides things** — a No anywhere in it is the real finding.

| Time | Battery % | Driver visible on console? | Notes |
| --- | --- | --- | --- |
| 08:00 | | | start |
| 10:00 | | | |
| 12:00 | | | |
| 14:00 | | | |
| 16:00 | | | end |

### Anything odd

Write down anything the handset did that you didn't expect — a battery warning, the app appearing
to restart, the driver's dot freezing on the console and then jumping, the phone getting hot in a
cradle in the sun. Free text is fine. These are usually more useful than the numbers.

## What happens with the answers

Three outcomes, and only one of them is expensive:

- **A duty day fits comfortably on one charge, or the charger makes it a non-issue.** Nothing on
  the map changes. Ticket 07's cadence stands.
- **The battery holds up but the app stopped reporting at some point.** That's not a cadence
  problem — it's an OEM-optimisation problem, and it makes the ticket 18 kitting step mandatory
  rather than optional. It may also need chasing with the library's own documentation for that
  manufacturer.
- **The battery genuinely can't last a duty day even plugged in.** Only then does ticket 07's
  cadence get reopened, as its own ticket. Don't change any cadence numbers off the back of this
  sheet — just record what happened.
