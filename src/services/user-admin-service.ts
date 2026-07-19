import { supabase } from "./supabase";
import type { UserProfile } from "./auth-service";

export interface PortfolioSummary {
  id: number;
  name: string;
}

export interface PortfolioAccessEntry {
  user_id: string;
  portfolio_id: number;
}

/**
 * Admin-only user management operations. All of these are gated by RLS:
 * non-admins get empty results / rejected writes.
 */
export class UserAdminService {
  static async listUsers(): Promise<UserProfile[]> {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }
    return data ?? [];
  }

  static async listPortfolios(): Promise<PortfolioSummary[]> {
    const { data, error } = await supabase
      .from("portfolios")
      .select("id, name")
      .eq("is_deleted", false)
      .order("id", { ascending: true });

    if (error) {
      throw error;
    }
    return data ?? [];
  }

  static async listPortfolioAccess(): Promise<PortfolioAccessEntry[]> {
    const { data, error } = await supabase.from("portfolio_access").select("user_id, portfolio_id");

    if (error) {
      throw error;
    }
    return data ?? [];
  }

  static async setUserRole(userId: string, role: "admin" | "member"): Promise<void> {
    const { data, error } = await supabase
      .from("user_profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id");

    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      throw new Error("Role change was not applied — you may not have permission.");
    }
  }

  static async grantPortfolioAccess(userId: string, portfolioId: number): Promise<void> {
    const { error } = await supabase
      .from("portfolio_access")
      .upsert({ user_id: userId, portfolio_id: portfolioId });

    if (error) {
      throw error;
    }
  }

  static async revokePortfolioAccess(userId: string, portfolioId: number): Promise<void> {
    const { error } = await supabase
      .from("portfolio_access")
      .delete()
      .eq("user_id", userId)
      .eq("portfolio_id", portfolioId);

    if (error) {
      throw error;
    }
  }

  /**
   * Permanently delete a user. Removes the auth account, which cascades to
   * their profile and portfolio access. Admin-only and enforced server-side
   * by the admin_delete_user RPC (which also blocks deleting yourself).
   */
  static async deleteUser(userId: string): Promise<void> {
    const { error } = await supabase.rpc("admin_delete_user", { target_id: userId });

    if (error) {
      throw error;
    }
  }
}
