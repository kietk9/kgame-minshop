export type CashCategory = 'ORDER_PAYMENT' | 'PURCHASE' | 'BUYBACK' | 'REPAIR_FEE' | 'OTHER' | 'DEPOSIT' | 'EXPENSE' | 'REFUND' | 'COD_SETTLEMENT' | 'SHIPPING_FEE';

// src/features/kgame/types.ts
// Master Format V1.1 Types cho Trung Kiên Game

export interface KgameProductType {
  id: number;
  product_id: number;
  name: string; // 620, 617, 615, Không PIN...
  code: string | null;
  tracking_mode: 'QUANTITY' | 'CODE';
  sale_price_cents: number;
  cost_price_cents: number;
  market_price_cents: number;
  floor_price_cents: number;
  cached_stock_new: number;
  cached_stock_used: number;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface KgameProductUnit {
  id: number;
  product_type_id: number;
  program_code: string; // 777-62020834 (UNIQUE)
  condition: 'NEW' | 'QSD';
  availability: 'IN_STOCK' | 'RESERVED' | 'SOLD' | 'REPAIRING_INTERNAL' | 'REPAIR_CUSTOMER' | 'BUYBACK_PENDING_INSPECT' | 'RETURNED_SUPPLIER' | 'RETURN_INSPECTION' | 'RETURN_REJECTED';
  owner_type: 'KGAME' | 'CUSTOMER' | 'SUPPLIER';
  owner_id: number | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  expiry_days: number | null; // 400, 200, 100...
  expiry_date: string | null; // YYYY-MM-DD
  production_date: string | null;
  cost_price_cents: number;
  target_sale_price_cents: number;
  location_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;

  // Joined fields
  product_name?: string;
  product_code?: string;
  product_type_name?: string;
  category_name?: string;
}

export interface KgameInventoryTransaction {
  id: number;
  product_id: number;
  product_type_id: number | null;
  product_unit_id: number | null;
  condition: 'NEW' | 'QSD';
  quantity: number;
  transaction_type: 'PURCHASE' | 'BUYBACK' | 'PRODUCTION_USE' | 'PRODUCTION_OUT' | 'SALE' | 'SALE_REVERSE' | 'CUSTOMER_RETURN' | 'SUPPLIER_RETURN' | 'REPAIR_USE' | 'ADJUSTMENT';
  reference_type: string | null;
  reference_id: number | null;
  unit_cost_cents: number;
  location_id: string;
  note: string | null;
  created_by: string | null;
  created_at: string;

  // Joined fields
  product_name?: string;
  product_type_name?: string;
  program_code?: string;
}

export interface KgameProgramCodeTimeline {
  unit: KgameProductUnit;
  transactions: KgameInventoryTransaction[];
  repairs: any[];
  orders: any[];
  buybacks: any[];
}

export type RepairStatus =
  | 'RECEIVED'
  | 'DIAGNOSING'
  | 'QUOTED'
  | 'APPROVED'
  | 'REPAIRING'
  | 'SENT_TO_PARTNER'
  | 'TESTING'
  | 'READY_FOR_RETURN'
  | 'COMPLETED'
  | 'CANCELLED';

export interface KgameRepairTicket {
  id: number;
  ticket_code: string; // SC0001
  owner_type: 'CUSTOMER' | 'KGAME';
  customer_id: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  product_id: number | null;
  product_name?: string | null;
  product_type_id: number | null;
  product_type_name?: string | null;
  product_unit_id: number | null;
  program_code?: string | null;
  unidentified_product_name: string | null;
  problem_reported: string;
  accessories_received: string | null;
  diagnosis: string | null;
  repair_location: 'INTERNAL' | 'EXTERNAL';
  external_partner: string | null;
  status: RepairStatus;
  repair_cost_cents: number;
  repair_price_cents: number;
  partner_cost_cents: number;
  sent_partner_at: string | null;
  expected_receive_at: string | null;
  actual_received_at: string | null;
  is_key_serviced: number;
  new_expiry_date: string | null;
  received_at: string;
  expected_return_at: string | null;
  returned_at: string | null;
  assigned_to: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;

  // Additional joined fields
  unit_manufacturer?: string | null;
  unit_is_self_produced?: number | null;
  unit_current_expiry_date?: string | null;
  unit_current_expiry_days?: number | null;
}

export interface KgameRepairEvent {
  id: number;
  repair_ticket_id: number;
  event_type: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface KgameRepairItem {
  id: number;
  repair_ticket_id: number;
  product_id: number;
  product_name?: string;
  product_type_id: number | null;
  product_type_name?: string;
  quantity: number;
  unit_cost_cents: number;
}

export interface KgameCashTransaction {
  id: number;
  transaction_code: string; // PT0001, PC0001
  flow_type: 'IN' | 'OUT';
  account_type: 'CASH' | 'BANK';
  category: CashCategory;
  amount_cents: number;
  reference_type: string | null;
  reference_id: number | null;
  bank_name: string | null;
  recipient_name: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

// POS Order Types
export interface KgamePosOrder {
  id: number;
  order_code: string;
  customer_id: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  order_type: 'ORDER' | 'SALE';
  order_status: 'PENDING' | 'PROCESSING' | 'DELIVERING' | 'COMPLETED' | 'CANCELLED';
  payment_status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  amount_total_cents: number;
  paid_amount_cents: number;
  cod_amount_cents: number;
  discount_cents: number;
  shipping_cents: number;
  currency: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  lines?: KgameOrderLine[];
  shipment?: KgameShipment | null;
}

export interface KgameOrderLine {
  id: number;
  order_id: number;
  product_id: number;
  product_type_id: number;
  product_name_snapshot: string;
  type_name_snapshot: string;
  condition: 'NEW' | 'QSD';
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  line_total_cents: number;
  // Units attached
  units?: {
    order_unit_id: number;
    product_unit_id: number;
    program_code: string;
  }[];
}

export interface KgameShipment {
  id: number;
  order_id: number;
  carrier: 'BUS' | 'GHN' | 'PICKUP';
  tracking_code: string | null;
  cod_amount_cents: number;
  bus_station: string | null;
  bus_plate: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  sender_address: string | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  receiver_address: string | null;
  shipping_fee_cents: number;
  status: string;
  created_at: string;
}

export interface CreatePosOrderInput {
  customer_id?: number | null;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  items: {
    product_id: number;
    product_type_id: number;
    product_unit_id?: number | null; // If tracking_mode == 'CODE'
    condition?: 'NEW' | 'QSD';
    quantity: number;
    unit_price_cents: number;
    discount_cents?: number;
  }[];
  discount_cents?: number;
  shipping_cents?: number;
  payment?: {
    payment_method: 'CASH' | 'BANK' | 'COD' | 'UNPAID';
    amount_paid_cents: number;
    bank_name?: string;
    reference_code?: string;
    note?: string;
  };
  shipment?: {
    carrier: 'PICKUP' | 'BUS' | 'GHN';
    bus_station?: string;
    bus_plate?: string;
    tracking_code?: string;
    receiver_name?: string;
    receiver_phone?: string;
    receiver_address?: string;
    shipping_fee_cents?: number;
  };
  note?: string;
  created_by?: string;
}
