import { prisma } from '../db/prisma';
import { DeliveryVipClient, MerchantCredentials } from './deliveryVipClient';
import { Logger } from '../common/logger';
import { EventStatus, InternalOrderStatus, OrderType, SalesChannel, OrderTiming } from '@prisma/client';

export class EventProcessorService {
  static async processEvents(merchant: MerchantCredentials, rawEvents: any[]): Promise<void> {
    if (!rawEvents || !Array.isArray(rawEvents) || rawEvents.length === 0) return;

    const client = new DeliveryVipClient(merchant);
    const ackList: { id: string; orderId?: string; eventType?: string }[] = [];

    for (const rawEvent of rawEvents) {
      const eventId = rawEvent.eventId;
      const orderId = rawEvent.orderId;
      const eventType = rawEvent.eventType;

      if (!eventId) continue;

      try {
        // 1. REGRA CRÍTICA DE DUPLICIDADE: Verificar se eventId já foi registrado
        const existingEvent = await prisma.deliveryEvent.findUnique({
          where: { event_id: eventId },
        });

        if (existingEvent) {
          Logger.info(`Evento duplicado detectado: ${eventId} (${eventType}). Pulando processamento.`);
          ackList.push({ id: eventId, orderId, eventType });
          continue;
        }

        // 2. Registrar evento no banco de dados com status RECEIVED
        const createdEvent = await prisma.deliveryEvent.create({
          data: {
            event_id: eventId,
            order_id: orderId,
            event_type: eventType,
            order_type: rawEvent.orderType,
            merchant_id: merchant.merchantId,
            order_url: rawEvent.orderUrl,
            deliveryvip_created_at: rawEvent.createdAt ? new Date(rawEvent.createdAt) : undefined,
            status: EventStatus.PROCESSING,
            metadata: rawEvent.metadata || undefined,
          },
        });

        // 3. Processar o evento de acordo com seu tipo
        if (eventType === 'CREATED' && orderId) {
          // REGRA CRÍTICA: Sempre consultar os detalhes do pedido ANTES de confirmar
          Logger.info(`Buscando detalhes do pedido ${orderId} antes de processar confirmação`);
          const orderDetails = await client.getOrderDetails(orderId);
          await this.saveOrderFromDetails(merchant.merchantId, orderDetails);
        } else if ((eventType === 'CANCELLED' || eventType === 'CANCELLATION_REQUESTED') && orderId) {
          await this.handleCancellationEvent(orderId, eventType, rawEvent.metadata);
        } else if (orderId) {
          await this.handleGenericStatusEvent(orderId, eventType);
        }

        // 4. Marcar evento como PROCESSED e incluir na lista de ACK
        await prisma.deliveryEvent.update({
          where: { id: createdEvent.id },
          data: {
            status: EventStatus.PROCESSED,
            processed_at: new Date(),
          },
        });

        ackList.push({ id: eventId, orderId, eventType });
      } catch (error: any) {
        Logger.error(`Erro ao processar evento ${eventId}:`, error.message);
        
        // Registrar erro no evento no banco
        await prisma.deliveryEvent.upsert({
          where: { event_id: eventId },
          create: {
            event_id: eventId,
            order_id: orderId,
            event_type: eventType,
            order_type: rawEvent.orderType,
            merchant_id: merchant.merchantId,
            status: EventStatus.ERROR,
            error_message: error.message,
          },
          update: {
            status: EventStatus.ERROR,
            error_message: error.message,
          },
        }).catch(() => {});

        // Mesmo com erro de processamento interno, o evento deve entrar para a política de retry ou ACK conforme a gravidade
      }
    }

    // 5. Enviar ACK em lote para a DeliveryVip
    if (ackList.length > 0) {
      try {
        Logger.info(`Enviando ACK para ${ackList.length} eventos para Merchant ${merchant.merchantId}`);
        await client.sendAck(ackList);

        // Atualizar timestamps de ACK no banco
        const eventIds = ackList.map((a) => a.id);
        await prisma.deliveryEvent.updateMany({
          where: { event_id: { in: eventIds } },
          data: {
            status: EventStatus.ACKNOWLEDGED,
            acknowledged_at: new Date(),
          },
        });
      } catch (ackError: any) {
        Logger.error(`Erro ao enviar ACK para DeliveryVip:`, ackError.message);
      }
    }
  }

