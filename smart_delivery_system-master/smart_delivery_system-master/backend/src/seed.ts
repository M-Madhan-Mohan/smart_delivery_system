import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

async function seed() {
  try {
    // Register Customer
    const customerRes = await axios.post(`${BASE_URL}/auth/register`, {
      name: 'Test Customer',
      email: 'customer@test.com',
      password: 'password123',
      phone: '1234567890',
      role: 'CUSTOMER'
    }).catch(e => e.response.data);
    
    console.log('Customer:', customerRes.data || customerRes);

    // Register Driver
    const driverRes = await axios.post(`${BASE_URL}/auth/register`, {
      name: 'Test Driver',
      email: 'driver@test.com',
      password: 'password123',
      phone: '0987654321',
      role: 'DRIVER',
      vehicleType: 'BIKE',
      capacity: 10
    }).catch(e => e.response.data);
    
    console.log('Driver:', driverRes.data || driverRes);

    // Register Admin
    const adminRes = await axios.post(`${BASE_URL}/auth/register`, {
      name: 'Test Admin',
      email: 'admin@test.com',
      password: 'password123',
      phone: '1122334455',
      role: 'ADMIN'
    }).catch(e => e.response.data);
    
    console.log('Admin:', adminRes.data || adminRes);

  } catch (e) {
    console.error('Error seeding:', e);
  }
}

seed();
