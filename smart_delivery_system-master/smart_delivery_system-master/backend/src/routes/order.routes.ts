import { Router } from 'express';
import {
  createOrder, getCustomerOrders, getOrderDetails, getPriceQuote,
  confirmPayment, submitRating, getOrderInvoice
} from '../controllers/order.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.post('/quote', getPriceQuote);

router.use(authenticate);

router.post('/', authorize(['CUSTOMER']), createOrder);
router.get('/customer', authorize(['CUSTOMER']), getCustomerOrders);
router.get('/:orderId', getOrderDetails);
router.post('/:orderId/payment', authorize(['CUSTOMER']), confirmPayment);
router.post('/:orderId/rating', authorize(['CUSTOMER']), submitRating);
router.get('/:orderId/invoice', getOrderInvoice);

export default router;
