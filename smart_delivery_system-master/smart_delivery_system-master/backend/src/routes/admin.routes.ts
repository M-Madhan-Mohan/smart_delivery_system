import { Router } from 'express';
import {
  getPendingOrders, getAllOrders, getAvailableDrivers, getAllDrivers,
  suggestDriver, assignDriver, autoAssignDriver, requestDriver,
  getSystemAnalytics, getFinancialReport,
  getDriverPerformanceList, addIncentive, getUsersList
} from '../controllers/admin.controller';
import { optimizeRoute } from '../controllers/route.controller';

const router = Router();

// Orders
router.get('/orders/pending', getPendingOrders);
router.get('/orders', getAllOrders);

// Drivers
router.get('/drivers/available', getAvailableDrivers);
router.get('/drivers', getAllDrivers);

// Assignment
router.get('/orders/:orderId/suggest-driver', suggestDriver);
router.post('/orders/:orderId/auto-assign', autoAssignDriver);
router.post('/orders/:orderId/assign', assignDriver);
router.post('/orders/:orderId/request', requestDriver);

// Route optimization
router.post('/routes/optimize', optimizeRoute);

// Analytics & Finance
router.get('/analytics', getSystemAnalytics);
router.get('/financial-report', getFinancialReport);

// Performance & Incentives
router.get('/driver-performance', getDriverPerformanceList);
router.post('/incentives', addIncentive);

// Users
router.get('/users', getUsersList);

export default router;
