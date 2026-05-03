import { Server } from 'socket.io';
import http from 'http';

let io: Server;

export const initSocket = (server: http.Server) => {
  io = new Server(server, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join a specific order's room to receive status updates
    socket.on('joinOrderRoom', (orderId) => {
      socket.join(`order_${orderId}`);
    });

    // Driver subscribes to their own location channel
    socket.on('joinDriverRoom', (driverId) => {
      socket.join(`driver_${driverId}`);
    });

    // Driver broadcasts their live location
    socket.on('updateLocation', ({ driverId, location, orderId }) => {
      // Broadcast to anyone tracking this driver
      io.to(`driver_${driverId}`).emit('locationUpdated', { driverId, location });
      // Also broadcast to the specific order room
      if (orderId) {
        io.to(`order_${orderId}`).emit('driverLocationUpdated', { orderId, driverId, location });
      }
      // Admin fleet tracking — global broadcast
      io.emit('fleetLocationUpdated', { driverId, location });
    });

    // Driver online/offline
    socket.on('driverOnline', (driverId) => {
      io.emit('driverStatusChanged', { driverId, status: 'online' });
    });

    socket.on('driverOffline', (driverId) => {
      io.emit('driverStatusChanged', { driverId, status: 'offline' });
    });

    // Emergency SOS
    socket.on('sos', ({ driverId, location }) => {
      io.emit('sosAlert', { driverId, location, timestamp: new Date() });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized!');
  return io;
};
