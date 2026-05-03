import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const pricingMap: Record<string, number> = {
  FOOD: 50,
  GROCERY: 40,
  MEDICAL: 100,
  ECOMMERCE: 60,
  COURIER: 30,
  RETAIL: 70,
};

async function main() {
  console.log('Seeding database...');
  
  // Clear existing data
  await prisma.order.deleteMany();
  await prisma.route.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash('password123', 10);

  // 1. Create Customers
  const customer1 = await prisma.user.create({
    data: { name: 'Alice Smith', email: 'alice@example.com', password, role: 'CUSTOMER', phone: '1234567890' }
  });
  const customer2 = await prisma.user.create({
    data: { name: 'Bob Jones', email: 'bob@example.com', password, role: 'CUSTOMER', phone: '0987654321' }
  });

  // 2. Create Drivers
  const driverUser1 = await prisma.user.create({
    data: { name: 'John Driver', email: 'john.driver@example.com', password, role: 'DRIVER', phone: '1112223333' }
  });
  const driver1 = await prisma.driver.create({
    data: {
      userId: driverUser1.id,
      vehicleType: 'Van',
      capacity: 500, // kg
      currentLocation: JSON.stringify({ lat: 28.6139, lng: 77.2090 }), // Delhi
      isAvailable: true,
    }
  });

  const driverUser2 = await prisma.user.create({
    data: { name: 'Mike Rider', email: 'mike.rider@example.com', password, role: 'DRIVER', phone: '4445556666' }
  });
  const driver2 = await prisma.driver.create({
    data: {
      userId: driverUser2.id,
      vehicleType: 'Bike',
      capacity: 50, // kg
      currentLocation: JSON.stringify({ lat: 28.5355, lng: 77.3910 }), // Noida
      isAvailable: true,
    }
  });

  // 3. Create Orders (Delivery Datasets)
  const orderData = [
    { type: 'FOOD', weight: 2, cId: customer1.id, dId: driver2.id, pickup: { lat: 28.6139, lng: 77.2090, address: "CP, Delhi" }, drop: { lat: 28.5355, lng: 77.3910, address: "Noida" } },
    { type: 'MEDICAL', weight: 5, cId: customer2.id, dId: driver1.id, pickup: { lat: 28.7041, lng: 77.1025, address: "Rohini, Delhi" }, drop: { lat: 28.6139, lng: 77.2090, address: "AIIMS, Delhi" } },
    { type: 'ECOMMERCE', weight: 15, cId: customer1.id, dId: driver1.id, pickup: { lat: 28.4595, lng: 77.0266, address: "Gurgaon Warehouse" }, drop: { lat: 28.6139, lng: 77.2090, address: "CP, Delhi" } },
    { type: 'GROCERY', weight: 10, cId: customer2.id, dId: driver2.id, pickup: { lat: 28.5355, lng: 77.3910, address: "Noida Supermart" }, drop: { lat: 28.5703, lng: 77.3218, address: "Mayur Vihar, Delhi" } },
    { type: 'COURIER', weight: 1, cId: customer1.id, dId: driver2.id, pickup: { lat: 28.6139, lng: 77.2090, address: "Delhi" }, drop: { lat: 28.4595, lng: 77.0266, address: "Gurgaon" } },
    { type: 'RETAIL', weight: 8, cId: customer2.id, dId: driver1.id, pickup: { lat: 28.6139, lng: 77.2090, address: "Delhi Mall" }, drop: { lat: 28.7041, lng: 77.1025, address: "Rohini" } },
  ];

  let index = 0;
  for (const item of orderData) {
    // Price = Base Type Price + (Weight * 10)
    const calculatedPrice = pricingMap[item.type] + (item.weight * 10);

    await prisma.order.create({
      data: {
        customerId: item.cId,
        driverId: item.dId,
        deliveryType: item.type,
        packageWeight: item.weight,
        price: calculatedPrice,
        pickupLocation: JSON.stringify(item.pickup),
        dropLocation: JSON.stringify(item.drop),
        status: index % 2 === 0 ? 'PENDING' : 'ASSIGNED'
      }
    });
    index++;
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
