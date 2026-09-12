# Which number does the dispatcher call for price approval?

Type: grilling
Status: open
Blocked by: —
Map: ../map.md

## Question

Ticket 28 built the entire packed-weight **Price approval** flow around a dispatcher **phoning the customer** — but at the time it was charted, no phone number existed anywhere in the system (ticket 09 chose email+password for customers, deliberately avoiding SMS costs). Ticket 33 has now created one, so 28's flow finally has a number to dial. The problem is that it may be the wrong number.

Ticket 33 put `contact_phone` on the **Address**, on the reasoning that "Mama's house" has a different person to call on arrival than the account holder. That reasoning is sound for *arrival*. It is not obviously sound for *price approval*, which is a **commercial consent** — agreeing to a revised total, or declining lines — recorded per `docs/adr/0005` as a dispatcher assertion with an approved-total snapshot.

The conflict is concrete: a customer sends meat to their mother's house. The packer finds a 400 g excess on the ribeye. Under ticket 33's record as it stands, the dispatcher calls **Mama**, who did not place the Order, does not know what was agreed, and is not the person paying.

Open:

- **Does the customer profile gain a phone number after all**, used for price-approval calls, separate from the Address's arrival contact? This partially reopens ticket 09's "no phone" decision — though only as stored *contact* data, never as an auth factor, which is the distinction ticket 33 already drew.
- **Or is one number enough**, with the address contact accepted as the approval contact? Cheaper, and correct for the common case where the customer is the recipient.
- **Or does the dispatcher choose at call time**, seeing both numbers labelled by role?
- **Does the answer change the record `docs/adr/0005` keeps?** It stores who the dispatcher spoke to only as free text today. If the approver can be someone other than the account holder, that record may need to say *which* number was reached.
- **Is there a third caller path** — ticket 18's driver, standing at a door that doesn't exist — that wants a different number again?

**Amends:** ticket 28 (and possibly `docs/adr/0005`), ticket 09, ticket 33.
