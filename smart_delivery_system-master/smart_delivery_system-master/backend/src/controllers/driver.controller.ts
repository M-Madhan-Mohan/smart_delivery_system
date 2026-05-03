import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { getIO } from '../utils/socket';
import { calculateOptimalRoute } from '../../../algorithms/dp/tsp';
import { calculateFuelEstimate } from '../utils/logistics';

interface AuthRequest extends Request { user?: { id: string; role: string }; }

export const getDriverProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DRIVER') { res.status(403).json({ error: 'Only drivers can access this' }); return; }
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        incentives: { orderBy: { createdAt: 'desc' }, take: 20 }
      }
    });
    if (!driver) { res.status(404).json({ error: 'Driver profile not found' }); return; }
    res.json(driver);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch driver profile' });
  }
};

export const updateDriverStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DRIVER') { res.status(403).json({ error: 'Access denied' }); return; }
    const { isAvailable, currentLocation, fuelStatus, vehicleType } = req.body;
    const updateData: any = {};
    if (typeof isAvailable === 'boolean') updateData.isAvailable = isAvailable;
    if (currentLocation) updateData.currentLocation = JSON.stringify(currentLocation);
    if (fuelStatus !== undefined) updateData.fuelStatus = parseFloat(fuelStatus);
    if (vehicleType) updateData.vehicleType = vehicleType;

    const updated = await prisma.driver.update({ where: { userId: req.user.id }, data: updateData });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update driver status' });
  }
};

export const updateLiveLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DRIVER') { res.status(403).json({ error: 'Access denied' }); return; }
    const { lat, lng } = req.body;
    if (!lat || !lng) { res.status(400).json({ error: 'lat and lng required' }); return; }

    const driver = await prisma.driver.update({
      where: { userId: req.user.id },
      data: { currentLocation: JSON.stringify({ lat, lng }) }
    });

    // Broadcast to fleet tracking and any active order rooms
    const io = getIO();
    const activeOrders = await prisma.order.findMany({
      where: { driverId: driver.id, status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] } },
      select: { id: true }
    });
    io.emit('fleetLocationUpdated', { driverId: driver.id, location: { lat, lng } });
    activeOrders.forEach(o => {
      io.to(`order_${o.id}`).emit('driverLocationUpdated', { orderId: o.id, driverId: driver.id, location: { lat, lng } });
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update location' });
  }
};

export const uploadDriverDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DRIVER') { res.status(403).json({ error: 'Access denied' }); return; }
    const { licenseUrl, vehicleRcUrl, insuranceUrl, bankDetails } = req.body;
    const updateData: any = {};
    if (licenseUrl) updateData.licenseUrl = licenseUrl;
    if (vehicleRcUrl) updateData.vehicleRcUrl = vehicleRcUrl;
    if (insuranceUrl) updateData.insuranceUrl = insuranceUrl;
    if (bankDetails) updateData.bankDetails = bankDetails;
    const updated = await prisma.driver.update({ where: { userId: req.user.id }, data: updateData });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to upload documents' });
  }
};

export const getDriverOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DRIVER') { res.status(403).json({ error: 'Access denied' }); return; }
    const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    if (!driver) { res.status(404).json({ error: 'Driver not found' }); return; }
    const orders = await prisma.order.findMany({
      where: { driverId: driver.id },
      include: { customer: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch {
    res.status(500).json({ error: 'Failed to fetch driver orders' });
  }
};

export const acceptOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) return;
    const { orderId } = req.params;
    const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    if (!driver) { res.status(404).json({ error: 'Driver not found' }); return; }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'ASSIGNED', driverId: driver.id }
    });
    await prisma.driver.update({ where: { id: driver.id }, data: { activeOrderCount: { increment: 1 } } });

    const io = getIO();
    io.emit('orderAccepted', { orderId, driverId: driver.id });
    io.to(`order_${orderId}`).emit('orderStatusUpdated', { orderId, status: 'ASSIGNED' });
    res.json(updatedOrder);
  } catch {
    res.status(500).json({ error: 'Failed to accept order' });
  }
};

export const rejectOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const driver = req.user ? await prisma.driver.findUnique({ where: { userId: req.user.id } }) : null;

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'PENDING', driverId: null }
    });
    if (driver) {
      await prisma.driver.update({ where: { id: driver.id }, data: { activeOrderCount: { decrement: 1 } } });
    }
    const io = getIO();
    io.emit('orderRejected', { orderId });
    io.to(`order_${orderId}`).emit('orderStatusUpdated', { orderId, status: 'PENDING' });
    res.json(updatedOrder);
  } catch {
    res.status(500).json({ error: 'Failed to reject order' });
  }
};

