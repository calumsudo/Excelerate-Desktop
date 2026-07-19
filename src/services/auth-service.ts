import { supabase, createStatelessAuthClient } from "./supabase";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import type { Database } from "./supabase.types";
type UserProfileUpdate = Database["public"]["Tables"]["user_profiles"]["Update"];

export interface SignUpCredentials {
  email: string;
  password: string;
  fullName?: string;
}

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: AuthError | null;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "member";
  created_at: string;
  updated_at: string;
}

/**
 * Authentication Service
 * Handles all authentication operations with Supabase
 */
export class AuthService {
  /**
   * Sign up a new user with email and password
   */
  static async signUp(credentials: SignUpCredentials): Promise<AuthResponse> {
    const { email, password, fullName } = credentials;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    return {
      user: data.user,
      session: data.session,
      error,
    };
  }

  /**
   * Sign in an existing user with email and password
   */
  static async signIn(credentials: SignInCredentials): Promise<AuthResponse> {
    const { email, password } = credentials;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return {
      user: data.user,
      session: data.session,
      error,
    };
  }

  /**
   * Create an account for an invited user WITHOUT signing them in here.
   * Uses a stateless client so the inviting admin's session is untouched.
   */
  static async inviteUser(invite: {
    email: string;
    password: string;
    fullName: string;
    role: "admin" | "member";
  }): Promise<{ userId: string | null; error: Error | null }> {
    const inviteClient = createStatelessAuthClient();

    const { data, error } = await inviteClient.auth.signUp({
      email: invite.email,
      password: invite.password,
      options: {
        data: {
          full_name: invite.fullName,
        },
      },
    });

    if (error) {
      return { userId: null, error };
    }

    const newUser = data.user;
    if (!newUser) {
      return { userId: null, error: new Error("Failed to create user account") };
    }

    // Supabase returns an obfuscated user with no identities when the email
    // is already registered (to prevent enumeration).
    if (newUser.identities && newUser.identities.length === 0) {
      return { userId: null, error: new Error("This email is already registered.") };
    }

    // Drop the throwaway session from memory; ignore errors (there is no
    // session at all when email confirmation is enabled).
    await inviteClient.auth.signOut({ scope: "local" }).catch(() => undefined);

    // The profile row is created by the on_auth_user_created trigger with
    // role 'member'; promote via the admin's own session if requested.
    if (invite.role === "admin") {
      const { data: updated, error: roleError } = await supabase
        .from("user_profiles")
        .update({ role: "admin", updated_at: new Date().toISOString() })
        .eq("id", newUser.id)
        .select("id");

      if (roleError || !updated || updated.length === 0) {
        return {
          userId: newUser.id,
          error: new Error(
            "User was created but could not be made an admin. You can change their role from User Management."
          ),
        };
      }
    }

    return { userId: newUser.id, error: null };
  }

  /**
   * Verify a user's current password without touching the app session.
   */
  static async verifyPassword(email: string, password: string): Promise<boolean> {
    const checkClient = createStatelessAuthClient();
    const { error } = await checkClient.auth.signInWithPassword({ email, password });
    if (!error) {
      await checkClient.auth.signOut({ scope: "local" }).catch(() => undefined);
      return true;
    }
    return false;
  }

  /**
   * Sign out the current user
   */
  static async signOut(): Promise<{ error: AuthError | null }> {
    const { error } = await supabase.auth.signOut();
    return { error };
  }

  /**
   * Get the current session
   */
  static async getSession(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession();
    return data.session;
  }

  /**
   * Get the current user
   */
  static async getCurrentUser(): Promise<User | null> {
    const { data } = await supabase.auth.getUser();
    return data.user;
  }

  /**
   * Reset password for a user
   */
  static async resetPassword(email: string): Promise<{ error: AuthError | null }> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  }

  /**
   * Update user password
   */
  static async updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error };
  }

  /**
   * Get user profile from the database
   */
  static async getUserProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching user profile:", error);
      return null;
    }

    return data;
  }

  /**
   * Update user profile
   */
  static async updateUserProfile(
    userId: string,
    updates: { full_name?: string; role?: "admin" | "member" }
  ): Promise<{ error: Error | null }> {
    const payload: UserProfileUpdate = {
      ...updates,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("user_profiles").update(payload).eq("id", userId);
    return { error };
  }

  /**
   * Subscribe to auth state changes
   */
  static onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  }
}
