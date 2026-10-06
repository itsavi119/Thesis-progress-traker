-- ==============================================================================
-- THESIS CASE TRACKER: PRODUCTION SUPABASE POSTGRESQL SCHEMA & RLS POLICIES
-- ==============================================================================
-- Purpose: Real-time duplicate patient prevention for 3-member research team.
-- Enforces:
-- 1. Database-level UNIQUE constraint on normalized_patient_id
-- 2. Strict 3-member maximum team registration constraint
-- 3. Row Level Security (RLS) restricting status updates to case owners
-- 4. Automatic timestamp tracking and normalized ID generation
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. PROFILES TABLE (Associated with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. ENFORCE MAXIMUM 3 AUTHORIZED RESEARCH MEMBERS
CREATE OR REPLACE FUNCTION check_max_team_members()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM public.profiles) >= 3 THEN
    RAISE EXCEPTION 'Research team limit reached. Only 3 authorized member accounts are permitted.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_enforce_team_limit ON public.profiles;
CREATE TRIGGER tr_enforce_team_limit
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_max_team_members();

-- 4. CASES TABLE
CREATE TABLE IF NOT EXISTS public.cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id TEXT NOT NULL,
  normalized_patient_id TEXT NOT NULL,
  assigned_to UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'In Progress' CHECK (status IN ('In Progress', 'Completed', 'Excluded')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  
  -- MANDATORY DATABASE-LEVEL UNIQUE CONSTRAINT:
  CONSTRAINT uq_cases_normalized_patient_id UNIQUE (normalized_patient_id)
);

-- 5. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_cases_normalized_patient_id ON public.cases(normalized_patient_id);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON public.cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_registered_at ON public.cases(registered_at DESC);

-- 6. AUTOMATIC PATIENT ID NORMALIZATION TRIGGER
CREATE OR REPLACE FUNCTION normalize_case_patient_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Trim whitespace, collapse spaces, convert to uppercase
  NEW.patient_id := trim(both ' ' from NEW.patient_id);
  NEW.normalized_patient_id := upper(regexp_replace(NEW.patient_id, '\s+', ' ', 'g'));
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_normalize_patient_id ON public.cases;
CREATE TRIGGER tr_normalize_patient_id
  BEFORE INSERT OR UPDATE ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION normalize_case_patient_id();

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

-- Profiles: Authenticated users can view all team member profiles
CREATE POLICY "Authenticated members can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Profiles: Authenticated users can insert their own profile
CREATE POLICY "Users can create their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Cases: Authenticated members can view all cases (needed to see duplicates and team cases)
CREATE POLICY "Authenticated members can view cases"
  ON public.cases FOR SELECT
  TO authenticated
  USING (true);

-- Cases: Authenticated members can insert a new case if assigned_to = their user id
CREATE POLICY "Authenticated members can register cases"
  ON public.cases FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = assigned_to);

-- Cases: Only the assigned researcher can update the status of their own case
CREATE POLICY "Members can only update their own case status"
  ON public.cases FOR UPDATE
  TO authenticated
  USING (auth.uid() = assigned_to)
  WITH CHECK (auth.uid() = assigned_to);

-- Cases: Deletion is disallowed for ordinary members
-- No DELETE policy created, preserving immutable research records.
