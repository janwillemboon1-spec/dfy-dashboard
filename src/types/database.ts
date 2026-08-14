export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      action_log: {
        Row: {
          aangemaakt_op: string
          datum: string
          id: string
          listing_id: string
          omschrijving: string
          toegevoegd_door: string | null
          type: string
        }
        Insert: {
          aangemaakt_op?: string
          datum: string
          id?: string
          listing_id: string
          omschrijving: string
          toegevoegd_door?: string | null
          type?: string
        }
        Update: {
          aangemaakt_op?: string
          datum?: string
          id?: string
          listing_id?: string
          omschrijving?: string
          toegevoegd_door?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_log_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_log_toegevoegd_door_fkey"
            columns: ["toegevoegd_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      airbnb_funnel_nulmeting: {
        Row: {
          bijgewerkt_op: string
          conversie_advertentie_naar_boeking: number | null
          conversie_zoekopdracht_naar_advertentie: number | null
          gemiddeld_conversiepercentage: number | null
          id: string
          listing_id: string
          nulmeting_datum: string | null
          percentage_zoekvertoningen_eerste_pagina: number | null
        }
        Insert: {
          bijgewerkt_op?: string
          conversie_advertentie_naar_boeking?: number | null
          conversie_zoekopdracht_naar_advertentie?: number | null
          gemiddeld_conversiepercentage?: number | null
          id?: string
          listing_id: string
          nulmeting_datum?: string | null
          percentage_zoekvertoningen_eerste_pagina?: number | null
        }
        Update: {
          bijgewerkt_op?: string
          conversie_advertentie_naar_boeking?: number | null
          conversie_zoekopdracht_naar_advertentie?: number | null
          gemiddeld_conversiepercentage?: number | null
          id?: string
          listing_id?: string
          nulmeting_datum?: string | null
          percentage_zoekvertoningen_eerste_pagina?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "airbnb_funnel_nulmeting_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          aangemaakt_op: string
          email: string
          id: string
          naam: string
          status: Database["public"]["Enums"]["client_status"]
          telefoon: string | null
          zelf_geregistreerd: boolean
        }
        Insert: {
          aangemaakt_op?: string
          email: string
          id?: string
          naam: string
          status?: Database["public"]["Enums"]["client_status"]
          telefoon?: string | null
          zelf_geregistreerd?: boolean
        }
        Update: {
          aangemaakt_op?: string
          email?: string
          id?: string
          naam?: string
          status?: Database["public"]["Enums"]["client_status"]
          telefoon?: string | null
          zelf_geregistreerd?: boolean
        }
        Relationships: []
      }
      listings: {
        Row: {
          aangemaakt_op: string
          adres: string | null
          airbnb_url: string | null
          client_id: string
          id: string
          naam: string
          pricelabs_listing_id: string | null
          samenwerking_gestart: string | null
        }
        Insert: {
          aangemaakt_op?: string
          adres?: string | null
          airbnb_url?: string | null
          client_id: string
          id?: string
          naam: string
          pricelabs_listing_id?: string | null
          samenwerking_gestart?: string | null
        }
        Update: {
          aangemaakt_op?: string
          adres?: string | null
          airbnb_url?: string | null
          client_id?: string
          id?: string
          naam?: string
          pricelabs_listing_id?: string | null
          samenwerking_gestart?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_actuals: {
        Row: {
          bezetting: number
          id: string
          jaar: number
          laatst_gesynchroniseerd: string
          listing_id: string
          maand: number
          omzet: number
        }
        Insert: {
          bezetting: number
          id?: string
          jaar: number
          laatst_gesynchroniseerd?: string
          listing_id: string
          maand: number
          omzet: number
        }
        Update: {
          bezetting?: number
          id?: string
          jaar?: number
          laatst_gesynchroniseerd?: string
          listing_id?: string
          maand?: number
          omzet?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_actuals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      nulmeting: {
        Row: {
          bezetting: number
          correctie_reden: string | null
          id: string
          jaar: number
          laatst_gecorrigeerd_op: string | null
          listing_id: string
          maand: number
          omzet: number
          vastgesteld_op: string
        }
        Insert: {
          bezetting: number
          correctie_reden?: string | null
          id?: string
          jaar: number
          laatst_gecorrigeerd_op?: string | null
          listing_id: string
          maand: number
          omzet: number
          vastgesteld_op?: string
        }
        Update: {
          bezetting?: number
          correctie_reden?: string | null
          id?: string
          jaar?: number
          laatst_gecorrigeerd_op?: string | null
          listing_id?: string
          maand?: number
          omzet?: number
          vastgesteld_op?: string
        }
        Relationships: [
          {
            foreignKeyName: "nulmeting_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      pricelabs_listings_cache: {
        Row: {
          adres: string | null
          id: string
          laatst_gesynchroniseerd: string | null
          naam: string
          pms: string | null
          pricelabs_listing_id: string
        }
        Insert: {
          adres?: string | null
          id?: string
          laatst_gesynchroniseerd?: string | null
          naam: string
          pms?: string | null
          pricelabs_listing_id: string
        }
        Update: {
          adres?: string | null
          id?: string
          laatst_gesynchroniseerd?: string | null
          naam?: string
          pms?: string | null
          pricelabs_listing_id?: string
        }
        Relationships: []
      }
      pricelabs_reserveringen_cache: {
        Row: {
          booking_channel: string | null
          booking_status: string
          check_in: string
          check_out: string
          id: string
          laatst_gesynchroniseerd: string
          listing_id: string
          no_of_days: number
          rental_revenue: number
          reservation_id: string
          total_cost: number | null
        }
        Insert: {
          booking_channel?: string | null
          booking_status: string
          check_in: string
          check_out: string
          id?: string
          laatst_gesynchroniseerd?: string
          listing_id: string
          no_of_days: number
          rental_revenue: number
          reservation_id: string
          total_cost?: number | null
        }
        Update: {
          booking_channel?: string | null
          booking_status?: string
          check_in?: string
          check_out?: string
          id?: string
          laatst_gesynchroniseerd?: string
          listing_id?: string
          no_of_days?: number
          rental_revenue?: number
          reservation_id?: string
          total_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pricelabs_reserveringen_cache_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aangemaakt_op: string
          client_id: string | null
          email: string
          id: string
          naam: string
          role: Database["public"]["Enums"]["profile_role"]
        }
        Insert: {
          aangemaakt_op?: string
          client_id?: string | null
          email: string
          id: string
          naam: string
          role?: Database["public"]["Enums"]["profile_role"]
        }
        Update: {
          aangemaakt_op?: string
          client_id?: string | null
          email?: string
          id?: string
          naam?: string
          role?: Database["public"]["Enums"]["profile_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      voortgang_activiteitenlog: {
        Row: {
          aangemaakt_op: string
          client_id: string
          datum: string
          id: string
          listing_id: string | null
          omschrijving: string
          toegevoegd_door: string | null
        }
        Insert: {
          aangemaakt_op?: string
          client_id: string
          datum: string
          id?: string
          listing_id?: string | null
          omschrijving: string
          toegevoegd_door?: string | null
        }
        Update: {
          aangemaakt_op?: string
          client_id?: string
          datum?: string
          id?: string
          listing_id?: string | null
          omschrijving?: string
          toegevoegd_door?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voortgang_activiteitenlog_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voortgang_activiteitenlog_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voortgang_activiteitenlog_toegevoegd_door_fkey"
            columns: ["toegevoegd_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voortgang_checklist_items: {
        Row: {
          aangemaakt_op: string
          afgevinkt: boolean
          client_id: string
          fase_nummer: number
          id: string
          listing_id: string | null
          naam: string
          toegevoegd_door: string | null
        }
        Insert: {
          aangemaakt_op?: string
          afgevinkt?: boolean
          client_id: string
          fase_nummer: number
          id?: string
          listing_id?: string | null
          naam: string
          toegevoegd_door?: string | null
        }
        Update: {
          aangemaakt_op?: string
          afgevinkt?: boolean
          client_id?: string
          fase_nummer?: number
          id?: string
          listing_id?: string | null
          naam?: string
          toegevoegd_door?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voortgang_checklist_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voortgang_checklist_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voortgang_checklist_items_toegevoegd_door_fkey"
            columns: ["toegevoegd_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voortgang_fasen: {
        Row: {
          bijgewerkt_op: string
          client_id: string
          fase_nummer: number
          id: string
          percentage: number
        }
        Insert: {
          bijgewerkt_op?: string
          client_id: string
          fase_nummer: number
          id?: string
          percentage?: number
        }
        Update: {
          bijgewerkt_op?: string
          client_id?: string
          fase_nummer?: number
          id?: string
          percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "voortgang_fasen_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      voortgang_todos: {
        Row: {
          aangemaakt_op: string
          afgevinkt: boolean
          client_id: string
          deadline: string
          id: string
          listing_id: string | null
          naam: string
          toegevoegd_door: string | null
        }
        Insert: {
          aangemaakt_op?: string
          afgevinkt?: boolean
          client_id: string
          deadline: string
          id?: string
          listing_id?: string | null
          naam: string
          toegevoegd_door?: string | null
        }
        Update: {
          aangemaakt_op?: string
          afgevinkt?: boolean
          client_id?: string
          deadline?: string
          id?: string
          listing_id?: string | null
          naam?: string
          toegevoegd_door?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voortgang_todos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voortgang_todos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voortgang_todos_toegevoegd_door_fkey"
            columns: ["toegevoegd_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_client_with_listings: { Args: { payload: Json }; Returns: string }
      current_client_id: { Args: never; Returns: string }
      delete_client_cascade: {
        Args: { target_client_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      standaard_checklist_items: {
        Args: never
        Returns: {
          fase_nummer: number
          naam: string
        }[]
      }
    }
    Enums: {
      client_status: "onboarding" | "actief" | "gepauzeerd" | "opgezegd"
      profile_role: "admin" | "klant"
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
    Enums: {
      client_status: ["onboarding", "actief", "gepauzeerd", "opgezegd"],
      profile_role: ["admin", "klant"],
    },
  },
} as const

