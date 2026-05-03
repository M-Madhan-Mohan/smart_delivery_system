import { useState, useEffect, useRef, useCallback } from 'react';
import { Truck, Navigation2, AlertCircle, Star, TrendingUp, DollarSign, LogOut, Clock, CheckCircle, MapPin } from 'lucide-react';
import MapComponent from '../components/MapComponent';
import axios from 'axios';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5001');
const API = 'http://localhost:5001/api';

async function fetchOsrmRoute(from:{lat:number,lng:number}, to:{lat:number,lng:number}): Promise<{coords:[number,number][], duration:number}> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.routes?.[0]) {
      const coords = d.routes[0].geometry.coordinates.map(([lng,lat]: number[]) => [lat,lng] as [number,number]);
      return { coords, duration: d.routes[0].duration };
    }
  } catch {}
  return { coords: [], duration: 0 };
}

export default function DriverDashboard() {
  const [tab, setTab] = useState<'jobs'|'navigate'|'performance'|'earnings'>('jobs');
  const [isOnline, setIsOnline] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [otp, setOtp] = useState('');
  const [mapCenter, setMapCenter] = useState<[number,number]>([17.3850, 78.4867]);
  const [mapMarkers, setMapMarkers] = useState<any[]>([]);
  const [osmRoute, setOsmRoute] = useState<[number,number][]>([]);
  const [eta, setEta] = useState<number | null>(null);
  const [myLocation, setMyLocation] = useState<{lat:number,lng:number}|null>(null);
  const [performance, setPerformance] = useState<any>(null);
  const [notification, setNotif] = useState<string|null>(null);
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const watchRef = useRef<number|null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval>|null>(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const showNotif = (msg: string) => { setNotif(msg); setTimeout(() => setNotif(null), 4000); };

  const fetchProfile = useCallback(async () => {
    try { const r = await axios.get(`${API}/driver/profile`, { headers }); setProfile(r.data); } catch {}
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/driver/orders`, { headers });
      const active = r.data.filter((o: any) => o.status !== 'DELIVERED');
      setOrders(r.data);
      if (active.length > 0) {
        setCurrentOrder(active[0]);
        socket.emit('joinOrderRoom', active[0].id);
        loadRouteForOrder(active[0]);
      } else { setCurrentOrder(null); setOsmRoute([]); }
    } catch {}
  }, []);

  const fetchPerformance = useCallback(async () => {
    try { const r = await axios.get(`${API}/driver/performance`, { headers }); setPerformance(r.data); } catch {}
  }, []);

  const loadRouteForOrder = async (order: any) => {
    if (!order) return;
    const pickup = (() => { try { return JSON.parse(order.pickupLocation); } catch { return null; } })();
    const drop = (() => { try { return JSON.parse(order.dropLocation); } catch { return null; } })();
    const m = [];
    if (pickup) { m.push({ ...pickup, label: `Pickup: ${pickup.address||''}`, type: 'pickup' }); setMapCenter([pickup.lat, pickup.lng]); }
    if (drop) m.push({ ...drop, label: `Dropoff: ${drop.address||''}`, type: 'drop' });
    setMapMarkers(m);
    if (pickup && drop) { 
      const { coords, duration } = await fetchOsrmRoute(pickup, drop); 
      setOsmRoute(coords); 
      setEta(Math.round(duration / 60));
    } else {
      setEta(null);
    }
  };

  useEffect(() => {
    fetchProfile(); fetchOrders(); fetchPerformance();
    socket.on('orderAssigned', () => { showNotif('🔔 New order assigned!'); fetchOrders(); });
    socket.on('driverRequested', () => { showNotif('📬 New delivery request!'); fetchOrders(); });
    return () => { socket.off('orderAssigned'); socket.off('driverRequested'); };
  }, []);

  const startLocationSharing = () => {
    if (!navigator.geolocation) { showNotif('Geolocation not supported'); return; }
    setIsSharingLocation(true);
    watchRef.current = navigator.geolocation.watchPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      setMyLocation({ lat, lng });
      socket.emit('updateLocation', { driverId: profile?.id, location: { lat, lng }, orderId: currentOrder?.id });
      try { await axios.put(`${API}/driver/location`, { lat, lng }, { headers }); } catch {}
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
  };

  const stopLocationSharing = () => {
    setIsSharingLocation(false);
    if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
  };

  const toggleOnline = async () => {
    const next = !isOnline;
    setIsOnline(next);
    if (next) {
      socket.emit('driverOnline', profile?.id);
      try { await axios.put(`${API}/driver/status`, { isAvailable: true }, { headers }); } catch {}
      showNotif('✅ You are now online!');
    } else {
      socket.emit('driverOffline', profile?.id);
      stopLocationSharing();
      try { await axios.put(`${API}/driver/status`, { isAvailable: false }, { headers }); } catch {}
      showNotif('⏸ You are now offline.');
    }
  };

  const handleAccept = async (orderId: string) => {
    try { await axios.post(`${API}/driver/orders/${orderId}/accept`, {}, { headers }); fetchOrders(); showNotif('✅ Order accepted!'); } catch { showNotif('Failed to accept.'); }
  };

  const handleReject = async (orderId: string) => {
    try { await axios.post(`${API}/driver/orders/${orderId}/reject`, {}, { headers }); fetchOrders(); } catch {}
  };

  const updateStatus = async (status: string) => {
    if (!currentOrder) return;
    try {
      await axios.put(`${API}/driver/orders/${currentOrder.id}/status`, { status, otp: status === 'DELIVERED' ? otp : undefined }, { headers });
      if (status === 'DELIVERED') { showNotif('🎉 Delivered! Earnings updated.'); setOtp(''); fetchProfile(); }
      fetchOrders();
    } catch { showNotif('Failed. Check OTP if delivering.'); }
  };

  const handleOptimize = async () => {
    try { const r = await axios.post(`${API}/driver/optimize-route`, {}, { headers }); showNotif(`Route optimized! Est. fuel: ${r.data.fuelEstimate?.toFixed(1)}L`); }
    catch { showNotif('No active orders to optimize.'); }
  };

  const handleSOS = () => {
    socket.emit('sos', { driverId: profile?.id, location: myLocation }); showNotif('🆘 SOS sent to admin!');
  };

  const activeCount = orders.filter(o => !['DELIVERED'].includes(o.status)).length;
  const deliveredCount = orders.filter(o => o.status === 'DELIVERED').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-950 to-slate-900 font-sans text-white">
      {notification && (
        <div className="fixed top-4 right-4 z-[99999] bg-white text-gray-800 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold max-w-xs animate-bounce">{notification}</div>
      )}

      <header className="bg-white/5 backdrop-blur-md border-b border-white/10 px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="bg-green-500 p-2 rounded-xl"><Truck size={22} /></div>
            <div><h1 className="text-lg font-black">Driver Portal</h1>
              {profile && <div className="text-xs text-green-400">₹{profile.totalEarnings?.toFixed(0)} earned · ★{profile.performanceRating?.toFixed(1)}</div>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-white/10 rounded-xl p-1">
              {(['jobs','navigate','performance','earnings'] as const).map(t => (
                <button key={t} onClick={() => { setTab(t); if(t==='performance') fetchPerformance(); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${tab===t ? 'bg-green-500 text-white' : 'text-white/50 hover:text-white'}`}>
                  {t==='jobs'?'🚗 Jobs':t==='navigate'?'🗺 Nav':t==='performance'?'📊 Stats':'💰 Pay'}
                </button>
              ))}
            </div>
            <button onClick={toggleOnline} className={`px-4 py-2 rounded-xl font-black text-sm transition-all shadow-lg ${isOnline ? 'bg-green-500 shadow-green-900' : 'bg-white/10'}`}>
              {isOnline ? '🟢 ONLINE' : '⚫ OFFLINE'}
            </button>
            <button onClick={() => { localStorage.clear(); window.location.href = '/'; }} className="text-white/30 hover:text-white"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {tab === 'jobs' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[['Active', activeCount, 'bg-blue-500/20 text-blue-400'], ['Delivered', deliveredCount, 'bg-green-500/20 text-green-400'], ['Rating', `★${profile?.performanceRating?.toFixed(1)||'5.0'}`, 'bg-yellow-500/20 text-yellow-400']].map(([label, val, cls]) => (
                  <div key={label as string} className={`${cls} rounded-2xl p-3 text-center`}>
                    <div className="text-xl font-black">{val}</div><div className="text-xs opacity-70">{label}</div>
                  </div>
                ))}
              </div>

              {!isOnline ? (
                <div className="bg-white/5 rounded-2xl p-8 text-center border border-white/10">
                  <Truck size={40} className="mx-auto mb-3 text-white/20" />
                  <p className="text-white/50 font-medium">Go online to receive orders</p>
                  <button onClick={toggleOnline} className="mt-4 bg-green-600 hover:bg-green-500 text-white font-bold px-6 py-2.5 rounded-xl transition-all">Go Online</button>
                </div>
              ) : currentOrder ? (
                <div className="bg-white/10 rounded-2xl p-5 border border-green-400/20">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-black text-green-300">#{currentOrder.id.slice(0,8)}</span>
                    <span className="text-xs bg-green-500/20 text-green-400 font-bold px-3 py-1 rounded-full">{currentOrder.status}</span>
                  </div>
                  {currentOrder.customer && <div className="text-sm text-white/60 mb-3">Customer: <span className="text-white font-semibold">{currentOrder.customer.name}</span></div>}
                  <div className="text-sm text-white/60 mb-1">💰 <span className="text-green-400 font-bold">₹{(currentOrder.price * 0.80).toFixed(0)}</span> your earnings</div>
                  <div className="text-sm text-white/60 mb-4">Payment: {currentOrder.paymentMethod}</div>
                  
                  {eta !== null && (
                    <div className="bg-blue-500/10 border border-blue-400/20 rounded-xl p-3 mb-4 text-sm text-blue-300 flex items-center gap-2">
                       <Clock size={16} /> Estimated Time: <b>{eta} mins</b>
                    </div>
                  )}

                  <div className="space-y-2">
                    {currentOrder.status === 'REQUESTED' && (
                      <div className="flex gap-2">
                        <button onClick={() => handleAccept(currentOrder.id)} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-all">✅ Accept</button>
                        <button onClick={() => handleReject(currentOrder.id)} className="flex-1 bg-red-600/40 hover:bg-red-600 text-red-300 font-bold py-3 rounded-xl transition-all">✕ Reject</button>
                      </div>
                    )}
                    {currentOrder.status === 'ASSIGNED' && <button onClick={() => updateStatus('PICKED_UP')} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all">📦 Mark Picked Up</button>}
                    {currentOrder.status === 'PICKED_UP' && <button onClick={() => updateStatus('IN_TRANSIT')} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all">🚀 Start Transit</button>}
                    {currentOrder.status === 'IN_TRANSIT' && (
                      <div className="space-y-2">
                        <input type="text" placeholder="Enter customer OTP" value={otp} onChange={e => setOtp(e.target.value.trim())}
                          className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-center text-xl font-black tracking-widest outline-none text-white" />
                        <button onClick={() => updateStatus('DELIVERED')} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-green-900">✅ Complete Delivery</button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button onClick={handleOptimize} className="flex-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 text-xs font-bold py-2 rounded-xl transition-all">⚡ Optimize Route</button>
                    <button onClick={() => { setTab('navigate'); loadRouteForOrder(currentOrder); }} className="flex-1 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 text-xs font-bold py-2 rounded-xl transition-all">🗺 Navigate</button>
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 rounded-2xl p-8 text-center border border-white/10">
                  <div className="animate-pulse w-12 h-12 bg-green-500/20 rounded-full mx-auto mb-3 flex items-center justify-center"><Truck className="text-green-400" size={22} /></div>
                  <p className="text-white/50">Waiting for orders...</p>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={isSharingLocation ? stopLocationSharing : startLocationSharing}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${isSharingLocation ? 'bg-blue-600 shadow-lg shadow-blue-900' : 'bg-white/10 hover:bg-white/20'}`}>
                  {isSharingLocation ? '📡 Sharing GPS' : '📍 Share Location'}
                </button>
                <button onClick={handleSOS} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black py-3 rounded-xl transition-all shadow-lg shadow-red-900 flex items-center justify-center gap-2">
                  <AlertCircle size={18} /> SOS
                </button>
              </div>
            </div>

            <div className="lg:col-span-3 bg-white/5 rounded-2xl overflow-hidden border border-white/10" style={{minHeight:'500px'}}>
              <MapComponent center={mapCenter} markers={mapMarkers} osmRoute={osmRoute}
                driverLocation={myLocation || undefined} zoom={13} />
              <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm text-xs px-3 py-2 rounded-xl text-white/70 pointer-events-none">
                {myLocation ? `📡 GPS: ${myLocation.lat.toFixed(4)}, ${myLocation.lng.toFixed(4)}` : '📵 GPS off'}
              </div>
            </div>
          </div>
        )}

        {tab === 'navigate' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <div className="bg-white/10 rounded-2xl p-5 border border-white/10">
                <h3 className="font-black text-green-300 mb-4 flex items-center gap-2"><Navigation2 size={18} /> Navigation</h3>
                {currentOrder ? (
                  <>
                    <div className="space-y-3 mb-4">
                      {[['📦 Pickup', (() => { try { const p=JSON.parse(currentOrder.pickupLocation); return p.address||`${p.lat.toFixed(3)},${p.lng.toFixed(3)}`; } catch { return 'N/A'; } })(), 'text-green-400'],
                        ['🏁 Dropoff', (() => { try { const d=JSON.parse(currentOrder.dropLocation); return d.address||`${d.lat.toFixed(3)},${d.lng.toFixed(3)}`; } catch { return 'N/A'; } })(), 'text-red-400']
                      ].map(([label, addr, cls]) => (
                        <div key={label as string} className="bg-white/5 rounded-xl p-3">
                          <div className={`text-xs font-bold mb-1 ${cls}`}>{label}</div>
                          <div className="text-sm text-white/80 truncate">{addr}</div>
                        </div>
                      ))}
                    </div>
                    {osmRoute.length > 0 && (
                      <div className="bg-blue-500/10 border border-blue-400/20 rounded-xl p-3 text-sm text-blue-300">
                        <div className="font-bold">Route loaded ✓</div>
                        <div className="text-xs text-white/40 mt-1">{osmRoute.length} waypoints</div>
                      </div>
                    )}
                    <button onClick={() => loadRouteForOrder(currentOrder)} className="w-full mt-3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl transition-all">
                      🔄 Recalculate Route
                    </button>
                  </>
                ) : <p className="text-white/40 text-sm">No active order</p>}
              </div>
            </div>
            <div className="lg:col-span-2 bg-white/5 rounded-2xl overflow-hidden border border-white/10" style={{minHeight:'550px'}}>
              <MapComponent center={mapCenter} markers={mapMarkers} osmRoute={osmRoute} driverLocation={myLocation || undefined} zoom={14} />
            </div>
          </div>
        )}

        {tab === 'performance' && performance && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'Total Deliveries', value: performance.totalDeliveries, icon: '📦', color: 'blue' },
              { label: 'On-Time %', value: `${performance.onTimePct}%`, icon: '⏱', color: 'green' },
              { label: 'Avg Rating', value: `★${performance.avgRating}`, icon: '⭐', color: 'yellow' },
              { label: 'Net Earnings', value: `₹${performance.netEarnings?.toFixed(0)}`, icon: '💰', color: 'purple' },
            ].map(c => (
              <div key={c.label} className={`bg-${c.color}-500/10 border border-${c.color}-500/20 rounded-2xl p-5`}>
                <div className="text-3xl mb-2">{c.icon}</div>
                <div className={`text-2xl font-black text-${c.color}-400`}>{c.value}</div>
                <div className="text-xs text-white/40 mt-1">{c.label}</div>
              </div>
            ))}
            <div className="md:col-span-2 lg:col-span-4 bg-white/10 rounded-2xl p-5 border border-white/10">
              <h3 className="font-black text-green-300 mb-4">Incentive History</h3>
              {performance.incentives?.length === 0 && <p className="text-white/30 text-sm">No incentives yet</p>}
              <div className="space-y-2">
                {performance.incentives?.map((inc: any) => (
                  <div key={inc.id} className={`flex justify-between items-center p-3 rounded-xl ${inc.type==='BONUS' ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                    <div><div className="font-semibold text-sm">{inc.reason}</div><div className="text-xs text-white/40">{new Date(inc.createdAt).toLocaleDateString()}</div></div>
                    <div className={`font-black ${inc.type==='BONUS' ? 'text-green-400' : 'text-red-400'}`}>{inc.type==='BONUS'?'+':'-'}₹{inc.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'earnings' && performance && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[['Today', performance.todayEarnings], ['This Week', performance.weekEarnings], ['Total', performance.totalEarnings]].map(([label, val]) => (
                <div key={label as string} className="bg-white/10 rounded-2xl p-5 text-center border border-white/10">
                  <div className="text-2xl font-black text-green-400">₹{(val as number)?.toFixed(0)}</div>
                  <div className="text-xs text-white/40 mt-1">{label}</div>
                </div>
              ))}
            </div>
            <div className="bg-white/10 rounded-2xl p-5 border border-white/10">
              <h3 className="font-black text-green-300 mb-4">Recent Deliveries</h3>
              <div className="space-y-2">
                {performance.recentDeliveries?.map((d: any) => (
                  <div key={d.id||Math.random()} className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
                    <div><div className="text-sm font-semibold">Delivery</div><div className="text-xs text-white/40">{new Date(d.createdAt).toLocaleDateString()}</div></div>
                    <div className="text-right">
                      <div className="text-green-400 font-bold">+₹{(d.price * 0.80).toFixed(0)}</div>
                      {d.rating && <div className="text-xs text-yellow-400">{'★'.repeat(d.rating)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
