-- Customers see sold-out Products, marked as such, rather than not at all (spec story 19:
-- "I want to see which Products are sold out, so that I don't try to order them"). A
-- Product the dispatcher switches off stays in its place in each Category, so the shop
-- front does not reshuffle every morning. A deleted Product is still gone for good.
--
-- `create or replace` may only append a column, so `available` goes last; the views
-- keep their grants and their access-matrix rows.

create or replace view public.catalog_products as
  select
    p.id,
    p.name,
    p.description,
    p.photo_path,
    p.price_type::text as price_type,
    p.unit_price_centavos,
    p.price_per_kg_centavos,
    p.weight_step_grams,
    p.tolerance_grams,
    p.available
  from app.products p
  where p.deleted_at is null;

comment on view public.catalog_products is
  'The Products a customer browses: every undeleted one, with whether it can be ordered now.';

create or replace view public.catalog_memberships as
  select m.product_id, m.category_id, m.position
  from app.product_categories m
  join app.products p on p.id = m.product_id
  where p.deleted_at is null;

comment on view public.catalog_memberships is
  'Which undeleted Products are in which Category, and each one''s position there.';

-- The notes that said customers never see an unavailable Product.
update app.access_matrix
   set note = 'The customer app lists undeleted Products, sold-out ones marked unavailable.'
 where object_name = 'catalog_products' and actor = 'customer';

update app.access_matrix
   set note = 'Places each undeleted Product in its Categories, in order, sold-out ones too.'
 where object_name = 'catalog_memberships' and actor = 'customer';

update app.access_matrix
   set note = 'Only the dispatcher maintains the catalog''s arrangement. Not granted.'
 where object_name = 'dispatcher_category_products' and actor = 'anon';
