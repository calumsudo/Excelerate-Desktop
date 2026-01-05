import { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { AuthService, type UserProfile } from '@services/auth-service';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user profile
  const loadProfile = async (userId: string) => {
    const userProfile = await AuthService.getUserProfile(userId);
    setProfile(userProfile);
  };

  // Refresh profile manually
  const refreshProfile = async () => {
    if (user) {
      await loadProfile(user.id);
    }
  };

  // Sign in function
  const signIn = async (email: string, password: string) => {
    const { user: authUser, session: authSession, error } = await AuthService.signIn({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    if (authUser) {
      setUser(authUser);
      setSession(authSession);
      await loadProfile(authUser.id);
    }
  };

  // Sign up function
  const signUp = async (email: string, password: string, fullName?: string) => {
    const { user: authUser, session: authSession, error } = await AuthService.signUp({
      email,
      password,
      fullName,
    });

    if (error) {
      throw error;
    }

    if (authUser) {
      setUser(authUser);
      setSession(authSession);
      // Profile will be created automatically by the database trigger
      // Wait a bit for the trigger to complete
      setTimeout(() => {
        if (authUser) {
          loadProfile(authUser.id);
        }
      }, 500);
    }
  };

  // Sign out function
  const signOut = async () => {
    const { error } = await AuthService.signOut();
    if (error) {
      throw error;
    }
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  // Initialize auth state on mount
  useEffect(() => {
    // Get initial session
    AuthService.getSession().then((session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = AuthService.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event);
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    user,
    session,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
