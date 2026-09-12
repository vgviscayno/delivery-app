# Questions for the business owner — how drivers work

For ticket [34 — Driver shift and availability model](../issues/34-driver-shift-and-availability-model.md).
Written to be sent as-is. No technical vocabulary; every option is stated in shop terms.

---

Hi,

We're designing the driver side of the delivery app and have run into four things only you
can answer. They're about how the shop actually runs, not about technology. Rough answers are
fine — "it depends, for example…" is even better than a firm rule.

## 1. Your drivers and their hours

How many drivers do you have?

Do they work set hours — say 8am to 5pm — or do they come in when there's work to do?

And at the end of the day, does the company phone go home with the driver, or does it stay at
the shop?

*Why we're asking:* almost everything below changes depending on whether "the working day" is a
fixed thing or a loose one.

## 2. Should a driver tell the app when they've started work?

Two ways of doing it:

**(a) The driver clocks in.** They tap "Start work" when they begin for the day and "Finish
work" when they're done.

**(b) The app works it out by itself.** If the driver's phone is on and they aren't already out
with orders, the app treats them as ready for a job.

*Why we're asking:* option (b) is one less thing for the driver to remember — but the app can't
tell the difference between "on lunch", "at the dentist" and "ready for the next job", so your
office may send someone a delivery when they aren't actually there to take it. Option (a) is one
tap at each end of the day, and in exchange your office gets an honest picture of who's around.

*What we'd suggest:* **(a)**.

## 3. When a driver isn't carrying an order, should the office see where they are?

As things stand, a driver only appears on the office map while they're actually out delivering
something. Between jobs they disappear from it.

The catch: when a new order comes in, your office wants to send it to whoever is nearest — and
it can't work out who's nearest among drivers it can't see.

**(a) Visible for the whole working day** — from "Start work" to "Finish work", and never
outside those hours.

**(b) Visible only during an actual delivery** — your office picks a driver by name and by
memory rather than by who's closest.

*Worth knowing either way:* the app keeps **no record of anywhere a driver has been**. Nothing is
saved and there's no history to look back through — only where somebody is right now, and only
while it matters. It cannot be used to review someone's day after the fact.

*What we'd suggest:* **(a)** — but this one is yours as the employer rather than ours, and it's
the kind of thing your drivers should hear directly from you.

## 4. How many orders can one driver carry at once?

A driver can be given several deliveries at a time and decide themselves which to drop off next.
Is there a number that's simply too many — because the van is full, or because it gets confusing?

**(a) A hard limit.** The app refuses to give a driver a sixth order (or whatever the number is).

**(b) No limit.** The app shows your office how many each driver is already carrying, and the
person assigning the work decides.

*Why we're asking:* any limit we set now is a guess. If we guess low, it blocks your dispatcher
on your busiest day; if we guess high, it does nothing at all.

*What we'd suggest:* **(b)** for now — then set a real number later, once you've seen how much
actually fits in a van.

Thanks.
