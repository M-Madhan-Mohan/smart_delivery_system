import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { calculateOptimalRoute } from '../../../algorithms/dp/tsp';
import { scheduleTimeWindows } from '../../../algorithms/backtracking/timeWindowScheduler';

interface AuthRequest extends Request {
  user?: { id: string; role: string };
}

export const optimizeRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can optimize routes' });
      return;
    }

    const { driverId, orderIds } = req.body;

    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver || !driver.currentLocation) {
      res.status(400).json({ error: 'Driver not found or location missing' });
      return;
    }

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } }
    });

    if (orders.length === 0) {
      res.status(400).json({ error: 'No orders provided' });
      return;
    }

    const startLoc = JSON.parse(driver.currentLocation);
    const locations = [
      { id: 'start', lat: startLoc.lat, lng: startLoc.lng },
      ...orders.map(o => {
        const drop = JSON.parse(o.dropLocation);
        return { id: o.id, lat: drop.lat, lng: drop.lng };
      })
    ];

    // Use DP for TSP (Optimal route finding)
    const { path, totalDistance } = calculateOptimalRoute(locations);

    const route = await prisma.route.create({
      data: {
        driverId,
        stops: JSON.stringify(path),
        distance: totalDistance,
        orders: { connect: orders.map(o => ({ id: o.id })) }
      }
    });

    // Update order status to assigned and assign to this driver
    await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { driverId, status: 'ASSIGNED', routeId: route.id }
    });

    res.json({ message: 'Route optimized successfully', route });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to optimize route' });
  }
};