  private static async saveOrderFromDetails(merchantId: string, details: any): Promise<void> {
    const deliveryvipOrderId = details.id;
    if (!deliveryvipOrderId) throw new Error('ID do pedido inválido no payload de detalhes');

    // Buscar merchant no banco para vincular ID interno
    const merchantRecord = await prisma.merchant.findUnique({
      where: { deliveryvip_merchant_id: merchantId },
    });

    if (!merchantRecord) throw new Error(`Merchant com deliveryvip_merchant_id ${merchantId} não encontrado no banco`);

    // 1. Processar Endereço se existir
    let addressId: string | undefined;
    const addr = details.delivery?.deliveryAddress || details.address;
    if (addr) {
      const createdAddr = await prisma.address.create({
        data: {
          country: addr.country || 'BR',
          state: addr.state,
          city: addr.city,
          district: addr.neighborhood || addr.district,
          street: addr.streetName || addr.street,
          number: addr.streetNumber || addr.number,
          complement: addr.complement,
          reference: addr.reference,
          formatted_address: addr.formattedAddress,
          postal_code: addr.postalCode,
          latitude: addr.coordinates?.latitude ? parseFloat(addr.coordinates.latitude) : undefined,
          longitude: addr.coordinates?.longitude ? parseFloat(addr.coordinates.longitude) : undefined,
        },
      });
      addressId = createdAddr.id;
    }

    // 2. Processar Cliente se existir
    let customerId: string | undefined;
    const cust = details.customer;
    if (cust) {
      const createdCust = await prisma.customer.create({
        data: {
          merchant_id: merchantRecord.id,
          deliveryvip_customer_id: cust.id,
          name: cust.name || 'Cliente sem nome',
          phone: cust.phone?.number || cust.phone,
          phone_extension: cust.phone?.extension,
          document_number: cust.documentNumber,
          orders_count_on_merchant: cust.ordersCountOnMerchant || 0,
        },
      });
      customerId = createdCust.id;
    }

    // Mapeamento de tipos e canais
    const orderType = (details.type as OrderType) || OrderType.DELIVERY;
    const salesChannel = (details.salesChannel as SalesChannel) || SalesChannel.MARKETPLACE;
    const orderTiming = details.orderTiming === 'SCHEDULED' ? OrderTiming.SCHEDULED : OrderTiming.INSTANT;

    // Calcular valores totais
    const totalDetails = details.total || {};
    const itemsPrice = totalDetails.subTotal || totalDetails.itemsPrice || 0;
    const otherFees = totalDetails.otherFees || totalDetails.deliveryFee || 0;
    const discountAmount = totalDetails.benefits || totalDetails.discount || 0;
    const orderAmount = totalDetails.orderAmount || totalDetails.total || (itemsPrice + otherFees - discountAmount);

    // Upsert do pedido principal
    const orderRecord = await prisma.order.upsert({
      where: { deliveryvip_order_id: deliveryvipOrderId },
      create: {
        deliveryvip_order_id: deliveryvipOrderId,
        merchant_id: merchantRecord.id,
        display_id: details.displayId || deliveryvipOrderId.slice(-4),
        type: orderType,
        sales_channel: salesChannel,
        order_timing: orderTiming,
        scheduled_start: details.schedule?.scheduledDateTimeStart ? new Date(details.schedule.scheduledDateTimeStart) : undefined,
        scheduled_end: details.schedule?.scheduledDateTimeEnd ? new Date(details.schedule.scheduledDateTimeEnd) : undefined,
        deliveryvip_status: 'CREATED',
        internal_status: InternalOrderStatus.NEW,
        customer_id: customerId,
        address_id: addressId,
        items_price: itemsPrice,
        other_fees: otherFees,
        discount_amount: discountAmount,
        order_amount: orderAmount,
        currency: details.currency || 'BRL',
        extra_info: details.extraInfo,
      },
      update: {
        deliveryvip_status: 'CREATED',
        items_price: itemsPrice,
        other_fees: otherFees,
        discount_amount: discountAmount,
        order_amount: orderAmount,
        extra_info: details.extraInfo,
      },
    });

    // Save Order Items
    if (details.items && Array.isArray(details.items)) {
      // Limpar itens antigos se for re-processamento
      await prisma.orderItem.deleteMany({ where: { order_id: orderRecord.id } });

      for (let index = 0; index < details.items.length; index++) {
        const item = details.items[index];
        const createdItem = await prisma.orderItem.create({
          data: {
            order_id: orderRecord.id,
            deliveryvip_item_id: item.id,
            item_index: index,
            name: item.name || 'Item sem nome',
            external_code: item.externalCode,
            ean: item.ean,
            unit: item.unit || 'UN',
            quantity: item.quantity || 1,
            unit_price: item.unitPrice || 0,
            options_price: item.optionsPrice || 0,
            total_price: item.totalPrice || item.unitPrice * (item.quantity || 1),
            special_instructions: item.specialInstructions,
          },
        });

        // Add Options/Adicionais do Item
        if (item.options && Array.isArray(item.options)) {
          for (let optIndex = 0; optIndex < item.options.length; optIndex++) {
            const opt = item.options[optIndex];
            await prisma.orderItemOption.create({
              data: {
                order_item_id: createdItem.id,
                deliveryvip_option_id: opt.id,
                item_index: optIndex,
                name: opt.name,
                external_code: opt.externalCode,
                unit: opt.unit || 'UN',
                quantity: opt.quantity || 1,
                unit_price: opt.unitPrice || 0,
                total_price: opt.totalPrice || 0,
                special_instructions: opt.specialInstructions,
              },
            });
          }
        }
      }
    }

    // Save Order Payments
    if (details.payments && details.payments.methods && Array.isArray(details.payments.methods)) {
      await prisma.orderPayment.deleteMany({ where: { order_id: orderRecord.id } });
      for (const pay of details.payments.methods) {
        await prisma.orderPayment.create({
          data: {
            order_id: orderRecord.id,
            amount: pay.value || pay.amount || 0,
            currency: pay.currency || 'BRL',
            type: pay.prepaid ? 'PREPAID' : 'PENDING',
            method: pay.method || 'OTHER',
            brand: pay.brand,
            method_info: pay.methodInfo,
            change_for: pay.changeFor,
          },
        });
      }
    }

    Logger.info(`Pedido ${deliveryvipOrderId} salvo com sucesso no banco de dados.`);
  }

  private static async handleCancellationEvent(orderId: string, eventType: string, metadata?: any): Promise<void> {
    const order = await prisma.order.findUnique({ where: { deliveryvip_order_id: orderId } });
    if (!order) return;

    const newStatus = eventType === 'CANCELLED' ? InternalOrderStatus.CANCELLED : InternalOrderStatus.CANCELLATION_REQUESTED;
    await prisma.order.update({
      where: { id: order.id },
      data: {
        internal_status: newStatus,
        deliveryvip_status: eventType,
        cancellation_reason: metadata?.reason,
        cancellation_code: metadata?.code,
      },
    });
    Logger.info(`Pedido ${orderId} atualizado para ${newStatus}`);
  }

  private static async handleGenericStatusEvent(orderId: string, eventType: string): Promise<void> {
    const order = await prisma.order.findUnique({ where: { deliveryvip_order_id: orderId } });
    if (!order) return;

    await prisma.order.update({
      where: { id: order.id },
      data: { deliveryvip_status: eventType },
    });
  }
}
