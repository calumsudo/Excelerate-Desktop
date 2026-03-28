export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      deals: {
        Row: {
          advance_id: string | null
          bad_debt_adjustment: number | null
          buy_rate: number | null
          commission_amount: number | null
          commission_rate: number | null
          created_at: string | null
          date_funded: string | null
          default_date: string | null
          fico: string | null
          funder_advance_id: string | null
          funder_code: string
          id: string
          industry_code: string | null
          is_default: boolean | null
          merchant_name: string
          num_daily_payments: number | null
          num_weekly_payments: number | null
          portfolio_name: string
          sell_rate: number | null
          state: string | null
          term_months: number | null
          total_funded_amount: number | null
          total_rtr: number | null
          updated_at: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          advance_id?: string | null
          bad_debt_adjustment?: number | null
          buy_rate?: number | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          date_funded?: string | null
          default_date?: string | null
          fico?: string | null
          funder_advance_id?: string | null
          funder_code: string
          id?: string
          industry_code?: string | null
          is_default?: boolean | null
          merchant_name: string
          num_daily_payments?: number | null
          num_weekly_payments?: number | null
          portfolio_name: string
          sell_rate?: number | null
          state?: string | null
          term_months?: number | null
          total_funded_amount?: number | null
          total_rtr?: number | null
          updated_at?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          advance_id?: string | null
          bad_debt_adjustment?: number | null
          buy_rate?: number | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          date_funded?: string | null
          default_date?: string | null
          fico?: string | null
          funder_advance_id?: string | null
          funder_code?: string
          id?: string
          industry_code?: string | null
          is_default?: boolean | null
          merchant_name?: string
          num_daily_payments?: number | null
          num_weekly_payments?: number | null
          portfolio_name?: string
          sell_rate?: number | null
          state?: string | null
          term_months?: number | null
          total_funded_amount?: number | null
          total_rtr?: number | null
          updated_at?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      file_versions: {
        Row: {
          file_path: string
          file_size: number
          id: string
          is_active: boolean | null
          original_filename: string
          portfolio_name: string
          report_date: string
          upload_timestamp: string | null
          user_id: string
          version_filename: string
        }
        Insert: {
          file_path: string
          file_size: number
          id?: string
          is_active?: boolean | null
          original_filename: string
          portfolio_name: string
          report_date: string
          upload_timestamp?: string | null
          user_id: string
          version_filename: string
        }
        Update: {
          file_path?: string
          file_size?: number
          id?: string
          is_active?: boolean | null
          original_filename?: string
          portfolio_name?: string
          report_date?: string
          upload_timestamp?: string | null
          user_id?: string
          version_filename?: string
        }
        Relationships: []
      }
      funder_pivot_tables: {
        Row: {
          created_timestamp: string | null
          funder_name: string
          id: string
          pivot_file_path: string
          portfolio_name: string
          report_date: string
          row_count: number
          total_fee: number
          total_gross: number
          total_net: number
          upload_id: string
          upload_type: string
          user_id: string
        }
        Insert: {
          created_timestamp?: string | null
          funder_name: string
          id?: string
          pivot_file_path: string
          portfolio_name: string
          report_date: string
          row_count: number
          total_fee: number
          total_gross: number
          total_net: number
          upload_id: string
          upload_type: string
          user_id: string
        }
        Update: {
          created_timestamp?: string | null
          funder_name?: string
          id?: string
          pivot_file_path?: string
          portfolio_name?: string
          report_date?: string
          row_count?: number
          total_fee?: number
          total_gross?: number
          total_net?: number
          upload_id?: string
          upload_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funder_pivot_tables_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "funder_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      funder_uploads: {
        Row: {
          file_path: string
          file_size: number
          funder_name: string
          id: string
          original_filename: string
          portfolio_name: string
          report_date: string
          stored_filename: string
          upload_timestamp: string | null
          upload_type: string
          user_id: string
        }
        Insert: {
          file_path: string
          file_size: number
          funder_name: string
          id?: string
          original_filename: string
          portfolio_name: string
          report_date: string
          stored_filename: string
          upload_timestamp?: string | null
          upload_type: string
          user_id: string
        }
        Update: {
          file_path?: string
          file_size?: number
          funder_name?: string
          id?: string
          original_filename?: string
          portfolio_name?: string
          report_date?: string
          stored_filename?: string
          upload_timestamp?: string | null
          upload_type?: string
          user_id?: string
        }
        Relationships: []
      }
      industries: {
        Row: {
          category: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      merchants: {
        Row: {
          advance_id: string | null
          buy_rate: number | null
          commission: number | null
          created_timestamp: string | null
          date_funded: string | null
          fico: string | null
          funder_advance_id: string | null
          funder_name: string
          id: string
          industry_naics_or_sic: string | null
          merchant_name: string
          portfolio_name: string
          state: string | null
          total_amount_funded: number | null
          updated_timestamp: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          advance_id?: string | null
          buy_rate?: number | null
          commission?: number | null
          created_timestamp?: string | null
          date_funded?: string | null
          fico?: string | null
          funder_advance_id?: string | null
          funder_name: string
          id?: string
          industry_naics_or_sic?: string | null
          merchant_name: string
          portfolio_name: string
          state?: string | null
          total_amount_funded?: number | null
          updated_timestamp?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          advance_id?: string | null
          buy_rate?: number | null
          commission?: number | null
          created_timestamp?: string | null
          date_funded?: string | null
          fico?: string | null
          funder_advance_id?: string | null
          funder_name?: string
          id?: string
          industry_naics_or_sic?: string | null
          merchant_name?: string
          portfolio_name?: string
          state?: string | null
          total_amount_funded?: number | null
          updated_timestamp?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      net_rtr_payments: {
        Row: {
          created_at: string | null
          deal_id: string
          gross_amount: number | null
          id: string
          management_fee: number | null
          net_rtr_amount: number
          report_date: string
        }
        Insert: {
          created_at?: string | null
          deal_id: string
          gross_amount?: number | null
          id?: string
          management_fee?: number | null
          net_rtr_amount: number
          report_date: string
        }
        Update: {
          created_at?: string | null
          deal_id?: string
          gross_amount?: number | null
          id?: string
          management_fee?: number | null
          net_rtr_amount?: number
          report_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "net_rtr_payments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "net_rtr_payments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_access: {
        Row: {
          access_level: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          portfolio_name: string
          user_id: string
        }
        Insert: {
          access_level?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          portfolio_name: string
          user_id: string
        }
        Update: {
          access_level?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          portfolio_name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          role: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      deal_calculations: {
        Row: {
          advance_id: string | null
          bad_debt_adjustment: number | null
          buy_rate: number | null
          commission_amount: number | null
          commission_rate: number | null
          created_at: string | null
          date_funded: string | null
          default_date: string | null
          fico: string | null
          funder_advance_id: string | null
          funder_code: string | null
          id: string | null
          industry_code: string | null
          is_default: boolean | null
          merchant_name: string | null
          num_daily_payments: number | null
          num_weekly_payments: number | null
          portfolio_name: string | null
          rh_cost_basis: number | null
          rh_net_rtr_balance: number | null
          rh_participation_amount: number | null
          rh_pro_rata_rtr: number | null
          sell_rate: number | null
          state: string | null
          term_months: number | null
          total_funded_amount: number | null
          total_net_rtr_received: number | null
          total_paid_pct: number | null
          total_rtr: number | null
          updated_at: string | null
          user_id: string | null
          website: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
