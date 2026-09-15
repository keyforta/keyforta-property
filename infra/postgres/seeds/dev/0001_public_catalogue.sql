-- Synthetic development records only. Never replace these values with real data.

select set_config(
  'app.organization_id',
  '00000000-0000-4000-8000-000000000100',
  true
);

insert into app.organizations (id, name)
values ('00000000-0000-4000-8000-000000000100', 'KEYFORTA Démonstration')
on conflict (id) do update set name = excluded.name;

insert into app.properties (id, organization_id, name, address)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000100', 'Résidence Gombe Démo', 'Adresse synthétique Gombe'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000100', 'Résidence Limete Démo', 'Adresse synthétique Limete'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000100', 'Résidence Ngaliema Démo', 'Adresse synthétique Ngaliema')
on conflict (id) do update set
  name = excluded.name,
  address = excluded.address;

insert into app.units (id, organization_id, property_id, label)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000201', 'Appartement 2 chambres'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000202', 'Maison familiale'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000203', 'Studio sécurisé')
on conflict (id) do update set label = excluded.label;

insert into app.public_listings (
  id, organization_id, unit_id, slug, title, summary, city, district,
  bedrooms, bathrooms, area_square_meters, monthly_rent_minor, currency,
  available_from, amenities, image_urls, status, published_at
)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000100',
    '00000000-0000-4000-8000-000000000301',
    'appartement-gombe-2-chambres', 'Appartement 2 chambres',
    'Appartement lumineux de deux chambres, proche des services essentiels.',
    'Kinshasa', 'Gombe', 2, 1, 72, 40000, 'USD', '2026-10-01',
    array['Eau', 'Électricité', 'Parking'],
    array['/images/keyforta-home.jpg'], 'published', '2026-09-10T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000100',
    '00000000-0000-4000-8000-000000000302',
    'maison-limete-3-chambres', 'Maison familiale avec cour',
    'Maison familiale de trois chambres avec cour et alimentation électrique de secours.',
    'Kinshasa', 'Limete', 3, 2, 128, 65000, 'USD', '2026-10-15',
    array['Eau', 'Électricité', 'Cour', 'Groupe électrogène'],
    array['/images/keyforta-home.jpg'], 'published', '2026-09-10T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000100',
    '00000000-0000-4000-8000-000000000303',
    'studio-ngaliema', 'Studio dans une parcelle sécurisée',
    'Studio fonctionnel dans une parcelle sécurisée, adapté à une personne ou un couple.',
    'Kinshasa', 'Ngaliema', 1, 1, 38, 25000, 'USD', '2026-11-01',
    array['Eau', 'Électricité', 'Gardiennage'],
    array['/images/keyforta-home.jpg'], 'published', '2026-09-10T00:00:00Z'
  )
on conflict (id) do update set
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  city = excluded.city,
  district = excluded.district,
  bedrooms = excluded.bedrooms,
  bathrooms = excluded.bathrooms,
  area_square_meters = excluded.area_square_meters,
  monthly_rent_minor = excluded.monthly_rent_minor,
  currency = excluded.currency,
  available_from = excluded.available_from,
  amenities = excluded.amenities,
  image_urls = excluded.image_urls,
  status = excluded.status,
  published_at = excluded.published_at,
  updated_at = now();