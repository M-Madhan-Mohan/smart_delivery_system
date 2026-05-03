import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { findNearestDriver } from '../../../algorithms/greedy/nearestNeighbor';
import { getIO } from '../utils/socket';

interface Location { lat: number; lng: number; }
interface DriverForAlgo { id: string; location: Location; isAvailable: boolean; capacity: number; }
interface AuthRequest extends Request { user?: { id: string; role: string }; }

// ─── Orders ───────────────────────────────────────────────────────────────────

export const getPendingOrders = async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: { status: 'PENDING' },
      include: { customer: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch {
    res.status(500).json({ error: 'Server error fetching orders' });
  }
};

export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const { status, limit = '50' } = req.query as Record<string, string>;
    const where = status ? { status } : {};
    const orders = await prisma.order.findMany({
      where,
      include: { customer: true, driver: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });
    res.json(orders);
  } catch {
    res.status(500).json({ error: 'Server error fetching all orders' });
  }
};

// ─── Drivers ──────────────────────────────────────────────────────────────────

export const getAvailableDrivers = async (req: Request, res: Response) => {
  try {
    const drivers = await prisma.driver.findMany({
      where: { isAvailable: true },
      include: { user: true }
    });
    res.json(drivers);
  } catch {
    res.status(500).json({ error: 'Server error fetching drivers' });
  }
};

export const getAllDrivers = async (req: Request, res: Response) => {
  try {
    const { zone, minRating, vehicleType } = req.query as Record<string, string>;
    const where: any = {};
    if (zone && zone !== 'ALL') where.deliveryZone = zone;
    if (vehicleType) where.vehicleType = vehicleType;
    if (minRating) where.performanceRating = { gte: parseFloat(minRating) };

    const drivers = await prisma.driver.findMany({
      where,
      include: {
        user: true,
        assignedOrders: { where: { status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] } }, select: { id: true } },
        incentives: { orderBy: { createdAt: 'desc' }, take: 5 }
      },
      orderBy: { performanceRating: 'desc' }
    });
    res.json(drivers);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error fetching all drivers' });
  }
};

// ─── Auto Assignment ──────────────────────────────────────────────────────────

export const suggestDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }



    const pickupLoc = JSON.parse(order.pickupLocation) as Location;
    const drivers = await prisma.driver.findMany({
      where: { isAvailable: true },
      include: {
        user: true,
        assignedOrders: { where: { status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] } }, select: { id: true } }
      }
    });


    // Score each driver: nearest + lowest workload + highest rating
    const scoredDrivers = drivers.map(d => {
      const loc: Location = JSON.parse(d.currentLocation || '{"lat":0,"lng":0}');
      const dx = loc.lat - pickupLoc.lat;
      const dy = loc.lng - pickupLoc.lng;
      const distKm = Math.sqrt(dx * dx + dy * dy) * 111;
      const workloadScore = d.activeOrderCount * 5;
      const ratingBonus = (d.performanceRating - 3) * 2;
      const score = distKm + workloadScore - ratingBonus;
      return { driver: d, score, distKm };
    });

    scoredDrivers.sort((a, b) => a.score - b.score);
    const best = scoredDrivers[0];

    if (!best) { res.status(404).json({ error: 'No available drivers found' }); return; }
    res.json({ suggestedDriver: best.driver, distanceKm: Math.round(best.distKm * 10) / 10, score: best.score });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error suggesting driver' });
  }
};

export const autoAssignDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

    const pickupLoc = JSON.parse(order.pickupLocation) as Location;
    const drivers = await prisma.driver.findMany({
      where: { isAvailable: true },
      include: { user: true }
    });

    const driversForAlgo: DriverForAlgo[] = drivers.map(d => ({
      id: d.id,
      location: JSON.parse(d.currentLocation || '{"lat":0,"lng":0}'),
      isAvailable: d.isAvailable,
      capacity: d.capacity
    }));

    const bestDriver = findNearestDriver(pickupLoc, driversForAlgo);
    if (!bestDriver) { res.status(404).json({ error: 'No available drivers' }); return; }


    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { driverId: bestDriver.id, status: 'ASSIGNED', isManualAssignment: false }
    });
    await prisma.driver.update({
      where: { id: bestDriver.id },
      data: { activeOrderCount: { increment: 1 } }
    });
    const io = getIO();
    io.emit('orderAssigned', { orderId, driverId: bestDriver.id });
    io.to(`order_${orderId}`).emit('orderStatusUpdated', { orderId, status: 'ASSIGNED' });
    res.json({ message: 'Driver auto-assigned', order: updatedOrder, driverId: bestDriver.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Auto-assign failed' });
  }
};


// ─── Manual Assignment ────────────────────────────────────────────────────────
export const assignDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { driverId } = req.body;

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { driverId, status: 'ASSIGNED', isManualAssignment: true }
    });
    await prisma.driver.update({
      where: { id: driverId },
      data: { activeOrderCount: { increment: 1 } }
    });

    const io = getIO();
    io.emit('orderAssigned', { orderId, driverId });
    io.to(`order_${orderId}`).emit('orderStatusUpdated', { orderId, status: 'ASSIGNED' });
    res.json({ message: 'Driver manually assigned', order });
  } catch (e) {
    res.status(500).json({ error: 'Server error assigning driver' });
  }
};


