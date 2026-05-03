import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { getIO } from '../utils/socket';

interface AuthRequest extends Request { user?: { id: string; role: string }; }

const calculateDistance = (loc1: any, loc2: any) => {
  if (!loc1 || !loc2) return 0;
  const dx = loc1.lat - loc2.lat; const dy = loc1.lng - loc2.lng;
  return Math.sqrt(dx * dx + dy * dy) * 111;
};

const getCalculatedPrice = (distance: number, weight: number, priority: string) => {
  const base = 50, weightCharge = weight * 10, distCharge = distance * 5;
  const factor = priority === 'EXPRESS' ? 1.5 : priority === 'EMERGENCY' ? 2.0 : 1.0;
  return Math.round((base + weightCharge + distCharge) * factor);
};

export const getPriceQuote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pickupLocation, dropLocation, packageWeight, priority } = req.body;
    const distance = calculateDistance(pickupLocation, dropLocation);
    const price = getCalculatedPrice(distance, parseFloat(packageWeight), priority);
    res.json({ price, distance: Math.round(distance * 10) / 10 });
  } catch {
    res.status(500).json({ error: 'Failed to calculate price' });
  }
};

export const createOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'CUSTOMER') { res.status(403).json({ error: 'Only customers can create orders' }); return; }
    const { pickupLocation, dropLocation, packageWeight, deliveryType, priority, paymentMethod, deliveryInstructions, price } = req.body;
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const distance = calculateDistance(pickupLocation, dropLocation);
    const finalPrice = price || getCalculatedPrice(distance, parseFloat(packageWeight), priority);

    const order = await prisma.order.create({
      data: {
        customerId: req.user.id,
        pickupLocation: JSON.stringify(pickupLocation),
        dropLocation: JSON.stringify(dropLocation),
        packageWeight: parseFloat(packageWeight),
        deliveryType: deliveryType || 'COURIER',
        priority: priority || 'NORMAL',
        paymentMethod: paymentMethod || 'COD',
        deliveryInstructions: deliveryInstructions || null,
        otp, price: finalPrice, status: 'PENDING', paymentStatus: 'UNPAID'
      }
    });
    const io = getIO();
    io.emit('newOrder', order);
    res.status(201).json(order);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create order' });
  }
};

export const getCustomerOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const orders = await prisma.order.findMany({
      where: { customerId: req.user.id },
      include: { driver: { include: { user: { select: { name: true, phone: true } } } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

export const getOrderDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        driver: { include: { user: true } },
        customer: { select: { id: true, name: true, phone: true } },
        transactions: true
      }
    });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json(order);
  } catch {
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
};

export const confirmPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { orderId } = req.params;
    const { paymentReference } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { driver: true }
    });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    if (order.status !== 'DELIVERED') { res.status(400).json({ error: 'Order not yet delivered' }); return; }
    if (order.paymentStatus === 'PAID') { res.status(400).json({ error: 'Already paid' }); return; }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'PAID' }
    });

    // Update pending transaction to completed
    await prisma.transaction.updateMany({
      where: { orderId, type: 'PAYMENT', status: 'PENDING' },
      data: { status: 'COMPLETED' }
    });

    const io = getIO();
    io.to(`order_${orderId}`).emit('paymentConfirmed', { orderId, amount: order.price });
    io.emit('revenueUpdated', { amount: order.price });

    res.json({ message: 'Payment confirmed', order: updatedOrder });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Payment confirmation failed' });
  }
};

export const submitRating = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { orderId } = req.params;
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) { res.status(400).json({ error: 'Rating must be 1-5' }); return; }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.customerId !== req.user.id) { res.status(403).json({ error: 'Not your order' }); return; }
    if (order.status !== 'DELIVERED') { res.status(400).json({ error: 'Order not delivered yet' }); return; }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { rating: parseInt(rating), feedback }
    });

    // Update driver performance rating (rolling average)
    if (order.driverId) {
      const driver = await prisma.driver.findUnique({ where: { id: order.driverId } });
      if (driver) {
        const newRating = (driver.performanceRating * driver.totalDeliveries + parseInt(rating)) /
          (driver.totalDeliveries + 1);
        await prisma.driver.update({
          where: { id: order.driverId },
          data: { performanceRating: Math.round(newRating * 10) / 10 }
        });
        await prisma.performanceLog.create({
          data: { driverId: order.driverId, rating: parseInt(rating), onTime: true, deliverySpeed: 40 }
        });
      }
    }
    res.json({ message: 'Rating submitted', order: updatedOrder });
  } catch (e) {
    res.status(500).json({ error: 'Failed to submit rating' });
  }
};

export const getOrderInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { orderId } = req.params;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { name: true, email: true, phone: true } },
        driver: { include: { user: { select: { name: true, phone: true } } } },
        transactions: true
      }
    });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

    const pickup = JSON.parse(order.pickupLocation);
    const drop = JSON.parse(order.dropLocation);
    const invoice = {
      invoiceNumber: `INV-${order.id.slice(0, 8).toUpperCase()}`,
      date: order.createdAt,
      deliveredAt: order.actualDeliveryTime,
      customer: order.customer,
      driver: order.driver?.user,
      pickup: pickup.address || `${pickup.lat},${pickup.lng}`,
      dropoff: drop.address || `${drop.lat},${drop.lng}`,
      packageWeight: order.packageWeight,
      deliveryType: order.deliveryType,
      priority: order.priority,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      subtotal: order.price,
      tax: Math.round(order.price * 0.18),
      total: Math.round(order.price * 1.18),
      status: order.status,
      otp: order.otp
    };
    res.json(invoice);
  } catch {
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
};
