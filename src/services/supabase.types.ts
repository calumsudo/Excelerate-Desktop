/**
 * Database type definitions for Supabase
 * These types are based on the PostgreSQL schema defined in PLAN.md
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: 'admin' | 'member';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: 'admin' | 'member';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: 'admin' | 'member';
          created_at?: string;
          updated_at?: string;
        };
      };
      portfolio_access: {
        Row: {
          id: string;
          user_id: string;
          portfolio_name: string;
          access_level: 'read' | 'write' | 'admin';
          granted_at: string;
          granted_by: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          portfolio_name: string;
          access_level?: 'read' | 'write' | 'admin';
          granted_at?: string;
          granted_by?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          portfolio_name?: string;
          access_level?: 'read' | 'write' | 'admin';
          granted_at?: string;
          granted_by?: string | null;
        };
      };
      file_versions: {
        Row: {
          id: string;
          portfolio_name: string;
          report_date: string;
          original_filename: string;
          version_filename: string;
          file_path: string;
          file_size: number;
          upload_timestamp: string;
          is_active: boolean;
          user_id: string;
        };
        Insert: {
          id?: string;
          portfolio_name: string;
          report_date: string;
          original_filename: string;
          version_filename: string;
          file_path: string;
          file_size: number;
          upload_timestamp?: string;
          is_active?: boolean;
          user_id: string;
        };
        Update: {
          id?: string;
          portfolio_name?: string;
          report_date?: string;
          original_filename?: string;
          version_filename?: string;
          file_path?: string;
          file_size?: number;
          upload_timestamp?: string;
          is_active?: boolean;
          user_id?: string;
        };
      };
      funder_uploads: {
        Row: {
          id: string;
          portfolio_name: string;
          funder_name: string;
          report_date: string;
          upload_type: 'weekly' | 'monthly';
          original_filename: string;
          stored_filename: string;
          file_path: string;
          file_size: number;
          upload_timestamp: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          portfolio_name: string;
          funder_name: string;
          report_date: string;
          upload_type: 'weekly' | 'monthly';
          original_filename: string;
          stored_filename: string;
          file_path: string;
          file_size: number;
          upload_timestamp?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          portfolio_name?: string;
          funder_name?: string;
          report_date?: string;
          upload_type?: 'weekly' | 'monthly';
          original_filename?: string;
          stored_filename?: string;
          file_path?: string;
          file_size?: number;
          upload_timestamp?: string;
          user_id?: string;
        };
      };
      funder_pivot_tables: {
        Row: {
          id: string;
          upload_id: string;
          portfolio_name: string;
          funder_name: string;
          report_date: string;
          upload_type: string;
          pivot_file_path: string;
          total_gross: number;
          total_fee: number;
          total_net: number;
          row_count: number;
          created_timestamp: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          upload_id: string;
          portfolio_name: string;
          funder_name: string;
          report_date: string;
          upload_type: string;
          pivot_file_path: string;
          total_gross: number;
          total_fee: number;
          total_net: number;
          row_count: number;
          created_timestamp?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          upload_id?: string;
          portfolio_name?: string;
          funder_name?: string;
          report_date?: string;
          upload_type?: string;
          pivot_file_path?: string;
          total_gross?: number;
          total_fee?: number;
          total_net?: number;
          row_count?: number;
          created_timestamp?: string;
          user_id?: string;
        };
      };
      merchants: {
        Row: {
          id: string;
          portfolio_name: string;
          funder_name: string;
          date_funded: string | null;
          merchant_name: string;
          website: string | null;
          advance_id: string | null;
          funder_advance_id: string | null;
          industry_naics_or_sic: string | null;
          state: string | null;
          fico: string | null;
          buy_rate: number | null;
          commission: number | null;
          total_amount_funded: number | null;
          created_timestamp: string;
          updated_timestamp: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          portfolio_name: string;
          funder_name: string;
          date_funded?: string | null;
          merchant_name: string;
          website?: string | null;
          advance_id?: string | null;
          funder_advance_id?: string | null;
          industry_naics_or_sic?: string | null;
          state?: string | null;
          fico?: string | null;
          buy_rate?: number | null;
          commission?: number | null;
          total_amount_funded?: number | null;
          created_timestamp?: string;
          updated_timestamp?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          portfolio_name?: string;
          funder_name?: string;
          date_funded?: string | null;
          merchant_name?: string;
          website?: string | null;
          advance_id?: string | null;
          funder_advance_id?: string | null;
          industry_naics_or_sic?: string | null;
          state?: string | null;
          fico?: string | null;
          buy_rate?: number | null;
          commission?: number | null;
          total_amount_funded?: number | null;
          created_timestamp?: string;
          updated_timestamp?: string;
          user_id?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      user_role: 'admin' | 'member';
      access_level: 'read' | 'write' | 'admin';
      upload_type: 'weekly' | 'monthly';
    };
  };
}