export const requestDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { driverId } = req.body;
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'REQUESTED', driverId }
    });
    const io = getIO();
    io.emit('driverRequested', { orderId, driverId });
    io.to(`order_${orderId}`).emit('orderStatusUpdated', { orderId, status: 'REQUESTED' });
    res.json({ message: 'Request sent to driver', order });
  } catch {
    res.status(500).json({ error: 'Server error requesting driver' });
  }
};
// ─── Analytics ────────────────────────────────────────────────────────────────
export const getSystemAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const [totalOrders, deliveredOrders, activeOrders, pendingOrders, availableDrivers, totalDrivers, revenue, todayRevenue] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'DELIVERED' } }),
      prisma.order.count({ where: { status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] } } }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.driver.count({ where: { isAvailable: true } }),
      prisma.driver.count(),
      prisma.order.aggregate({ _sum: { price: true }, where: { status: 'DELIVERED' } }),
      prisma.order.aggregate({
        _sum: { price: true },
        where: { status: 'DELIVERED', createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }
      })
    ]);

    const activeOrderData = await prisma.order.findMany({
      where: { status: { in: ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] } },
      select: { pickupLocation: true }
    });
    const heatmapData = activeOrderData.map(o => {
      try { const l = JSON.parse(o.pickupLocation); return { lat: l.lat, lng: l.lng, weight: 1 }; }
      catch { return null; }
    }).filter(Boolean);

    res.json({
      totalOrders, deliveredOrders, activeOrders, pendingOrders,
      availableDrivers, totalDrivers,
      totalRevenue: revenue._sum.price || 0,
      todayRevenue: todayRevenue._sum.price || 0,
      heatmapData
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error fetching analytics' });
  }
};

// ─── Financial Reports ────────────────────────────────────────────────────────

export const getFinancialReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { days = '30' } = req.query as Record<string, string>;
    const since = new Date(Date.now() - parseInt(days) * 24 * 3600 * 1000);

    const [revenue, transactions, driverEarnings] = await Promise.all([
      prisma.order.aggregate({
        _sum: { price: true },
        _count: true,
        where: { status: 'DELIVERED', createdAt: { gte: since } }
      }),
      prisma.transaction.findMany({
        where: { createdAt: { gte: since } },
        include: { order: { select: { id: true, status: true, customerId: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100
      }),
      prisma.driver.findMany({
        select: { id: true, totalEarnings: true, bonusEarnings: true, penaltyAmount: true, user: { select: { name: true } } },
        orderBy: { totalEarnings: 'desc' }
      })
    ]);

    const commission = (revenue._sum.price || 0) * 0.15;
    res.json({
      totalRevenue: revenue._sum.price || 0,
      totalOrders: revenue._count,
      commissionEarned: Math.round(commission),
      driverPayout: Math.round((revenue._sum.price || 0) * 0.80),
      transactions,
      driverEarnings
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch financial report' });
  }
};

// ─── Performance & Incentives ─────────────────────────────────────────────────

export const getDriverPerformanceList = async (req: Request, res: Response): Promise<void> => {
  try {
    const drivers = await prisma.driver.findMany({
      include: {
        user: { select: { name: true, email: true, phone: true } },
        incentives: { orderBy: { createdAt: 'desc' }, take: 10 },
        assignedOrders: { where: { status: 'DELIVERED' }, select: { rating: true, price: true } }
      },
      orderBy: { performanceRating: 'desc' }
    });

    const enriched = drivers.map(d => {
      const deliveredOrders = d.assignedOrders;
      const avgRating = deliveredOrders.filter(o => o.rating).reduce((s, o) => s + (o.rating || 0), 0) /
        (deliveredOrders.filter(o => o.rating).length || 1);
      const onTimePct = d.totalDeliveries > 0 ? Math.round((d.onTimeDeliveries / d.totalDeliveries) * 100) : 100;
      return {
        ...d,
        avgRating: Math.round(avgRating * 10) / 10,
        onTimePct,
        deliveredCount: deliveredOrders.length,
        activeOrders: d.activeOrderCount
      };
    });
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch driver performance' });
  }
};

export const addIncentive = async (req: Request, res: Response): Promise<void> => {
  try {
    const { driverId, amount, reason, type } = req.body; // type: BONUS | PENALTY
    const incentive = await prisma.incentive.create({
      data: { driverId, amount: parseFloat(amount), reason, type }
    });
    // Update driver earnings/penalties
    if (type === 'BONUS') {
      await prisma.driver.update({ where: { id: driverId }, data: { bonusEarnings: { increment: parseFloat(amount) }, totalEarnings: { increment: parseFloat(amount) } } });
    } else {
      await prisma.driver.update({ where: { id: driverId }, data: { penaltyAmount: { increment: parseFloat(amount) }, totalEarnings: { decrement: parseFloat(amount) } } });
    }
    res.json(incentive);
  } catch (e) {
    res.status(500).json({ error: 'Failed to add incentive' });
  }
};

// ─── User Management ──────────────────────────────────────────────────────────

export const getUsersList = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      select: {
        id: true, name: true, email: true, phone: true, createdAt: true,
        orders: { select: { id: true, status: true, price: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};
