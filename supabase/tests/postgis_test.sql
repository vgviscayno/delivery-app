-- PostGIS. Every Address is a pin -- a point on the map the customer placed themselves,
-- and what a driver actually navigates to -- so the geography type has to be installed,
-- and installed in `extensions` where the RLS lint and the access matrix never see it.
-- Nothing else asserted this: the extension could stop installing and every other test
-- would still pass.

begin;
select plan(3);

select is(
  (select n.nspname
     from pg_extension e
     join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'postgis'),
  'extensions',
  'postgis is installed, in the extensions schema'
);

-- A pin survives the round trip. Rizal Park, to four decimal places.
select is(
  extensions.st_astext(
    extensions.st_setsrid(extensions.st_makepoint(120.9842, 14.5995), 4326)::extensions.geography
  ),
  'POINT(120.9842 14.5995)',
  'a pin round-trips through the geography type'
);

-- Distances come back in metres on the spheroid, not in degrees on a flat plane: one
-- degree of latitude is about 110.6 km anywhere on Earth.
select ok(
  extensions.st_distance(
    extensions.st_setsrid(extensions.st_makepoint(120.9842, 14.5995), 4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(120.9842, 15.5995), 4326)::extensions.geography
  ) between 110000 and 111000,
  'geography measures a degree of latitude in metres, about 110.6 km'
);

select * from finish();
rollback;
