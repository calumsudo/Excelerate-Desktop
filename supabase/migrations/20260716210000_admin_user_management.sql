-- Admin user management.
--
-- user_profiles RLS only allowed users to see/update their own row, so an
-- admin could not list users or change anyone's role. Additionally the
-- "Users can update own profile" policy let a member set role = 'admin' on
-- their own row; a trigger now restricts role changes to admins.

CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Block role changes by non-admins. auth.uid() IS NULL covers service-role
-- and migration contexts, which bypass RLS but still fire triggers.
CREATE OR REPLACE FUNCTION public.enforce_admin_role_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_admin_role_change
  BEFORE UPDATE OF role ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_admin_role_change();

-- Delete a user outright. Deleting the auth.users row cascades to
-- user_profiles (user_profiles_id_fkey ON DELETE CASCADE) and from there to
-- portfolio_access. Runs as SECURITY DEFINER (owner: postgres) because the
-- authenticated role has no direct DELETE on auth.users; the is_admin() gate
-- keeps it admin-only, and admins cannot delete themselves.
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  DELETE FROM auth.users WHERE id = target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
