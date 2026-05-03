import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import orderRoutes from './routes/order.routes';
import driverRoutes from './routes/driver.routes';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/driver', driverRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;
