export type UserRole = 'ADMIN' | 'OPERATOR' | 'DELIVERY_PERSON';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  merchantId: string;
  merchantName: string;
  deliveryPersonId?: string | null;
}

export type InternalOrderStatus =
  | 'NEW'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'WAITING_DELIVERY_PERSON'
  | 'DELIVERY_PERSON_ASSIGNED'
  | 'GOING_TO_MERCHANT'
  | 'ARRIVED_AT_MERCHANT'
  | 'ORDER_PICKED_UP'
  | 'GOING_TO_CUSTOMER'
  | 'ARRIVED_AT_CUSTOMER'
  | 'DELIVERED'
  | 'CONCLUDED'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLED';

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  document_number?: string;
}

export interface Address {
  id: string;
  street?: string;
  number?: string;
  district?: string;
  city?: string;
  state?: string;
  formatted_address?: string;
  complement?: string;
  reference?: string;
  latitude?: number;
  longitude?: number;
}

export interface OrderItemOption {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  special_instructions?: string;
  options?: OrderItemOption[];
}

export interface OrderPayment {
  id: string;
  amount: number;
  method: string;
  type: string;
}

export interface DeliveryPerson {
  id: string;
  name: string;
  phone: string;
  document: string;
  vehicle_type: string;
  vehicle_plate?: string;
  status: 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'INACTIVE';
  current_lat?: number;
  current_lng?: number;
}

export interface DeliveryAssignment {
  id: string;
  order_id: string;
  delivery_person_id: string;
  status: string;
  delivery_person?: DeliveryPerson;
  assigned_at: string;
}

export interface Order {
  id: string;
  deliveryvip_order_id: string;
  display_id?: string;
  type: 'DELIVERY' | 'TAKEOUT' | 'INDOOR';
  sales_channel: string;
  deliveryvip_status: string;
  internal_status: InternalOrderStatus;
  created_at: string;
  items_price: number;
  other_fees: number;
  discount_amount: number;
  order_amount: number;
  customer?: Customer;
  address?: Address;
  items?: OrderItem[];
  payments?: OrderPayment[];
  assignments?: DeliveryAssignment[];
  extra_info?: string;
  cancellation_reason?: string;
}

export interface DashboardData {
  stats: {
    new: number;
    preparing: number;
    ready: number;
    waitingDriver: number;
    onDelivery: number;
    delivered: number;
    cancelled: number;
    totalAmountToday: number;
  };
  driverStats: {
    available: number;
    busy: number;
    offline: number;
    total: number;
  };
  recentOrders: Order[];
}
