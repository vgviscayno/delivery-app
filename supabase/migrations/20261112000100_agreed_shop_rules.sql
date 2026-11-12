-- The shop rules the client agreed on 11 Nov 2026 (#126), so production starts with them
-- rather than empty. The dispatcher can still change every one from the console; this
-- only sets where they start, so a value or weekday someone has already set is kept.
--
-- The Shop phone and the QR Ph image stay empty: nobody has supplied them yet, and the
-- seed still fills in placeholders for local and preview work.

update app.shop_settings
   set delivery_radius_meters = coalesce(delivery_radius_meters, 5000),
       delivery_fee_centavos = coalesce(delivery_fee_centavos, 5000),
       time_confirmation_cutoff = coalesce(time_confirmation_cutoff, '10:00')
 where id;

-- Monday to Sunday, 08:00-16:00: the drivers' working day, every day of the week.
insert into app.ordering_hours (weekday, opens_at, closes_at)
select weekday, '08:00', '16:00'
from generate_series(1, 7) as weekday
on conflict (weekday) do nothing;
