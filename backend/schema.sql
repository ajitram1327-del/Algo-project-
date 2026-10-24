-- 1. Create vehicle profiles table with grey-box calibration parameters
create table public.vehicle_profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique not null,
  variant_id text not null,
  registration_year int not null,
  initial_odometer_km double precision default 0.0,
  current_odometer_km double precision default 0.0,
  
  -- Grey-Box Calibration Scalars
  driver_aggression_factor double precision default 1.0,
  crr_offset double precision default 0.0,
  calibrated_capacity_kwh double precision not null,
  trips_completed int default 0,
  confidence_score double precision default 0.35,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create historical trip telematics log
create table public.trip_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  origin_name text,
  destination_name text,
  distance_km double precision not null,
  gross_energy_kwh double precision not null,
  initial_soc double precision not null,
  predicted_soc double precision not null,
  actual_soc double precision,
  soc_variance double precision,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Row Level Security (RLS) Configuration
alter table public.vehicle_profiles enable row level security;
alter table public.trip_logs enable row level security;

create policy "Users can read own vehicle profile"
  on public.vehicle_profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert own vehicle profile"
  on public.vehicle_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own vehicle profile"
  on public.vehicle_profiles for update
  using (auth.uid() = user_id);

create policy "Users can read own trip logs"
  on public.trip_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own trip logs"
  on public.trip_logs for insert
  with check (auth.uid() = user_id);
