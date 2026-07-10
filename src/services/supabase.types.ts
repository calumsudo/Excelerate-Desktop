/**
 * Database type definitions for Supabase
 *
 * Hand-maintained (not auto-generated). Mirrors the live schema baselined in
 * supabase/migrations/ — update this file whenever a migration changes the schema.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: "admin" | "member";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: "admin" | "member";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: "admin" | "member";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      portfolios: {
        Row: {
          id: number;
          name: string;
        };
        Insert: {
          id?: never;
          name: string;
        };
        Update: {
          id?: never;
          name?: string;
        };
        Relationships: [];
      };
      funders: {
        Row: {
          id: number;
          name: string;
          code: string | null;
        };
        Insert: {
          id?: never;
          name: string;
          code?: string | null;
        };
        Update: {
          id?: never;
          name?: string;
          code?: string | null;
        };
        Relationships: [];
      };
      portfolio_funders: {
        Row: {
          portfolio_id: number;
          funder_id: number;
        };
        Insert: {
          portfolio_id: number;
          funder_id: number;
        };
        Update: {
          portfolio_id?: number;
          funder_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "portfolio_funders_portfolio_id_fkey";
            columns: ["portfolio_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portfolio_funders_funder_id_fkey";
            columns: ["funder_id"];
            isOneToOne: false;
            referencedRelation: "funders";
            referencedColumns: ["id"];
          },
        ];
      };
      industries: {
        Row: {
          id: number;
          name: string;
        };
        Insert: {
          id?: never;
          name: string;
        };
        Update: {
          id?: never;
          name?: string;
        };
        Relationships: [];
      };
      states: {
        Row: {
          id: number;
          code: string;
          name: string;
        };
        Insert: {
          id?: never;
          code: string;
          name: string;
        };
        Update: {
          id?: never;
          code?: string;
          name?: string;
        };
        Relationships: [];
      };
      merchants: {
        Row: {
          id: string;
          name: string;
          industry_id: number | null;
          state_id: number | null;
          website: string | null;
          funder_id: number | null;
          portfolio_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          industry_id?: number | null;
          state_id?: number | null;
          website?: string | null;
          funder_id?: number | null;
          portfolio_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          industry_id?: number | null;
          state_id?: number | null;
          website?: string | null;
          funder_id?: number | null;
          portfolio_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "merchants_industry_id_fkey";
            columns: ["industry_id"];
            isOneToOne: false;
            referencedRelation: "industries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "merchants_state_id_fkey";
            columns: ["state_id"];
            isOneToOne: false;
            referencedRelation: "states";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "merchants_funder_id_fkey";
            columns: ["funder_id"];
            isOneToOne: false;
            referencedRelation: "funders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "merchants_portfolio_id_fkey";
            columns: ["portfolio_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
        ];
      };
      deals: {
        Row: {
          id: string;
          merchant_id: string | null;
          portfolio_id: number | null;
          funder_id: number | null;
          advance_id: string | null;
          funder_advance_id: string | null;
          fico: number | null;
          buy_rate: number | null;
          commission: number | null;
          total_amount_funded: number | null;
          num_daily_payments: number | null;
          num_weekly_payments: number | null;
          deal_length_months: number | null;
          participation_on_amount: number | null;
          new_dollars: boolean;
          rtr: boolean;
          is_default: boolean;
          date_funded: string | null;
          default_date: string | null;
          default_notes: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          merchant_id?: string | null;
          portfolio_id?: number | null;
          funder_id?: number | null;
          advance_id?: string | null;
          funder_advance_id?: string | null;
          fico?: number | null;
          buy_rate?: number | null;
          commission?: number | null;
          total_amount_funded?: number | null;
          num_daily_payments?: number | null;
          num_weekly_payments?: number | null;
          deal_length_months?: number | null;
          participation_on_amount?: number | null;
          new_dollars?: boolean;
          rtr?: boolean;
          is_default?: boolean;
          date_funded?: string | null;
          default_date?: string | null;
          default_notes?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          merchant_id?: string | null;
          portfolio_id?: number | null;
          funder_id?: number | null;
          advance_id?: string | null;
          funder_advance_id?: string | null;
          fico?: number | null;
          buy_rate?: number | null;
          commission?: number | null;
          total_amount_funded?: number | null;
          num_daily_payments?: number | null;
          num_weekly_payments?: number | null;
          deal_length_months?: number | null;
          participation_on_amount?: number | null;
          new_dollars?: boolean;
          rtr?: boolean;
          is_default?: boolean;
          date_funded?: string | null;
          default_date?: string | null;
          default_notes?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deals_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_portfolio_id_fkey";
            columns: ["portfolio_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_funder_id_fkey";
            columns: ["funder_id"];
            isOneToOne: false;
            referencedRelation: "funders";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      user_role: "admin" | "member";
    };
  };
}
