export const getFuelConsumptionRate = (vehicleType: string): number => {
  switch (vehicleType) {
    case 'BIKE': return 0.02; // Liters per KM
    case 'CAR': return 0.08;
    case 'VAN': return 0.12;
    case 'TRUCK': return 0.25;
    default: return 0.05;
  }
};

export const calculateFuelEstimate = (distance: number, vehicleType: string): number => {
  const rate = getFuelConsumptionRate(vehicleType);
  return parseFloat((distance * rate).toFixed(2));
};
