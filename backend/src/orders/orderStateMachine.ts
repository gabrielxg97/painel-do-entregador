import { InternalOrderStatus } from '@prisma/client';

const ALLOWED_TRANSITIONS: Record<InternalOrderStatus, InternalOrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLATION_REQUESTED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLATION_REQUESTED', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLATION_REQUESTED', 'CANCELLED'],
  READY_FOR_PICKUP: ['WAITING_DELIVERY_PERSON', 'DELIVERY_PERSON_ASSIGNED', 'CANCELLATION_REQUESTED', 'CANCELLED'],
  WAITING_DELIVERY_PERSON: ['DELIVERY_PERSON_ASSIGNED', 'CANCELLATION_REQUESTED', 'CANCELLED'],
  DELIVERY_PERSON_ASSIGNED: ['GOING_TO_MERCHANT', 'WAITING_DELIVERY_PERSON', 'CANCELLATION_REQUESTED', 'CANCELLED'],
  GOING_TO_MERCHANT: ['ARRIVED_AT_MERCHANT', 'CANCELLATION_REQUESTED', 'CANCELLED'],
  ARRIVED_AT_MERCHANT: ['ORDER_PICKED_UP', 'CANCELLATION_REQUESTED', 'CANCELLED'],
  ORDER_PICKED_UP: ['GOING_TO_CUSTOMER', 'CANCELLATION_REQUESTED', 'CANCELLED'],
  GOING_TO_CUSTOMER: ['ARRIVED_AT_CUSTOMER', 'CANCELLATION_REQUESTED', 'CANCELLED'],
  ARRIVED_AT_CUSTOMER: ['DELIVERED', 'CANCELLATION_REQUESTED', 'CANCELLED'],
  DELIVERED: ['CONCLUDED'],
  CONCLUDED: [],
  CANCELLATION_REQUESTED: ['CANCELLED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'],
  CANCELLED: [],
};

export class OrderStateMachine {
  static canTransition(currentStatus: InternalOrderStatus, newStatus: InternalOrderStatus): boolean {
    if (currentStatus === newStatus) return true;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    return allowed.includes(newStatus);
  }

  static validateTransition(currentStatus: InternalOrderStatus, newStatus: InternalOrderStatus): void {
    if (!this.canTransition(currentStatus, newStatus)) {
      throw new Error(`Transição de status inválida de '${currentStatus}' para '${newStatus}'`);
    }
  }
}
