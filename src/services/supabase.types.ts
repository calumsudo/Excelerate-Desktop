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
          profit_share_rate: number;
          dividend_rate: number;
        };
        Insert: {
          id?: never;
          name: string;
          profit_share_rate?: number;
          dividend_rate?: number;
        };
        Update: {
          id?: never;
          name?: string;
          profit_share_rate?: number;
          dividend_rate?: number;
        };
        Relationships: [];
      };
      funders: {
        Row: {
          id: number;
          name: string;
          code: string | null;
          sheet_name: string | null;
        };
        Insert: {
          id?: never;
          name: string;
          code?: string | null;
          sheet_name?: string | null;
        };
        Update: {
          id?: never;
          name?: string;
          code?: string | null;
          sheet_name?: string | null;
        };
        Relationships: [];
      };
      portfolio_funders: {
        Row: {
          portfolio_id: number;
          funder_id: number;
          management_fee_rate: number | null;
        };
        Insert: {
          portfolio_id: number;
          funder_id: number;
          management_fee_rate?: number | null;
        };
        Update: {
          portfolio_id?: number;
          funder_id?: number;
          management_fee_rate?: number | null;
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
          date_closed: string | null;
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
          date_closed?: string | null;
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
          date_closed?: string | null;
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
      portfolio_access: {
        Row: {
          user_id: string;
          portfolio_id: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          portfolio_id: number;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          portfolio_id?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portfolio_access_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portfolio_access_portfolio_id_fkey";
            columns: ["portfolio_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
        ];
      };
      funder_uploads: {
        Row: {
          id: string;
          portfolio_id: number;
          funder_id: number;
          report_date: string;
          upload_type: "monthly";
          original_filename: string;
          storage_path: string | null;
          file_size: number | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          portfolio_id: number;
          funder_id: number;
          report_date: string;
          upload_type?: "monthly";
          original_filename: string;
          storage_path?: string | null;
          file_size?: number | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          portfolio_id?: number;
          funder_id?: number;
          report_date?: string;
          upload_type?: "monthly";
          original_filename?: string;
          storage_path?: string | null;
          file_size?: number | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "funder_uploads_portfolio_id_fkey";
            columns: ["portfolio_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "funder_uploads_funder_id_fkey";
            columns: ["funder_id"];
            isOneToOne: false;
            referencedRelation: "funders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "funder_uploads_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      funder_pivot_tables: {
        Row: {
          id: string;
          upload_id: string;
          portfolio_id: number;
          funder_id: number;
          report_date: string;
          total_gross: number;
          total_fee: number;
          total_net: number;
          row_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          upload_id: string;
          portfolio_id: number;
          funder_id: number;
          report_date: string;
          total_gross?: number;
          total_fee?: number;
          total_net?: number;
          row_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          upload_id?: string;
          portfolio_id?: number;
          funder_id?: number;
          report_date?: string;
          total_gross?: number;
          total_fee?: number;
          total_net?: number;
          row_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "funder_pivot_tables_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: true;
            referencedRelation: "funder_uploads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "funder_pivot_tables_portfolio_id_fkey";
            columns: ["portfolio_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "funder_pivot_tables_funder_id_fkey";
            columns: ["funder_id"];
            isOneToOne: false;
            referencedRelation: "funders";
            referencedColumns: ["id"];
          },
        ];
      };
      funder_pivot_rows: {
        Row: {
          id: string;
          pivot_table_id: string;
          advance_id: string | null;
          merchant_name: string;
          gross: number;
          fee: number;
          net: number;
          matched_deal_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pivot_table_id: string;
          advance_id?: string | null;
          merchant_name?: string;
          gross?: number;
          fee?: number;
          net?: number;
          matched_deal_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          pivot_table_id?: string;
          advance_id?: string | null;
          merchant_name?: string;
          gross?: number;
          fee?: number;
          net?: number;
          matched_deal_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "funder_pivot_rows_pivot_table_id_fkey";
            columns: ["pivot_table_id"];
            isOneToOne: false;
            referencedRelation: "funder_pivot_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "funder_pivot_rows_matched_deal_id_fkey";
            columns: ["matched_deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      net_rtr_payments: {
        Row: {
          id: string;
          deal_id: string;
          payment_date: string;
          gross: number;
          fee: number;
          net: number;
          source_upload_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          deal_id: string;
          payment_date: string;
          gross?: number;
          fee?: number;
          net?: number;
          source_upload_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          deal_id?: string;
          payment_date?: string;
          gross?: number;
          fee?: number;
          net?: number;
          source_upload_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "net_rtr_payments_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "net_rtr_payments_source_upload_id_fkey";
            columns: ["source_upload_id"];
            isOneToOne: false;
            referencedRelation: "funder_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      deal_computed: {
        Row: {
          id: string;
          portfolio_id: number | null;
          funder_id: number | null;
          merchant_id: string | null;
          advance_id: string | null;
          funder_advance_id: string | null;
          fico: number | null;
          date_funded: string | null;
          date_closed: string | null;
          is_default: boolean;
          new_dollars: boolean;
          rtr: boolean;
          vintage_month: string | null;
          buy_rate: number | null;
          commission: number | null;
          sell_rate: number | null;
          total_amount_funded: number | null;
          participation_on_amount: number | null;
          management_fee_rate: number;
          commission_dollars: number | null;
          total_rtr: number | null;
          term_months: number | null;
          is_daily: boolean;
          rh_pct_of_deal: number;
          pro_rata_commission: number;
          rh_rtr: number;
          cost_basis: number;
          net_rtr: number | null;
          new_dollars_at_work: number;
          rtr_dollars_at_work: number;
          all_in_factor: number | null;
          points_per_month: number | null;
          gross_payment_expected: number | null;
          net_payment_expected: number | null;
          weekly_payment_expected: number | null;
          total_net_received: number;
          total_gross_received: number;
          total_fee_paid: number;
          net_rtr_balance: number | null;
          pct_rtr_paid: number;
          return_on_cost_basis: number;
          bad_debt_rtr: number | null;
          default_dollars_lost: number | null;
        };
        Relationships: [];
      };
      monthly_vintage_stats: {
        Row: {
          portfolio_id: number | null;
          funder_id: number | null;
          vintage_month: string | null;
          deal_count: number;
          new_invested: number | null;
          rtr_invested: number | null;
          total_participation: number | null;
          total_commissions: number | null;
          cost_basis: number | null;
          initial_net_rtr: number | null;
          weighted_avg_factor: number;
          principal_pct: number;
          profit_pct: number;
          rtr_received: number | null;
          principal_returned: number | null;
          profit_returned: number | null;
          cost_basis_after_principal: number | null;
          cost_basis_final: number | null;
          net_rtr_outstanding: number | null;
          bad_debt_rtr: number | null;
          net_rtr_outstanding_after_bad_debt: number | null;
          expected_weekly_payments: number | null;
          weighted_avg_term_months: number | null;
          avg_cost_basis_per_deal: number;
          vintage_return: number;
          bad_debt_pct: number;
          points_per_month: number | null;
          profit_share: number | null;
          wrc_net: number | null;
          wrc_net_vintage_return: number;
        };
        Relationships: [];
      };
      portfolio_monthly: {
        Row: {
          portfolio_id: number | null;
          vintage_month: string | null;
          deal_count: number;
          new_invested: number | null;
          rtr_invested: number | null;
          total_participation: number | null;
          total_commissions: number | null;
          cost_basis: number | null;
          initial_net_rtr: number | null;
          weighted_avg_factor: number;
          principal_pct: number;
          profit_pct: number;
          rtr_received: number | null;
          principal_returned: number | null;
          profit_returned: number | null;
          cost_basis_after_principal: number | null;
          cost_basis_final: number | null;
          net_rtr_outstanding: number | null;
          bad_debt_rtr: number | null;
          net_rtr_outstanding_after_bad_debt: number | null;
          expected_weekly_payments: number | null;
          weighted_avg_term_months: number | null;
          avg_cost_basis_per_deal: number;
          vintage_return: number;
          bad_debt_pct: number;
          points_per_month: number | null;
          profit_share: number | null;
          wrc_net: number | null;
          wrc_net_vintage_return: number;
          profit_share_rate: number;
          dividend_rate: number;
        };
        Relationships: [];
      };
      weekly_rtr_matrix: {
        Row: {
          portfolio_id: number | null;
          funder_id: number | null;
          payment_date: string;
          total_gross: number | null;
          total_fee: number | null;
          total_net: number | null;
        };
        Relationships: [];
      };
      funder_allocation_current: {
        Row: {
          portfolio_id: number | null;
          funder_id: number | null;
          initial_cost_basis: number | null;
          current_cost_basis: number | null;
          rtr_received: number | null;
          factor: number;
          weighted_avg_term_months: number | null;
          pct_initial_cost_basis: number | null;
          pct_current_cost_basis: number | null;
          weighted_term_contribution: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      has_portfolio_access: {
        Args: { p_portfolio_id: number };
        Returns: boolean;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: "admin" | "member";
    };
  };
}
