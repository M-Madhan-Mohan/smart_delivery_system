// algorithms/backtracking/timeWindowScheduler.ts

interface Order {
  id: string;
  lat: number;
  lng: number;
  deadline: Date;
  deliveryTimeMinutes: number; // Time it takes to drop off
}

interface Location {
  lat: number;
  lng: number;
}

// Haversine formula for distance
function getDistance(loc1: Location, loc2: Location): number {
  const R = 6371;
  const dLat = (loc2.lat - loc1.lat) * (Math.PI / 180);
  const dLng = (loc2.lng - loc1.lng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(loc1.lat * (Math.PI / 180)) * Math.cos(loc2.lat * (Math.PI / 180)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Estimate travel time in minutes (assuming average speed of 40 km/h)
function estimateTravelTime(distanceKm: number): number {
  const speedKmh = 40;
  return (distanceKm / speedKmh) * 60;
}

/**
 * Uses backtracking to find a valid route that meets all delivery deadlines.
 * Returns the first valid permutation found, or null if impossible.
 */
export function scheduleTimeWindows(
  startLocation: Location,
  startTime: Date,
  orders: Order[]
): Order[] | null {
  const n = orders.length;
  let validRoute: Order[] | null = null;
  const visited = new Array(n).fill(false);
  const currentRoute: Order[] = [];

  function backtrack(currentLoc: Location, currentTime: Date, count: number) {
    if (validRoute) return; // Stop if we already found a valid route
    
    if (count === n) {
      validRoute = [...currentRoute];
      return;
    }

    for (let i = 0; i < n; i++) {
      if (!visited[i]) {
        const order = orders[i];
        const dist = getDistance(currentLoc, order);
        const travelMins = estimateTravelTime(dist);
        
        const arrivalTime = new Date(currentTime.getTime() + travelMins * 60000);
        
        // Check constraint: Can we make it before the deadline?
        if (arrivalTime <= order.deadline) {
          visited[i] = true;
          currentRoute.push(order);
          
          // Next time is arrival + drop-off time
          const nextTime = new Date(arrivalTime.getTime() + order.deliveryTimeMinutes * 60000);
          
          backtrack(order, nextTime, count + 1);
          
          // Backtrack
          currentRoute.pop();
          visited[i] = false;
        }
      }
    }
  }

  backtrack(startLocation, startTime, 0);
  return validRoute;
}
