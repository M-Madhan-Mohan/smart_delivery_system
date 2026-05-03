import { useState, useEffect, useCallback } from 'react';
import { Activity, Users, Truck, Package, TrendingUp, Cpu, DollarSign, MapPin, Search, Star, LogOut } from 'lucide-react';
import axios from 'axios';
import { io } from 'socket.io-client';
import MapComponent from '../components/MapComponent';

const socket = io('http://localhost:5001');
const API = 'http://localhost:5001/api/admin';
const TABS = ['overview', 'assignment', 'fleet', 'finance', 'performance', 'users'] as const;

export default function AdminDashboard() {
  const [tab, setTab] = useState<typeof TABS[number]>('overview');
  const [analytics, setAnalytics] = useState<any>(null);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [suggestedDriver, setSuggestedDriver] = useState<any>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [fleetLocations, setFleetLocations] = useState<Record<string, {lat:number,lng:number}>>({});
  const [fleetDrivers, setFleetDrivers] = useState<any[]>([]);
  const [finance, setFinance] = useState<any>(null);
  const [performance, setPerformance] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchOverview = useCallback(async () => {
    try { const r = await axios.get(`${API}/analytics`, { headers }); setAnalytics(r.data); } catch {}
  }, []);
  const fetchOrders = useCallback(async () => {
    try { const r = await axios.get(`${API}/orders/pending`, { headers }); setPendingOrders(r.data); } catch {}
  }, []);
  const fetchDrivers = useCallback(async () => {
    try { const r = await axios.get(`${API}/drivers/available`, { headers }); setAvailableDrivers(r.data); } catch {}
  }, []);
  const fetchFleet = useCallback(async () => {
    try { const r = await axios.get(`${API}/drivers`, { headers }); setFleetDrivers(r.data); } catch {}
  }, []);
  const fetchFinance = useCallback(async () => {
    try { const r = await axios.get(`${API}/financial-report`, { headers }); setFinance(r.data); } catch {}
  }, []);
  const fetchPerformance = useCallback(async () => {
    try { const r = await axios.get(`${API}/driver-performance`, { headers }); setPerformance(r.data); } catch {}
  }, []);
  const fetchUsers = useCallback(async () => {
    try { const r = await axios.get(`${API}/users`, { headers }); setUsers(r.data); } catch {}
  }, []);

  useEffect(() => {
    fetchOverview(); fetchOrders(); fetchDrivers();
    socket.on('newOrder', () => { fetchOverview(); fetchOrders(); });
    socket.on('orderStatusUpdated', () => { fetchOverview(); fetchOrders(); fetchDrivers(); });
    socket.on('fleetLocationUpdated', ({ driverId, location }) => {
      setFleetLocations(prev => ({ ...prev, [driverId]: location }));
    });
    return () => { socket.off('newOrder'); socket.off('orderStatusUpdated'); socket.off('fleetLocationUpdated'); };
  }, [fetchOverview, fetchOrders, fetchDrivers]);

  useEffect(() => {
    if (tab === 'fleet') fetchFleet();
    if (tab === 'finance') fetchFinance();
    if (tab === 'performance') fetchPerformance();
    if (tab === 'users') fetchUsers();
  }, [tab, fetchFleet, fetchFinance, fetchPerformance, fetchUsers]);

  const handleAutoAssign = async (orderId: string) => {
    try {
      await axios.post(`${API}/orders/${orderId}/auto-assign`, {}, { headers });
      fetchOrders(); fetchOverview();
    } catch { alert('Failed to auto-assign'); }
  };
  const handleSuggest = async (orderId: string) => {
    try {
      const r = await axios.get(`${API}/orders/${orderId}/suggest-driver`, { headers });
      setSuggestedDriver(r.data); setActiveOrderId(orderId);
    } catch { alert('No suitable driver found'); }
  };
  const handleManualAssign = async (orderId: string, driverId: string) => {
    try {
      await axios.post(`${API}/orders/${orderId}/assign`, { driverId }, { headers });
      fetchOrders(); fetchOverview(); setActiveOrderId(null); setSuggestedDriver(null);
    } catch { alert('Failed to assign'); }
  };
  const handleIncentive = async (driverId: string, type: 'BONUS'|'PENALTY', amount: number, reason: string) => {
    try {
      await axios.post(`${API}/incentives`, { driverId, amount, reason, type }, { headers });
      fetchPerformance(); alert('Incentive added');
    } catch { alert('Failed to add incentive'); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-gray-200 px-8 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-purple-600 p-2 rounded-lg"><Activity className="text-white" size={24} /></div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Console</h1>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
          {TABS.map(t => (
            <button key={t} onClick={() => {
              setTab(t);
              setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
            }}
              className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all ${tab===t ? 'bg-white shadow-md text-purple-600' : 'text-gray-500 hover:text-gray-800'}`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={() => { localStorage.clear(); window.location.href = '/'; }} className="text-gray-400 hover:text-gray-600"><LogOut size={20} /></button>
      </header>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
        <div className={`space-y-8 ${tab === 'overview' && analytics ? 'block relative' : 'absolute opacity-0 pointer-events-none -z-10 w-full'}`}>
          {analytics && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Orders" value={analytics.totalOrders} icon={<Package />} color="blue" />
                <StatCard title="Active Deliveries" value={analytics.activeOrders} icon={<Truck />} color="green" />
                <StatCard title="Available Drivers" value={analytics.availableDrivers} icon={<Users />} color="orange" />
                <StatCard title="Today's Revenue" value={`₹${analytics.todayRevenue}`} icon={<TrendingUp />} color="purple" />
              </div>
              <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 h-[500px]">
                <h2 className="text-xl font-bold mb-4">Live Activity Map</h2>
                <MapComponent center={[17.3850, 78.4867]} zoom={12}
                  markers={analytics.heatmapData?.map((m:any) => ({...m, color:'blue', label:'Order Pickup'}))} />
              </div>
            </>
          )}
        </div>

        <div className={`grid grid-cols-1 lg:grid-cols-3 gap-8 ${tab === 'assignment' ? 'block relative' : 'absolute opacity-0 pointer-events-none -z-10 w-full'}`}>
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Cpu className="text-purple-500"/> Pending Orders</h2>
            <div className="space-y-4">
              {pendingOrders.length === 0 ? (
                <div className="p-8 text-center text-gray-400 font-medium bg-gray-50 rounded-2xl border border-gray-100 border-dashed">
                  No pending orders at the moment.
                </div>
              ) : (
                pendingOrders.map(order => (
                  <div key={order.id} className="p-5 rounded-2xl border border-gray-100 bg-gray-50">
                    <div className="flex justify-between mb-2">
                      <span className="font-bold">Order #{order.id.slice(0,8)}</span>
                      <span className="font-bold text-green-600">₹{order.price}</span>
                    </div>
                    {activeOrderId === order.id && suggestedDriver ? (
                      <div className="mt-4 p-4 bg-purple-50 rounded-xl border border-purple-200">
                        <div className="font-bold text-purple-900 mb-2">Suggested: {suggestedDriver.suggestedDriver?.user?.name}</div>
                        <div className="text-sm text-purple-700 mb-3">Score: {suggestedDriver.score?.toFixed(1)} | Distance: {suggestedDriver.distanceKm}km</div>
                        <button onClick={() => handleManualAssign(order.id, suggestedDriver.suggestedDriver.id)} className="w-full bg-purple-600 text-white font-bold py-2 rounded-lg">Assign Now</button>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => handleAutoAssign(order.id)} className="flex-1 bg-green-600 text-white font-bold py-2 rounded-xl">Auto-Assign</button>
                        <button onClick={() => handleSuggest(order.id)} className="flex-1 bg-purple-100 text-purple-700 font-bold py-2 rounded-xl">View Suggestion</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
             <h2 className="text-xl font-bold mb-6">Available Fleet</h2>
             <div className="space-y-3">
               {availableDrivers.map(d => (
                 <div key={d.id} className="p-3 border rounded-xl flex justify-between items-center">
                   <div><div className="font-bold text-sm">{d.user?.name}</div><div className="text-xs text-gray-500">{d.vehicleType}</div></div>
                   {activeOrderId && <button onClick={() => handleManualAssign(activeOrderId, d.id)} className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg font-bold">Assign</button>}
                 </div>
               ))}
             </div>
          </div>
        </div>

        <div className={`bg-white rounded-3xl p-2 shadow-xl border border-gray-100 h-[700px] ${tab === 'fleet' ? 'block relative' : 'absolute opacity-0 pointer-events-none -z-10 w-full'}`}>
          <MapComponent center={[17.3850, 78.4867]} zoom={11}
            fleetDrivers={fleetDrivers.map(d => ({
              id: d.id, name: d.user?.name || 'Driver', status: d.isAvailable ? 'available' : 'busy',
              location: fleetLocations[d.id] || (() => { try { return JSON.parse(d.currentLocation||'{"lat":0,"lng":0}'); } catch { return {lat:0,lng:0}; }})()
            }))} />
        </div>

        {tab === 'finance' && finance && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard title="Total Revenue" value={`₹${finance.totalRevenue}`} icon={<DollarSign/>} color="green" />
              <StatCard title="Commission (15%)" value={`₹${finance.commissionEarned}`} icon={<TrendingUp/>} color="purple" />
              <StatCard title="Driver Payouts" value={`₹${finance.driverPayout}`} icon={<Users/>} color="orange" />
              <StatCard title="Total Orders" value={finance.totalOrders} icon={<Package/>} color="blue" />
            </div>
            <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
              <h2 className="text-xl font-bold mb-4">Recent Transactions</h2>
              <table className="w-full text-left">
                <thead><tr className="text-xs text-gray-500 border-b"><th className="pb-3">Date</th><th className="pb-3">Order ID</th><th className="pb-3">Type</th><th className="pb-3">Amount</th><th className="pb-3">Status</th></tr></thead>
                <tbody>
                  {finance.transactions?.slice(0,20).map((t:any) => (
                    <tr key={t.id} className="border-b last:border-0"><td className="py-3 text-sm">{new Date(t.createdAt).toLocaleDateString()}</td><td className="py-3 text-sm font-medium">#{t.orderId.slice(0,8)}</td><td className="py-3 text-sm">{t.type}</td><td className="py-3 text-sm font-bold">₹{t.amount}</td><td className="py-3 text-sm"><span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">{t.status}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'performance' && (
          <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
             <table className="w-full text-left">
                <thead><tr className="text-xs text-gray-500 border-b"><th className="pb-3">Driver</th><th className="pb-3">Rating</th><th className="pb-3">On-Time</th><th className="pb-3">Deliveries</th><th className="pb-3">Earnings</th><th className="pb-3">Action</th></tr></thead>
                <tbody>
                  {performance.map((d:any) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-4"><div className="font-bold">{d.user?.name}</div><div className="text-xs text-gray-500">{d.user?.phone}</div></td>
                      <td className="py-4 font-bold text-yellow-500">★{d.avgRating}</td>
                      <td className="py-4 font-bold text-green-600">{d.onTimePct}%</td>
                      <td className="py-4">{d.deliveredCount}</td>
                      <td className="py-4 font-bold">₹{d.totalEarnings?.toFixed(0)}</td>
                      <td className="py-4 flex gap-2">
                        <button onClick={() => { const amt = prompt('Bonus amount?'); if(amt) handleIncentive(d.id, 'BONUS', parseFloat(amt), 'Admin Bonus'); }} className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-bold">+ Bonus</button>
                        <button onClick={() => { const amt = prompt('Penalty amount?'); if(amt) handleIncentive(d.id, 'PENALTY', parseFloat(amt), 'Admin Penalty'); }} className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg font-bold">- Penalty</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>
        )}

        {tab === 'users' && (
          <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
             <table className="w-full text-left">
                <thead><tr className="text-xs text-gray-500 border-b"><th className="pb-3">Customer Name</th><th className="pb-3">Email</th><th className="pb-3">Phone</th><th className="pb-3">Joined</th><th className="pb-3">Total Orders</th></tr></thead>
                <tbody>
                  {users.map((u:any) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-4 font-bold">{u.name}</td>
                      <td className="py-4 text-sm">{u.email}</td>
                      <td className="py-4 text-sm">{u.phone || 'N/A'}</td>
                      <td className="py-4 text-sm">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="py-4 font-bold">{u.orders?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ title, value, icon, color }: any) {
  const cMap: any = { blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600', orange: 'bg-orange-50 text-orange-600', purple: 'bg-purple-50 text-purple-600' };
  return (
    <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${cMap[color]}`}>{icon}</div>
      <div className="text-3xl font-black text-gray-800">{value}</div>
      <div className="text-sm font-semibold text-gray-500 mt-1">{title}</div>
    </div>
  );
}
