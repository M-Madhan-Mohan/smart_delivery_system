// algorithms/dp/tsp.ts

interface Location {
  id: string; // "start" or order id
  lat: number;
  lng: number;
}

// Distance matrix to avoid recalculation
type DistanceMatrix = number[][];

// Haversine formula
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

function buildDistanceMatrix(locations: Location[]): DistanceMatrix {
  const n = locations.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        matrix[i][j] = getDistance(locations[i], locations[j]);
      }
    }
  }
  return matrix;
}

/**
 * Calculates optimal route using DP (Held-Karp algorithm)
 * Time Complexity: O(n^2 * 2^n) - suitable for small n (e.g., < 15-20 stops)
 */
export function calculateOptimalRoute(locations: Location[]): { path: Location[], totalDistance: number } {
  const n = locations.length;
  if (n <= 1) return { path: locations, totalDistance: 0 };

  const dist = buildDistanceMatrix(locations);
  const memo: number[][] = Array.from({ length: 1 << n }, () => Array(n).fill(-1));
  const parent: number[][] = Array.from({ length: 1 << n }, () => Array(n).fill(-1));

  // dp(mask, i) -> shortest path visiting all nodes in mask, ending at i
  function tsp(mask: number, pos: number): number {
    if (mask === (1 << n) - 1) {
      return 0; // We don't need to return to start in a delivery route usually, or we can add dist[pos][0] if round trip.
    }
    if (memo[mask][pos] !== -1) {
      return memo[mask][pos];
    }

    let ans = Infinity;
    let bestNextNode = -1;

    for (let city = 0; city < n; city++) {
      if ((mask & (1 << city)) === 0) { // If city is unvisited
        const newAns = dist[pos][city] + tsp(mask | (1 << city), city);
        if (newAns < ans) {
          ans = newAns;
          bestNextNode = city;
        }
      }
    }

    parent[mask][pos] = bestNextNode;
    return memo[mask][pos] = ans;
  }

  // Start at index 0
  const totalDistance = tsp(1, 0);

  // Reconstruct path
  const path: Location[] = [locations[0]];
  let currMask = 1;
  let currPos = 0;

  while (true) {
    const nextNode = parent[currMask][currPos];
    if (nextNode === -1) break;
    path.push(locations[nextNode]);
    currMask |= (1 << nextNode);
    currPos = nextNode;
  }

  return { path, totalDistance };
}
