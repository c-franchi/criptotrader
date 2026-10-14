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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_wallets: {
        Row: {
          address: string
          created_at: string
          enc_key: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          enc_key: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          enc_key?: string
          user_id?: string
        }
        Relationships: []
      }
      grid_bots: {
        Row: {
          armed: boolean
          gas_reserve_bnb: number
          id: string
          last_error: string | null
          last_level: number | null
          last_price: number | null
          last_run_at: string | null
          levels: number
          lower_price: number
          max_impact_pct: number
          max_slippage_pct: number
          order_bnb: number
          token: string
          updated_at: string
          upper_price: number
          user_id: string
        }
        Insert: {
          armed?: boolean
          gas_reserve_bnb?: number
          id?: string
          last_error?: string | null
          last_level?: number | null
          last_price?: number | null
          last_run_at?: string | null
          levels?: number
          lower_price: number
          max_impact_pct?: number
          max_slippage_pct?: number
          order_bnb: number
          token: string
          updated_at?: string
          upper_price: number
          user_id: string
        }
        Update: {
          armed?: boolean
          gas_reserve_bnb?: number
          id?: string
          last_error?: string | null
          last_level?: number | null
          last_price?: number | null
          last_run_at?: string | null
          levels?: number
          lower_price?: number
          max_impact_pct?: number
          max_slippage_pct?: number
          order_bnb?: number
          token?: string
          updated_at?: string
          upper_price?: number
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_in: string
          amount_out_min: string
          approve_hash: string | null
          block_number: number | null
          created_at: string
          deadline: number
          error: string | null
          id: string
          pair_address: string | null
          quoted_out: string
          side: string
          slippage_pct: number
          source: string
          status: string
          token: string
          tx_hash: string | null
          updated_at: string
          user_id: string
          wallet: string
        }
        Insert: {
          amount_in: string
          amount_out_min: string
          approve_hash?: string | null
          block_number?: number | null
          created_at?: string
          deadline: number
          error?: string | null
          id?: string
          pair_address?: string | null
          quoted_out: string
          side: string
          slippage_pct: number
          source?: string
          status?: string
          token?: string
          tx_hash?: string | null
          updated_at?: string
          user_id: string
          wallet: string
        }
        Update: {
          amount_in?: string
          amount_out_min?: string
          approve_hash?: string | null
          block_number?: number | null
          created_at?: string
          deadline?: number
          error?: string | null
          id?: string
          pair_address?: string | null
          quoted_out?: string
          side?: string
          slippage_pct?: number
          source?: string
          status?: string
          token?: string
          tx_hash?: string | null
          updated_at?: string
          user_id?: string
          wallet?: string
        }
        Relationships: []
      }
      sim_accounts: {
        Row: {
          archived: boolean
          cost_basis: number
          created_at: string
          fees_paid: number
          id: string
          initial_quote: number
          quote_balance: number
          quote_symbol: string
          realized_pnl: number
          token_balance: number
          user_id: string
        }
        Insert: {
          archived?: boolean
          cost_basis?: number
          created_at?: string
          fees_paid?: number
          id?: string
          initial_quote: number
          quote_balance: number
          quote_symbol?: string
          realized_pnl?: number
          token_balance?: number
          user_id: string
        }
        Update: {
          archived?: boolean
          cost_basis?: number
          created_at?: string
          fees_paid?: number
          id?: string
          initial_quote?: number
          quote_balance?: number
          quote_symbol?: string
          realized_pnl?: number
          token_balance?: number
          user_id?: string
        }
        Relationships: []
      }
      sim_trades: {
        Row: {
          account_id: string
          created_at: string
          fee: number
          gas_estimate: number
          id: string
          pair_address: string | null
          price: number
          quote_amount: number
          realized_pnl: number
          reason: string | null
          side: string
          slippage_pct: number
          token_amount: number
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          fee: number
          gas_estimate?: number
          id?: string
          pair_address?: string | null
          price: number
          quote_amount: number
          realized_pnl?: number
          reason?: string | null
          side: string
          slippage_pct: number
          token_amount: number
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          fee?: number
          gas_estimate?: number
          id?: string
          pair_address?: string | null
          price?: number
          quote_amount?: number
          realized_pnl?: number
          reason?: string | null
          side?: string
          slippage_pct?: number
          token_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sim_trades_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "sim_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          config: Json
          id: string
          mode: string
          pair_address: string | null
          status: string
          tracked_wallet: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          config?: Json
          id?: string
          mode?: string
          pair_address?: string | null
          status?: string
          tracked_wallet?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          config?: Json
          id?: string
          mode?: string
          pair_address?: string | null
          status?: string
          tracked_wallet?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
