-- Study Mate: run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- Replace your project and set up tables + Row Level Security

-- Profiles: store name and role for each auth user
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup (run once)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'student'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Courses
CREATE TABLE IF NOT EXISTS public.courses (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

-- User courses (which courses a user is enrolled in)
CREATE TABLE IF NOT EXISTS public.user_courses (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, course_id)
);

-- Groups
CREATE TABLE IF NOT EXISTS public.groups (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    course TEXT NOT NULL,
    goal TEXT NOT NULL,
    max_members INT NOT NULL,
    description TEXT,
    created_by_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Group members (user_id -> profiles so we can join for display names)
CREATE TABLE IF NOT EXISTS public.group_members (
    group_id BIGINT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, user_id)
);

-- Ratings (peer reviews)
CREATE TABLE IF NOT EXISTS public.ratings (
    id BIGSERIAL PRIMARY KEY,
    rater_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rated_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    group_id BIGINT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    rating INT NOT NULL,
    review TEXT,
    date DATE NOT NULL
);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Places (study locations)
CREATE TABLE IF NOT EXISTS public.places (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    added_by_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default courses
INSERT INTO public.courses (code, name) VALUES
  ('CS101', 'Introduction to Computer Science'),
  ('MATH201', 'Calculus II'),
  ('PHYS150', 'Physics Fundamentals')
ON CONFLICT (code) DO NOTHING;

-- Row Level Security: enable on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

-- Policies: profiles (users can read all profiles for listing, update own)
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Courses: everyone can read; authenticated can insert
CREATE POLICY "Courses are viewable by everyone" ON public.courses FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert courses" ON public.courses FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- User courses: own only
CREATE POLICY "Users can view own user_courses" ON public.user_courses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own user_courses" ON public.user_courses FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Groups: everyone can read (for discovery); authenticated can insert
CREATE POLICY "Groups are viewable by everyone" ON public.groups FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert groups" ON public.groups FOR INSERT WITH CHECK (auth.uid() = created_by_id);

-- Group members: members can read; authenticated can insert
CREATE POLICY "Users can view group_members" ON public.group_members FOR SELECT USING (true);
CREATE POLICY "Authenticated can join groups" ON public.group_members FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Ratings: read own or for groups you're in; insert when authenticated
CREATE POLICY "Users can view ratings" ON public.ratings FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert ratings" ON public.ratings FOR INSERT WITH CHECK (auth.uid() = rater_id);

-- Notifications: own only
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- Places: everyone can read; authenticated can insert
CREATE POLICY "Places are viewable by everyone" ON public.places FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert places" ON public.places FOR INSERT WITH CHECK (auth.uid() = added_by_id);
