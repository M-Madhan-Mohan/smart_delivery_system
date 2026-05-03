import { Router } from 'express';
import {
  getDriverProfile, updateDriverStatus, updateLiveLocation,
  getDriverOrders, updateOrderStatus, uploadDriverDocuments,
  acceptOrder, rejectOrder, optimizeMyRoute, getPerformanceSummary
} from '../controllers/driver.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize(['DRIVER']));

router.get('/profile', getDriverProfile);
router.put('/status', updateDriverStatus);
router.put('/location', updateLiveLocation);
router.post('/documents', uploadDriverDocuments);
router.get('/orders', getDriverOrders);
router.put('/orders/:orderId/status', updateOrderStatus);
router.post('/orders/:orderId/accept', acceptOrder);
router.post('/orders/:orderId/reject', rejectOrder);
router.post('/optimize-route', optimizeMyRoute);
router.get('/performance', getPerformanceSummary);

export default router;