export const updateOrderStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DRIVER') { res.status(403).json({ error: 'Access denied' }); return; }
    const { orderId } = req.params;
    const { status, otp, deliveryProofUrl } = req.body;

    const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    if (!driver) { res.status(404).json({ error: 'Driver not found' }); return; }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.driverId !== driver.id) { res.status(403).json({ error: 'Order not assigned to you' }); return; }

    if (status === 'DELIVERED') {
      if (order.otp && (!otp || order.otp.toString().trim() !== otp.toString().trim())) {
        res.status(400).json({ error: 'Invalid OTP' });
        return;
      }
    }

    const updateData: any = { status };
    if (deliveryProofUrl) updateData.deliveryProofUrl = deliveryProofUrl;
    if (status === 'DELIVERED') updateData.actualDeliveryTime = new Date();

    const updatedOrder = await prisma.order.update({ where: { id: orderId }, data: updateData });

    if (status === 'DELIVERED') {
      const driverCut = order.price * 0.80;
      const isOnTime = order.deadline ? new Date() <= order.deadline : true;
      await prisma.driver.update({
        where: { id: driver.id },
        data: {
          totalEarnings: { increment: driverCut },
          activeOrderCount: { decrement: 1 },
          totalDeliveries: { increment: 1 },
          onTimeDeliveries: { increment: isOnTime ? 1 : 0 }
        }
      });
      // Create transaction record
      await prisma.transaction.create({
        data: { orderId, amount: order.price, type: 'PAYMENT', status: 'PENDING' }
      });
      await prisma.transaction.create({
        data: { orderId, amount: driverCut, type: 'EARNING', status: 'COMPLETED' }
      });
    }

    const io = getIO();
    io.to(`order_${orderId}`).emit('orderStatusUpdated', { orderId, status });
    res.json(updatedOrder);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update order status' });
  }
};

export const optimizeMyRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) return;
    const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    if (!driver || !driver.currentLocation) { res.status(400).json({ error: 'Driver location missing' }); return; }

    const orders = await prisma.order.findMany({
      where: { driverId: driver.id, status: { in: ['ASSIGNED', 'PICKED_UP'] } }
    });
    if (orders.length === 0) { res.status(400).json({ error: 'No active orders to optimize' }); return; }

    const startLoc = JSON.parse(driver.currentLocation);
    const locations = [
      { id: 'start', lat: startLoc.lat, lng: startLoc.lng },
      ...orders.map(o => { const drop = JSON.parse(o.dropLocation); return { id: o.id, lat: drop.lat, lng: drop.lng }; })
    ];

    const { path, totalDistance } = calculateOptimalRoute(locations);
    const fuelEstimate = calculateFuelEstimate(totalDistance, driver.vehicleType);

    const route = await prisma.route.create({
      data: {
        driverId: driver.id,
        stops: JSON.stringify(path),
        distance: totalDistance,
        fuelEstimate,
        orders: { connect: orders.map(o => ({ id: o.id })) }
      }
    });
    await prisma.order.updateMany({
      where: { id: { in: orders.map(o => o.id) } },
      data: { routeId: route.id }
    });
    res.json({ message: 'Route optimized', route, totalDistance, fuelEstimate });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Optimization failed' });
  }
};

export const getPerformanceSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DRIVER') { res.status(403).json({ error: 'Access denied' }); return; }
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
      include: {
        incentives: { orderBy: { createdAt: 'desc' }, take: 20 },
        assignedOrders: {
          where: { status: 'DELIVERED' },
          select: { rating: true, price: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 30
        }
      }
    });
    if (!driver) { res.status(404).json({ error: 'Driver not found' }); return; }

    const onTimePct = driver.totalDeliveries > 0
      ? Math.round((driver.onTimeDeliveries / driver.totalDeliveries) * 100) : 100;
    const ratedOrders = driver.assignedOrders.filter(o => o.rating);
    const avgRating = ratedOrders.length > 0
      ? ratedOrders.reduce((s, o) => s + (o.rating || 0), 0) / ratedOrders.length : driver.performanceRating;

    const today = new Date(); today.setHours(0,0,0,0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const todayEarnings = driver.assignedOrders
      .filter(o => new Date(o.createdAt) >= today)
      .reduce((s, o) => s + o.price * 0.80, 0);
    const weekEarnings = driver.assignedOrders
      .filter(o => new Date(o.createdAt) >= weekAgo)
      .reduce((s, o) => s + o.price * 0.80, 0);

    res.json({
      totalDeliveries: driver.totalDeliveries,
      onTimePct,
      avgRating: Math.round(avgRating * 10) / 10,
      totalEarnings: driver.totalEarnings,
      bonusEarnings: driver.bonusEarnings,
      penaltyAmount: driver.penaltyAmount,
      netEarnings: driver.totalEarnings,
      todayEarnings: Math.round(todayEarnings),
      weekEarnings: Math.round(weekEarnings),
      incentives: driver.incentives,
      recentDeliveries: driver.assignedOrders
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get performance summary' });
  }
};
