// algorithms/greedy/nearestNeighbor.ts

interface Location {
  lat: number;
  lng: number;
}

interface Driver {
  id: string;
  location: Location;
  isAvailable: boolean;
  capacity: number;
}

// Haversine formula to calculate distance between two coordinates in kilometers
function getDistance(loc1: Location, loc2: Location): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (loc2.lat - loc1.lat) * (Math.PI / 180);
  const dLng = (loc2.lng - loc1.lng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(loc1.lat * (Math.PI / 180)) *
      Math.cos(loc2.lat * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

/**
 * Finds the nearest available driver to the pickup location.
 */
export function findNearestDriver(pickup: Location, drivers: Driver[]): Driver | null {
  let nearestDriver: Driver | null = null;
  let minDistance = Infinity;

  for (const driver of drivers) {
    if (!driver.isAvailable) continue;

    const distance = getDistance(pickup, driver.location);
    if (distance < minDistance) {
      minDistance = distance;
      nearestDriver = driver;
    }
  }

  return nearestDriver;
}
