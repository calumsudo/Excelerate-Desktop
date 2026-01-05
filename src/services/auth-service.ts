import { supabase } from './supabase';
import type { User, Session, AuthError } from '@supabase/supabase-js';

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
  role: 'admin' | 'member';
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
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    return data;
  }

  /**
   * Update user profile
   */
  static async updateUserProfile(
    userId: string,
    updates: { full_name?: string; role?: 'admin' | 'member' }
  ): Promise<{ error: Error | null }> {
    const { error } = await supabase
      .from('user_profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    return { error };
  }

  /**
   * Subscribe to auth state changes
   */
  static onAuthStateChange(
    callback: (event: string, session: Session | null) => void
  ) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  }
}
