# Questions for the business owner — getting paid, and orders that go wrong

For ticket [47 — How the shop gets paid, and its exposure on packed goods](https://github.com/vgviscayno/delivery-app/issues/47).
Written to be sent as-is. No technical vocabulary.

---

Hi,

Three more, and these are the ones we should have asked at the start. They're about money — not about
the app handling any, which it won't, but about how you already get paid, because it turns out that
changes decisions we're making elsewhere.

## 1. How does a customer pay you today?

Tick whatever actually happens, and say roughly how often if it's a mix:

**(a) Cash, handed to the driver at the door.**

**(b) Bank transfer or GCash, before the driver sets off.**

**(c) Bank transfer or GCash, after delivery — same day, next day, whenever they get to it.**

**(d) An account.** Regular customers who are billed weekly or monthly and settle in one go.

**(e) Something else** — tell us what.

*Why we're asking:* the answer decides what we do with an order that has already been cut and packed
when something goes wrong.

If the customer has already paid, delivering it anyway is safe — worst case they're mildly annoyed. If
they pay cash at the door, the same delivery is a real risk: they can simply refuse the bag, and you're
holding meat you cut for them that nobody else ordered.

We've already hit this once and had to take the cautious route — cancelling an order rather than
delivering it — purely because we didn't know the answer. That was the right call that time. It won't
always be available.

## 2. Does the driver handle money?

**(a) Yes** — they take cash, and settle up with the shop at the end of the day.

**(b) No** — money never touches the driver.

*Why we're asking:* if your driver is carrying cash, the phone they're holding is also, in effect, a
till. That raises the stakes on a few things we've designed loosely — who's signed into the phone, what
gets recorded when goods come back undelivered, and what proof you want at the door.

## 3. What happens now when a customer won't take the delivery?

Not a design question — we want to know what your shop does today. The customer is at the door and says
no: wrong day, changed their mind, not what they expected, nobody told them the price went up.

- Does this happen? Once a month, twice a year, never?
- What does the driver do — ring the shop, bring it back, leave it anyway?
- Does the customer still owe you for it?

*Why we're asking:* the app currently has no answer for a driver standing at a door with a bag the
customer won't take. There's no button for it, because nobody has told us what the right button would
do. Whatever you already do is almost certainly the right thing to build.

---

*One thing worth saying plainly:* none of this means the app starts handling payments. It won't take
card details, it won't charge anyone, and it won't move money. We're asking because the app has to
decide when it's safe to deliver an order and when it isn't — and that turns entirely on whether you've
already been paid.

Thanks.
