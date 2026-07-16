-- Product shelf-life tracking: production date, expiry date, and how many days
-- before expiry the product should start showing as "أوشك على الانتهاء".
-- All columns are nullable so existing products keep working untouched —
-- a product with no expiry_date is simply never flagged.
-- Safe to run once on each project.

alter table products add column if not exists production_date date;
alter table products add column if not exists expiry_date date;

-- Per-product override. NULL means "use the store-wide default below".
alter table products add column if not exists expiry_alert_days integer;

-- Store-wide default alert window, used whenever a product leaves
-- expiry_alert_days empty.
alter table store_settings add column if not exists expiry_alert_days integer default 30;

-- The expiry screens and the nightly Telegram digest all filter/sort on
-- expiry_date, skipping the products that never expire.
create index if not exists products_expiry_date_idx
  on products (expiry_date)
  where expiry_date is not null;
