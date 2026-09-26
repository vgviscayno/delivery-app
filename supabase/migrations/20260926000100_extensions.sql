-- Extensions live in the `extensions` schema, never in `public`, so the RLS lint
-- and the access matrix only ever see objects we wrote ourselves.

create extension if not exists postgis with schema extensions;
