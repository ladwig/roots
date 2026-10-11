
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "api_keys": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"key_hash": string,"last_used_at": string | null,"name": string,"org_id": string,"permissions": (string)[],"prefix": string,"revoked_at": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"key_hash": string,"last_used_at"?: string | null,"name": string,"org_id": string,"permissions"?: (string)[],"prefix": string,"revoked_at"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"key_hash"?: string,"last_used_at"?: string | null,"name"?: string,"org_id"?: string,"permissions"?: (string)[],"prefix"?: string,"revoked_at"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_keys_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"artists": {
                  Row: {
                    "contact_id": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"description": string | null,"id": string,"links": (string)[],"name": string,"notes": string | null,"org_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"description"?: string | null,"id"?: string,"links"?: (string)[],"name": string,"notes"?: string | null,"org_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"description"?: string | null,"id"?: string,"links"?: (string)[],"name"?: string,"notes"?: string | null,"org_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "artists_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "artists_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"at": string,"id": number,"new": Json | null,"old": Json | null,"org_id": string | null,"row_id": string,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"at"?: string,"id"?: never,"new"?: Json | null,"old"?: Json | null,"org_id"?: string | null,"row_id": string,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"at"?: string,"id"?: never,"new"?: Json | null,"old"?: Json | null,"org_id"?: string | null,"row_id"?: string,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contact_notes": {
                  Row: {
                    "body": string,"contact_id": string,"created_at": string,"created_by": string | null,"id": string,"org_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"contact_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"org_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "body"?: string,"contact_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"org_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_notes_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_notes_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"contacts": {
                  Row: {
                    "birthday": string | null,"city": string | null,"company": string | null,"country": string | null,"created_at": string,"created_by": string | null,"custom": NonNullable<Json>,"deleted_at": string | null,"deleted_by": string | null,"email": string | null,"first_name": string | null,"id": string,"last_name": string | null,"org_id": string,"phone": string | null,"postal_code": string | null,"street": string | null,"tags": (string)[],"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "birthday"?: string | null,"city"?: string | null,"company"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"custom"?: NonNullable<Json>,"deleted_at"?: string | null,"deleted_by"?: string | null,"email"?: string | null,"first_name"?: string | null,"id"?: string,"last_name"?: string | null,"org_id": string,"phone"?: string | null,"postal_code"?: string | null,"street"?: string | null,"tags"?: (string)[],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "birthday"?: string | null,"city"?: string | null,"company"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"custom"?: NonNullable<Json>,"deleted_at"?: string | null,"deleted_by"?: string | null,"email"?: string | null,"first_name"?: string | null,"id"?: string,"last_name"?: string | null,"org_id"?: string,"phone"?: string | null,"postal_code"?: string | null,"street"?: string | null,"tags"?: (string)[],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"custom_fields": {
                  Row: {
                    "created_at": string,"created_by": string | null,"entity": string,"id": string,"key": string,"label": string,"options": (string)[],"org_id": string,"position": number,"required": boolean,"type": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"entity": string,"id"?: string,"key": string,"label": string,"options"?: (string)[],"org_id": string,"position"?: number,"required"?: boolean,"type": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"entity"?: string,"id"?: string,"key"?: string,"label"?: string,"options"?: (string)[],"org_id"?: string,"position"?: number,"required"?: boolean,"type"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "custom_fields_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"document_items": {
                  Row: {
                    "created_at": string,"created_by": string | null,"description": string | null,"document_id": string,"id": string,"org_id": string,"position": number,"quantity": number,"tax_rate": number,"title": string,"unit": string,"unit_price": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string | null,"document_id": string,"id"?: string,"org_id": string,"position": number,"quantity"?: number,"tax_rate"?: number,"title": string,"unit": string,"unit_price": number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string | null,"document_id"?: string,"id"?: string,"org_id"?: string,"position"?: number,"quantity"?: number,"tax_rate"?: number,"title"?: string,"unit"?: string,"unit_price"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_items_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_items_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "cancelled_at": string | null,"contact_id": string | null,"created_at": string,"created_by": string | null,"currency": string,"due_date": string | null,"gross_total": number,"id": string,"intro": string | null,"issue_date": string | null,"issued_at": string | null,"kind": string,"net_total": number,"notes": string | null,"number": string | null,"org_id": string,"outro": string | null,"paid_at": string | null,"recipient_address": string | null,"recipient_email": string | null,"recipient_name": string | null,"recipient_vat_id": string | null,"seller": Json | null,"service_from": string | null,"service_to": string | null,"source_id": string | null,"status": string,"tax_mode": string,"tax_total": number,"title": string | null,"updated_at": string,"updated_by": string | null,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_at"?: string | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"due_date"?: string | null,"gross_total"?: number,"id"?: string,"intro"?: string | null,"issue_date"?: string | null,"issued_at"?: string | null,"kind": string,"net_total"?: number,"notes"?: string | null,"number"?: string | null,"org_id": string,"outro"?: string | null,"paid_at"?: string | null,"recipient_address"?: string | null,"recipient_email"?: string | null,"recipient_name"?: string | null,"recipient_vat_id"?: string | null,"seller"?: Json | null,"service_from"?: string | null,"service_to"?: string | null,"source_id"?: string | null,"status"?: string,"tax_mode"?: string,"tax_total"?: number,"title"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"valid_until"?: string | null
                  }
                  Update: {
                    "cancelled_at"?: string | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"due_date"?: string | null,"gross_total"?: number,"id"?: string,"intro"?: string | null,"issue_date"?: string | null,"issued_at"?: string | null,"kind"?: string,"net_total"?: number,"notes"?: string | null,"number"?: string | null,"org_id"?: string,"outro"?: string | null,"paid_at"?: string | null,"recipient_address"?: string | null,"recipient_email"?: string | null,"recipient_name"?: string | null,"recipient_vat_id"?: string | null,"seller"?: Json | null,"service_from"?: string | null,"service_to"?: string | null,"source_id"?: string | null,"status"?: string,"tax_mode"?: string,"tax_total"?: number,"title"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"event_deliveries": {
                  Row: {
                    "attempts": number,"channel": string | null,"created_at": string,"delivered_at": string | null,"event_id": number,"id": number,"last_error": string | null,"next_attempt_at": string,"org_id": string | null,"status": string,"subscription_id": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"channel"?: string | null,"created_at"?: string,"delivered_at"?: string | null,"event_id": number,"id"?: never,"last_error"?: string | null,"next_attempt_at"?: string,"org_id"?: string | null,"status"?: string,"subscription_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"channel"?: string | null,"created_at"?: string,"delivered_at"?: string | null,"event_id"?: number,"id"?: never,"last_error"?: string | null,"next_attempt_at"?: string,"org_id"?: string | null,"status"?: string,"subscription_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_deliveries_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "hub_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_deliveries_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_deliveries_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "event_subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"event_slots": {
                  Row: {
                    "artist_id": string | null,"created_at": string,"created_by": string | null,"ends_at": string | null,"event_id": string,"id": string,"notes": string | null,"org_id": string,"public": boolean,"stage": string | null,"starts_at": string,"title": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "artist_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string | null,"event_id": string,"id"?: string,"notes"?: string | null,"org_id": string,"public"?: boolean,"stage"?: string | null,"starts_at": string,"title"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "artist_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string | null,"event_id"?: string,"id"?: string,"notes"?: string | null,"org_id"?: string,"public"?: boolean,"stage"?: string | null,"starts_at"?: string,"title"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_slots_artist_id_fkey"
      columns: ["artist_id"]
isOneToOne: false
      referencedRelation: "artists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_slots_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_slots_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"event_subscriptions": {
                  Row: {
                    "active": boolean,"channel": string,"config": NonNullable<Json>,"created_at": string,"created_by": string | null,"event_types": (string)[],"id": string,"name": string,"org_id": string,"secret_id": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"channel": string,"config"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"event_types"?: (string)[],"id"?: string,"name": string,"org_id": string,"secret_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"channel"?: string,"config"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"event_types"?: (string)[],"id"?: string,"name"?: string,"org_id"?: string,"secret_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_subscriptions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "capacity": number | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"description": string | null,"ends_at": string | null,"id": string,"image_path": string | null,"location_id": string | null,"max_tickets_per_order": number,"org_id": string,"published_at": string | null,"slug": string,"starts_at": string,"status": string,"ticket_names": string,"title": string,"updated_at": string,"updated_by": string | null,"venue_address": string | null,"venue_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity"?: number | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"description"?: string | null,"ends_at"?: string | null,"id"?: string,"image_path"?: string | null,"location_id"?: string | null,"max_tickets_per_order"?: number,"org_id": string,"published_at"?: string | null,"slug": string,"starts_at": string,"status"?: string,"ticket_names"?: string,"title": string,"updated_at"?: string,"updated_by"?: string | null,"venue_address"?: string | null,"venue_name"?: string | null
                  }
                  Update: {
                    "capacity"?: number | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"description"?: string | null,"ends_at"?: string | null,"id"?: string,"image_path"?: string | null,"location_id"?: string | null,"max_tickets_per_order"?: number,"org_id"?: string,"published_at"?: string | null,"slug"?: string,"starts_at"?: string,"status"?: string,"ticket_names"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"venue_address"?: string | null,"venue_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_org_id_fkey1"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"guest_checkins": {
                  Row: {
                    "checked_in_at": string,"checked_in_by": string | null,"created_at": string,"created_by": string | null,"entry_id": string,"event_id": string,"id": string,"org_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_in_at"?: string,"checked_in_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"entry_id": string,"event_id": string,"id"?: string,"org_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "checked_in_at"?: string,"checked_in_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"entry_id"?: string,"event_id"?: string,"id"?: string,"org_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "guest_checkins_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "guest_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guest_checkins_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guest_checkins_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"guest_entries": {
                  Row: {
                    "added_via": string,"created_at": string,"created_by": string | null,"email": string | null,"id": string,"list_id": string,"name": string,"note": string | null,"org_id": string,"submitted_by": string | null,"ticket_id": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_via"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"list_id": string,"name": string,"note"?: string | null,"org_id": string,"submitted_by"?: string | null,"ticket_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "added_via"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"list_id"?: string,"name"?: string,"note"?: string | null,"org_id"?: string,"submitted_by"?: string | null,"ticket_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "guest_entries_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "guest_lists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guest_entries_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guest_entries_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"guest_lists": {
                  Row: {
                    "artist_id": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"door_price": number,"event_id": string | null,"id": string,"link_closes_at": string | null,"link_enabled": boolean,"link_token": string | null,"name": string,"notes": string | null,"org_id": string,"per_submission": number,"quota": number | null,"ticket_type_id": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "artist_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"door_price"?: number,"event_id"?: string | null,"id"?: string,"link_closes_at"?: string | null,"link_enabled"?: boolean,"link_token"?: string | null,"name": string,"notes"?: string | null,"org_id": string,"per_submission"?: number,"quota"?: number | null,"ticket_type_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "artist_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"door_price"?: number,"event_id"?: string | null,"id"?: string,"link_closes_at"?: string | null,"link_enabled"?: boolean,"link_token"?: string | null,"name"?: string,"notes"?: string | null,"org_id"?: string,"per_submission"?: number,"quota"?: number | null,"ticket_type_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "guest_lists_artist_id_fkey"
      columns: ["artist_id"]
isOneToOne: false
      referencedRelation: "artists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guest_lists_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guest_lists_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guest_lists_ticket_type_id_fkey"
      columns: ["ticket_type_id"]
isOneToOne: false
      referencedRelation: "ticket_types"
      referencedColumns: ["id"]
    }
                  ]
                },"hub_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"id": number,"org_id": string | null,"payload": NonNullable<Json>,"routed_at": string | null,"subject_id": string | null,"subject_table": string | null,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"id"?: never,"org_id"?: string | null,"payload"?: NonNullable<Json>,"routed_at"?: string | null,"subject_id"?: string | null,"subject_table"?: string | null,"type": string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"id"?: never,"org_id"?: string | null,"payload"?: NonNullable<Json>,"routed_at"?: string | null,"subject_id"?: string | null,"subject_table"?: string | null,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_events": {
                  Row: {
                    "attempts": number,"error": string | null,"external_id": string,"id": number,"org_id": string | null,"payload": NonNullable<Json>,"processed_at": string | null,"provider": string,"received_at": string,"type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"error"?: string | null,"external_id": string,"id"?: never,"org_id"?: string | null,"payload": NonNullable<Json>,"processed_at"?: string | null,"provider": string,"received_at"?: string,"type"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"error"?: string | null,"external_id"?: string,"id"?: never,"org_id"?: string | null,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"provider"?: string,"received_at"?: string,"type"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"invites": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"created_by": string | null,"email": string,"expires_at": string,"id": string,"org_id": string,"role_id": string,"token_hash": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"email": string,"expires_at"?: string,"id"?: string,"org_id": string,"role_id": string,"token_hash": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string,"expires_at"?: string,"id"?: string,"org_id"?: string,"role_id"?: string,"token_hash"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invites_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "address": string | null,"created_at": string,"created_by": string | null,"id": string,"name": string,"notes": string | null,"org_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"org_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"org_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "locations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "channel": string,"enabled": boolean,"event_type": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": string,"enabled": boolean,"event_type": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "channel"?: string,"enabled"?: boolean,"event_type"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"event_id": number,"id": number,"org_id": string | null,"read_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": number,"id"?: never,"org_id"?: string | null,"read_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: number,"id"?: never,"org_id"?: string | null,"read_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "hub_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"number_ranges": {
                  Row: {
                    "created_at": string,"created_by": string | null,"format": string,"id": string,"kind": string,"next_number": number,"org_id": string,"updated_at": string,"updated_by": string | null,"year": number | null,"yearly_reset": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"format": string,"id"?: string,"kind": string,"next_number"?: number,"org_id": string,"updated_at"?: string,"updated_by"?: string | null,"year"?: number | null,"yearly_reset"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"format"?: string,"id"?: string,"kind"?: string,"next_number"?: number,"org_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"year"?: number | null,"yearly_reset"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "number_ranges_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"org_billing": {
                  Row: {
                    "bank_name": string | null,"bic": string | null,"city": string | null,"country": string,"created_at": string,"created_by": string | null,"email": string | null,"iban": string | null,"id": string,"invoice_intro": string | null,"invoice_outro": string | null,"legal_name": string | null,"org_id": string,"payment_days": number,"phone": string | null,"postal_code": string | null,"quote_days": number,"quote_intro": string | null,"quote_outro": string | null,"register": string | null,"representatives": string | null,"street": string | null,"tax_mode": string,"tax_number": string | null,"template": string,"updated_at": string,"updated_by": string | null,"vat_id": string | null,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bank_name"?: string | null,"bic"?: string | null,"city"?: string | null,"country"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"iban"?: string | null,"id"?: string,"invoice_intro"?: string | null,"invoice_outro"?: string | null,"legal_name"?: string | null,"org_id": string,"payment_days"?: number,"phone"?: string | null,"postal_code"?: string | null,"quote_days"?: number,"quote_intro"?: string | null,"quote_outro"?: string | null,"register"?: string | null,"representatives"?: string | null,"street"?: string | null,"tax_mode"?: string,"tax_number"?: string | null,"template"?: string,"updated_at"?: string,"updated_by"?: string | null,"vat_id"?: string | null,"website"?: string | null
                  }
                  Update: {
                    "bank_name"?: string | null,"bic"?: string | null,"city"?: string | null,"country"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"iban"?: string | null,"id"?: string,"invoice_intro"?: string | null,"invoice_outro"?: string | null,"legal_name"?: string | null,"org_id"?: string,"payment_days"?: number,"phone"?: string | null,"postal_code"?: string | null,"quote_days"?: number,"quote_intro"?: string | null,"quote_outro"?: string | null,"register"?: string | null,"representatives"?: string | null,"street"?: string | null,"tax_mode"?: string,"tax_number"?: string | null,"template"?: string,"updated_at"?: string,"updated_by"?: string | null,"vat_id"?: string | null,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_billing_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"org_integrations": {
                  Row: {
                    "config": NonNullable<Json>,"created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"last_error": string | null,"org_id": string,"provider": string,"secret_id": string | null,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"last_error"?: string | null,"org_id": string,"provider": string,"secret_id"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"last_error"?: string | null,"org_id"?: string,"provider"?: string,"secret_id"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_integrations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"org_members": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"org_id": string,"role_id": string,"updated_at": string,"updated_by": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"org_id": string,"role_id": string,"updated_at"?: string,"updated_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"org_id"?: string,"role_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_members_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"org_modules": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"module_key": string,"org_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"module_key": string,"org_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"module_key"?: string,"org_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_modules_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"orgs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"id": string,"logo_path": string | null,"name": string,"settings": NonNullable<Json>,"slug": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"logo_path"?: string | null,"name": string,"settings"?: NonNullable<Json>,"slug": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"logo_path"?: string | null,"name"?: string,"settings"?: NonNullable<Json>,"slug"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"pay_order_items": {
                  Row: {
                    "created_at": string,"created_by": string | null,"description": string,"id": string,"metadata": NonNullable<Json>,"order_id": string,"org_id": string,"quantity": number,"source_id": string | null,"unit_amount": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"description": string,"id"?: string,"metadata"?: NonNullable<Json>,"order_id": string,"org_id": string,"quantity": number,"source_id"?: string | null,"unit_amount": number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"order_id"?: string,"org_id"?: string,"quantity"?: number,"source_id"?: string | null,"unit_amount"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pay_order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "pay_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pay_order_items_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"pay_orders": {
                  Row: {
                    "amount_total": number,"application_fee": number,"created_at": string,"created_by": string | null,"currency": string,"customer_email": string | null,"customer_name": string | null,"expires_at": string | null,"fulfilled_at": string | null,"id": string,"metadata": NonNullable<Json>,"org_id": string,"paid_at": string | null,"provider": string | null,"source_id": string | null,"source_module": string,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_total": number,"application_fee"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_email"?: string | null,"customer_name"?: string | null,"expires_at"?: string | null,"fulfilled_at"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"org_id": string,"paid_at"?: string | null,"provider"?: string | null,"source_id"?: string | null,"source_module": string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount_total"?: number,"application_fee"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_email"?: string | null,"customer_name"?: string | null,"expires_at"?: string | null,"fulfilled_at"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"org_id"?: string,"paid_at"?: string | null,"provider"?: string | null,"source_id"?: string | null,"source_module"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pay_orders_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"pay_payments": {
                  Row: {
                    "amount": number,"application_fee": number,"created_at": string,"created_by": string | null,"id": string,"order_id": string,"org_id": string,"provider": string,"provider_payment_ref": string | null,"provider_ref": string,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"application_fee"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"order_id": string,"org_id": string,"provider": string,"provider_payment_ref"?: string | null,"provider_ref": string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"application_fee"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"order_id"?: string,"org_id"?: string,"provider"?: string,"provider_payment_ref"?: string | null,"provider_ref"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pay_payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "pay_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pay_payments_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"pay_refunds": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"id": string,"org_id": string,"payment_id": string,"provider_ref": string | null,"reason": string | null,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"org_id": string,"payment_id": string,"provider_ref"?: string | null,"reason"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"org_id"?: string,"payment_id"?: string,"provider_ref"?: string | null,"reason"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pay_refunds_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pay_refunds_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "pay_payments"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"updated_at": string,"updated_by": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"positions": {
                  Row: {
                    "color": string | null,"created_at": string,"created_by": string | null,"id": string,"location_id": string | null,"name": string,"needed": number,"org_id": string,"position": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"location_id"?: string | null,"name": string,"needed"?: number,"org_id": string,"position"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"location_id"?: string | null,"name"?: string,"needed"?: number,"org_id"?: string,"position"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "positions_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "positions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"created_at": string,"email": string,"full_name": string | null,"id": string,"locale": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"locale"?: string | null
                  }
                  Update: {
                    "avatar_path"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"locale"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"is_owner": boolean,"name": NonNullable<Json>,"org_id": string | null,"permissions": (string)[],"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"is_owner"?: boolean,"name": NonNullable<Json>,"org_id"?: string | null,"permissions"?: (string)[],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"is_owner"?: boolean,"name"?: NonNullable<Json>,"org_id"?: string | null,"permissions"?: (string)[],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"shift_assignments": {
                  Row: {
                    "checked_in_at": string | null,"checked_out_at": string | null,"created_at": string,"created_by": string | null,"id": string,"org_id": string,"shift_id": string,"staff_id": string,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_in_at"?: string | null,"checked_out_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"org_id": string,"shift_id": string,"staff_id": string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "checked_in_at"?: string | null,"checked_out_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"org_id"?: string,"shift_id"?: string,"staff_id"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "shift_assignments_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shift_assignments_shift_id_fkey"
      columns: ["shift_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shift_assignments_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"shift_series": {
                  Row: {
                    "created_at": string,"created_by": string | null,"default_staff": (string)[],"end_date": string | null,"end_time": string,"every_weeks": number,"generated_until": string | null,"id": string,"location_id": string | null,"name": string | null,"needed": number,"org_id": string,"position_id": string | null,"start_date": string,"start_time": string,"updated_at": string,"updated_by": string | null,"weekdays": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"default_staff"?: (string)[],"end_date"?: string | null,"end_time": string,"every_weeks"?: number,"generated_until"?: string | null,"id"?: string,"location_id"?: string | null,"name"?: string | null,"needed"?: number,"org_id": string,"position_id"?: string | null,"start_date": string,"start_time": string,"updated_at"?: string,"updated_by"?: string | null,"weekdays": (number)[]
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"default_staff"?: (string)[],"end_date"?: string | null,"end_time"?: string,"every_weeks"?: number,"generated_until"?: string | null,"id"?: string,"location_id"?: string | null,"name"?: string | null,"needed"?: number,"org_id"?: string,"position_id"?: string | null,"start_date"?: string,"start_time"?: string,"updated_at"?: string,"updated_by"?: string | null,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "shift_series_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shift_series_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shift_series_position_id_fkey"
      columns: ["position_id"]
isOneToOne: false
      referencedRelation: "positions"
      referencedColumns: ["id"]
    }
                  ]
                },"shifts": {
                  Row: {
                    "created_at": string,"created_by": string | null,"ends_at": string,"event_id": string | null,"id": string,"location_id": string | null,"needed": number,"notes": string | null,"open": boolean,"org_id": string,"position_id": string | null,"series_id": string | null,"starts_at": string,"title": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"ends_at": string,"event_id"?: string | null,"id"?: string,"location_id"?: string | null,"needed"?: number,"notes"?: string | null,"open"?: boolean,"org_id": string,"position_id"?: string | null,"series_id"?: string | null,"starts_at": string,"title"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"event_id"?: string | null,"id"?: string,"location_id"?: string | null,"needed"?: number,"notes"?: string | null,"open"?: boolean,"org_id"?: string,"position_id"?: string | null,"series_id"?: string | null,"starts_at"?: string,"title"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "shifts_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shifts_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shifts_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shifts_position_id_fkey"
      columns: ["position_id"]
isOneToOne: false
      referencedRelation: "positions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shifts_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "shift_series"
      referencedColumns: ["id"]
    }
                  ]
                },"soft_delete_tables": {
                  Row: {
                    "org_column": string,"perm": string | null,"purge_days": number,"table_name": unknown
                  }
                  ComputedFields: never
                  Insert: {
                    "org_column"?: string,"perm"?: string | null,"purge_days"?: number,"table_name": unknown
                  }
                  Update: {
                    "org_column"?: string,"perm"?: string | null,"purge_days"?: number,"table_name"?: unknown
                  }
                  Relationships: [
                    
                  ]
                },"staff": {
                  Row: {
                    "active": boolean,"color": string | null,"contact_id": string | null,"created_at": string,"created_by": string | null,"email": string | null,"id": string,"link_token": string | null,"name": string,"org_id": string,"phone": string | null,"position_ids": (string)[],"role_label": string | null,"target_hours": number | null,"updated_at": string,"updated_by": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"color"?: string | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"link_token"?: string | null,"name": string,"org_id": string,"phone"?: string | null,"position_ids"?: (string)[],"role_label"?: string | null,"target_hours"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"color"?: string | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"link_token"?: string | null,"name"?: string,"org_id"?: string,"phone"?: string | null,"position_ids"?: (string)[],"role_label"?: string | null,"target_hours"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_codes": {
                  Row: {
                    "active": boolean,"code": string,"created_at": string,"created_by": string | null,"event_id": string,"id": string,"kind": string,"max_uses": number | null,"org_id": string,"type_ids": (string)[],"updated_at": string,"updated_by": string | null,"valid_from": string | null,"valid_until": string | null,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"created_at"?: string,"created_by"?: string | null,"event_id": string,"id"?: string,"kind": string,"max_uses"?: number | null,"org_id": string,"type_ids"?: (string)[],"updated_at"?: string,"updated_by"?: string | null,"valid_from"?: string | null,"valid_until"?: string | null,"value"?: number
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"created_by"?: string | null,"event_id"?: string,"id"?: string,"kind"?: string,"max_uses"?: number | null,"org_id"?: string,"type_ids"?: (string)[],"updated_at"?: string,"updated_by"?: string | null,"valid_from"?: string | null,"valid_until"?: string | null,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_codes_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_codes_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_tiers": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"name": string,"org_id": string,"position": number,"price": number,"quota": number | null,"sales_end": string | null,"type_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"org_id": string,"position"?: number,"price": number,"quota"?: number | null,"sales_end"?: string | null,"type_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"org_id"?: string,"position"?: number,"price"?: number,"quota"?: number | null,"sales_end"?: string | null,"type_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_tiers_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_tiers_type_id_fkey"
      columns: ["type_id"]
isOneToOne: false
      referencedRelation: "ticket_types"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_types": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"currency": string,"description": string | null,"event_id": string,"hidden": boolean,"id": string,"name": string,"org_id": string,"position": number,"price": number,"quota": number | null,"sales_end": string | null,"sales_start": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string | null,"event_id": string,"hidden"?: boolean,"id"?: string,"name": string,"org_id": string,"position"?: number,"price": number,"quota"?: number | null,"sales_end"?: string | null,"sales_start"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string | null,"event_id"?: string,"hidden"?: boolean,"id"?: string,"name"?: string,"org_id"?: string,"position"?: number,"price"?: number,"quota"?: number | null,"sales_end"?: string | null,"sales_start"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_types_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_types_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"tickets": {
                  Row: {
                    "checked_in_at": string | null,"checked_in_by": string | null,"code": string,"code_id": string | null,"contact_id": string | null,"created_at": string,"created_by": string | null,"event_id": string,"expires_at": string | null,"holder_name": string | null,"id": string,"order_id": string,"org_id": string,"price": number | null,"status": string,"tier_id": string | null,"type_id": string,"updated_at": string,"updated_by": string | null,"ticket_live": boolean | null
                  }
                  ComputedFields: "ticket_live"
                  Insert: {
                    "checked_in_at"?: string | null,"checked_in_by"?: string | null,"code": string,"code_id"?: string | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"event_id": string,"expires_at"?: string | null,"holder_name"?: string | null,"id"?: string,"order_id": string,"org_id": string,"price"?: number | null,"status"?: string,"tier_id"?: string | null,"type_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "checked_in_at"?: string | null,"checked_in_by"?: string | null,"code"?: string,"code_id"?: string | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"event_id"?: string,"expires_at"?: string | null,"holder_name"?: string | null,"id"?: string,"order_id"?: string,"org_id"?: string,"price"?: number | null,"status"?: string,"tier_id"?: string | null,"type_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tickets_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "ticket_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "pay_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_tier_id_fkey"
      columns: ["tier_id"]
isOneToOne: false
      referencedRelation: "ticket_tiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_type_id_fkey"
      columns: ["type_id"]
isOneToOne: false
      referencedRelation: "ticket_types"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "p_token": string }; Returns: string
                           },
"admin_create_org":
{ Args: { "p_name": string,"p_owner": string,"p_slug": string }; Returns: string
                           },
"admin_delete_user":
{ Args: { "p_user": string }; Returns: undefined
                           },
"admin_users":
{ Args: Record<PropertyKey, never>; Returns: {
              "confirmed": boolean,"created_at": string,"email": string,"full_name": string,"id": string,"is_platform_admin": boolean,"last_sign_in_at": string,"org_count": number
            }[]
                           },
"api_key_auth":
{ Args: { "p_hash": string }; Returns: {
              "key_id": string,"modules": (string)[],"org_id": string,"permissions": (string)[]
            }[]
                           },
"artist_visible":
{ Args: { "p_artist": string }; Returns: boolean
                           },
"can_see_deleted":
{ Args: { "p_org": string,"p_table": unknown }; Returns: boolean
                           },
"can_write_image":
{ Args: { "p_name": string }; Returns: boolean
                           },
"cancel_invoice":
{ Args: { "p_id": string }; Returns: string
                           },
"check_in_ticket":
{ Args: { "p_code": string,"p_event": string }; Returns: {
              "checked_in_at": string,"holder_name": string,"result": string,"type_name": string
            }[]
                           },
"claim_event_deliveries":
{ Args: { "p_limit"?: number }; Returns: number[]
                           },
"claim_unrouted_events":
{ Args: { "p_limit"?: number }; Returns: number[]
                           },
"create_org":
{ Args: { "p_name": string,"p_slug": string }; Returns: string
                           },
"delete_integration":
{ Args: { "p_org": string,"p_provider": string }; Returns: undefined
                           },
"emit_event":
{ Args: { "p_org": string,"p_payload"?: Json,"p_subject_id"?: string,"p_subject_table"?: string,"p_type": string }; Returns: number
                           },
"enable_audit":
{ Args: { "t": unknown }; Returns: undefined
                           },
"enable_soft_delete":
{ Args: { "p_org_column"?: string,"p_perm"?: string,"p_purge_days"?: number,"p_table": unknown }; Returns: undefined
                           },
"event_visible":
{ Args: { "p_event": string }; Returns: boolean
                           },
"events_public":
{ Args: { "p_org": string }; Returns: boolean
                           },
"finish_event_delivery":
{ Args: { "p_error"?: string,"p_id": number,"p_ok": boolean }; Returns: undefined
                           },
"format_document_number":
{ Args: { "p_date": string,"p_format": string,"p_n": number }; Returns: string
                           },
"get_integration_secret":
{ Args: { "p_org": string,"p_provider": string }; Returns: string
                           },
"get_subscription_secret":
{ Args: { "p_subscription": string }; Returns: string
                           },
"guest_link_add":
{ Args: { "p_email"?: string,"p_names": (string)[],"p_submitted_by": string,"p_token": string }; Returns: {
              "added_via": string,
"created_at": string,
"created_by": string | null,
"email": string | null,
"id": string,
"list_id": string,
"name": string,
"note": string | null,
"org_id": string,
"submitted_by": string | null,
"ticket_id": string | null,
"updated_at": string,
"updated_by": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "guest_entries"
        isOneToOne: false
        isSetofReturn: true
      } },
"guest_link_info":
{ Args: { "p_token": string }; Returns: {
              "event_title": string,"list_id": string,"list_name": string,"open": boolean,"org_name": string,"per_submission": number,"remaining": number,"starts_at": string
            }[]
                           },
"has_perm":
{ Args: { "p_org": string,"p_perm": string }; Returns: boolean
                           },
"invite_info":
{ Args: { "p_token": string }; Returns: {
              "email": string,"org_name": string,"role_name": Json,"valid": boolean
            }[]
                           },
"is_member":
{ Args: { "p_org": string }; Returns: boolean
                           },
"is_owner":
{ Args: { "p_org": string }; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"issue_document":
{ Args: { "p_id": string }; Returns: string
                           },
"members_with_perm":
{ Args: { "p_org": string,"p_perm": string }; Returns: string[]
                           },
"module_enabled":
{ Args: { "p_key": string,"p_org": string }; Returns: boolean
                           },
"my_staff_id":
{ Args: { "p_org": string }; Returns: string
                           },
"org_alive":
{ Args: { "p_org": string }; Returns: boolean
                           },
"purge_deleted":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"request_org":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"reserve_tickets":
{ Args: { "p_code"?: string,"p_event": string,"p_items": Json,"p_minutes": number,"p_order": string }; Returns: {
              "checked_in_at": string | null,
"checked_in_by": string | null,
"code": string,
"code_id": string | null,
"contact_id": string | null,
"created_at": string,
"created_by": string | null,
"event_id": string,
"expires_at": string | null,
"holder_name": string | null,
"id": string,
"order_id": string,
"org_id": string,
"price": number | null,
"status": string,
"tier_id": string | null,
"type_id": string,
"updated_at": string,
"updated_by": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "tickets"
        isOneToOne: false
        isSetofReturn: true
      } },
"restore_deleted":
{ Args: { "p_id": string,"p_table": unknown }; Returns: boolean
                           },
"save_integration":
{ Args: { "p_config": Json,"p_expires_at"?: string,"p_org": string,"p_provider": string,"p_secret"?: string,"p_status"?: string }; Returns: string
                           },
"schedule_worker":
{ Args: { "p_secret"?: string,"p_url": string }; Returns: string
                           },
"seed_org":
{ Args: { "p_name": string,"p_owner": string,"p_slug": string }; Returns: string
                           },
"set_subscription_secret":
{ Args: { "p_secret": string,"p_subscription": string }; Returns: undefined
                           },
"shares_org":
{ Args: { "p_user": string }; Returns: boolean
                           },
"shift_self":
{ Args: { "p_action": string,"p_shift": string,"p_token"?: string }; Returns: string
                           },
"soft_delete":
{ Args: { "p_id": string,"p_table": unknown }; Returns: boolean
                           },
"ticket_availability":
{ Args: { "p_event": string }; Returns: {
              "remaining": number,"type_id": string
            }[]
                           },
"ticket_event_public":
{ Args: { "p_event": string }; Returns: boolean
                           },
"ticket_live":
{ Args: { "k": Omit<Database["public"]['Tables']["tickets"]['Row'], Database["public"]['Tables']["tickets"]['ComputedFields']> }; Returns: boolean
                           },
"ticket_offer":
{ Args: { "p_code"?: string,"p_event": string }; Returns: {
              "code_applies": boolean,"code_id": string,"currency": string,"description": string,"final_price": number,"hidden": boolean,"name": string,"price": number,"remaining": number,"sales_end": string,"sales_start": string,"tier_id": string,"tier_name": string,"type_id": string
            }[]
                           },
"tickets_public":
{ Args: { "p_org": string }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
