import { useState, useEffect, useRef, useCallback } from 'react';
import { Package, Clock, Star, FileText, LogOut, ChevronDown, ChevronUp, MapPin, Navigation, CheckCircle, AlertCircle, Truck, X } from 'lucide-react';
import MapComponent from '../components/MapComponent';
import LocationSearch from '../components/LocationSearch';
import axios from 'axios';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5001');
const API = 'http://localhost:5001/api';

const STATUS_STEPS = ['PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED'];
const STATUS_LABELS: Record<string,string> = { PENDING:'Order Placed', ASSIGNED:'Driver Assigned', PICKED_UP:'Package Picked Up', IN_TRANSIT:'In Transit', DELIVERED:'Delivered' };

async function fetchOsrmRoute(from:{lat:number,lng:number}, to:{lat:number,lng:number}): Promise<{coords:[number,number][], duration:number}> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.routes?.[0]?.geometry?.coordinates) {
      const coords = d.routes[0].geometry.coordinates.map(([lng,lat]: number[]) => [lat,lng] as [number,number]);
      return { coords, duration: d.routes[0].duration };
    }
  } catch {}
  return { coords: [], duration: 0 };
}

export default function CustomerDashboard() {
  const [tab, setTab] = useState<'order'|'track'|'history'>('order');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [pickupLoc, setPickupLoc] = useState<{lat:number,lng:number}|null>(null);
  const [dropLoc, setDropLoc] = useState<{lat:number,lng:number}|null>(null);
  const [packageWeight, setPackageWeight] = useState('1');
  const [packageCategory, setPackageCategory] = useState('COURIER');
  const [priority, setPriority] = useState('NORMAL');
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [quote, setQuote] = useState<{price:number,distance:number}|null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<{lat:number,lng:number}|null>(null);
  const [osmRoute, setOsmRoute] = useState<[number,number][]>([]);
  const [mapCenter, setMapCenter] = useState<[number,number]>([17.3850, 78.4867]);
  const [mapMarkers, setMapMarkers] = useState<any[]>([]);
  const [expandedOrder, setExpandedOrder] = useState<string|null>(null);
  const [ratingForm, setRatingForm] = useState<{orderId:string,rating:number,feedback:string}|null>(null);
  const [placing, setPlacing] = useState(false);
  const [notification, setNotification] = useState<string|null>(null);
  const [currentLocation, setCurrentLocation] = useState<{lat:number,lng:number}|null>(null);
  const [eta, setEta] = useState<number|null>(null);
  const clickMode = useRef<'pickup'|'drop'|null>(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const showNotif = (msg: string) => { setNotification(msg); setTimeout(() => setNotification(null), 4000); };

  const fetchOrders = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/orders/customer`, { headers });
      setOrders(res.data);
      const active = res.data.find((o:any) => ['ASSIGNED','PICKED_UP','IN_TRANSIT'].includes(o.status));
      if (active) { setActiveOrder(active); socket.emit('joinOrderRoom', active.id); }
    } catch {}
  }, []);

  useEffect(() => {
    fetchOrders();
    socket.on('orderStatusUpdated', ({ orderId, status }) => {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      if (status === 'ASSIGNED') showNotif('🚗 Driver has been assigned to your order!');
      if (status === 'PICKED_UP') showNotif('📦 Driver picked up your package!');
      if (status === 'IN_TRANSIT') showNotif('🚀 Your package is on the way!');
      if (status === 'DELIVERED') { showNotif('✅ Your order has been delivered!'); fetchOrders(); }
    });
    socket.on('driverLocationUpdated', ({ orderId, location }) => {
      if (activeOrder?.id === orderId) setDriverLocation(location);
    });
    return () => { socket.off('orderStatusUpdated'); socket.off('driverLocationUpdated'); };
  }, [activeOrder?.id]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (!pickupLoc) setMapCenter([pos.coords.latitude, pos.coords.longitude]);
      }, () => {});
    }
  }, []);

  useEffect(() => {
    if (!pickupLoc || !dropLoc) { setQuote(null); setOsmRoute([]); setEta(null); }
    else {
      axios.post(`${API}/orders/quote`, { pickupLocation: pickupLoc, dropLocation: dropLoc, packageWeight, priority })
        .then(r => setQuote(r.data)).catch(() => {});
      fetchOsrmRoute(pickupLoc, dropLoc).then(({ coords, duration }) => {
        setOsmRoute(coords);
        setEta(Math.round(duration / 60));
      });
    }
    
    const m = [];
    if (currentLocation && (!pickupLoc || currentLocation.lat !== pickupLoc.lat || currentLocation.lng !== pickupLoc.lng)) {
      m.push({ ...currentLocation, label: 'Your Location', type: 'current' });
    }
    if (pickupLoc) m.push({ ...pickupLoc, label: 'Pickup', type: 'pickup' });
    if (dropLoc) m.push({ ...dropLoc, label: 'Dropoff', type: 'drop' });
    
    setMapMarkers(m);
    if (pickupLoc) setMapCenter([pickupLoc.lat, pickupLoc.lng]);
    else if (currentLocation && !dropLoc) setMapCenter([currentLocation.lat, currentLocation.lng]);
  }, [pickupLoc, dropLoc, packageWeight, priority, currentLocation]);

  const handleMapClick = (lat: number, lng: number) => {
    if (clickMode.current === 'pickup') {
      setPickupLoc({ lat, lng }); setPickup(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } else if (clickMode.current === 'drop') {
      setDropLoc({ lat, lng }); setDropoff(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }
  };

  const handleCreateOrder = async () => {
    if (!pickupLoc || !dropLoc) { showNotif('Please set both pickup and dropoff locations'); return; }
    setPlacing(true);
    try {
      const res = await axios.post(`${API}/orders`, {
        pickupLocation: { ...pickupLoc, address: pickup },
        dropLocation: { ...dropLoc, address: dropoff },
        packageWeight, deliveryType: packageCategory, priority, paymentMethod, deliveryInstructions, price: quote?.price
      }, { headers });
      socket.emit('joinOrderRoom', res.data.id);
      showNotif(`✅ Order placed! Your OTP: ${res.data.otp}`);
      setPickup(''); setDropoff(''); setPickupLoc(null); setDropLoc(null); setQuote(null); setOsmRoute([]);
      fetchOrders(); setTab('track');
    } catch { showNotif('Failed to place order. Please try again.'); }
    finally { setPlacing(false); }
  };

  const handlePayment = async (orderId: string) => {
    try {
      await axios.post(`${API}/orders/${orderId}/payment`, { paymentReference: `PAY-${Date.now()}` }, { headers });
      showNotif('💳 Payment confirmed! Thank you.'); fetchOrders();
    } catch { showNotif('Payment failed. Please try again.'); }
  };

  const handleRating = async () => {
    if (!ratingForm) return;
    try {
      await axios.post(`${API}/orders/${ratingForm.orderId}/rating`, { rating: ratingForm.rating, feedback: ratingForm.feedback }, { headers });
      showNotif('⭐ Rating submitted! Thank you.'); setRatingForm(null); fetchOrders();
    } catch { showNotif('Failed to submit rating.'); }
  };

  const handleInvoice = async (orderId: string) => {
    try {
      const r = await axios.get(`${API}/orders/${orderId}/invoice`, { headers });
      const inv = r.data;
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(`<html><head><title>Invoice ${inv.invoiceNumber}</title><style>body{font-family:sans-serif;padding:40px;max-width:600px;margin:auto}h1{color:#1e40af}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #e5e7eb}.total{font-size:1.2em;font-weight:bold;color:#1e40af}</style></head><body>
          <h1>Smart Delivery Invoice</h1><p><b>${inv.invoiceNumber}</b> &nbsp;|&nbsp; ${new Date(inv.date).toLocaleDateString()}</p>
          <hr/><h3>Customer</h3><p>${inv.customer?.name} | ${inv.customer?.email}</p>
          <h3>Delivery Details</h3><table>
            <tr><td>Pickup</td><td>${inv.pickup}</td></tr>
            <tr><td>Dropoff</td><td>${inv.dropoff}</td></tr>
            <tr><td>Type</td><td>${inv.deliveryType}</td></tr>
            <tr><td>Priority</td><td>${inv.priority}</td></tr>
            <tr><td>Weight</td><td>${inv.packageWeight} kg</td></tr>
            <tr><td>Payment</td><td>${inv.paymentMethod} — ${inv.paymentStatus}</td></tr>
          </table>
          <h3>Billing</h3><table>
            <tr><td>Subtotal</td><td>₹${inv.subtotal}</td></tr>
            <tr><td>GST (18%)</td><td>₹${inv.tax}</td></tr>
            <tr class="total"><td><b>Total</b></td><td><b>₹${inv.total}</b></td></tr>
          </table>
          <br/><p style="color:#6b7280;font-size:0.8em">Status: ${inv.status} | Driver: ${inv.driver?.name || 'N/A'}</p>
        </body></html>`);
      }
    } catch { showNotif('Failed to generate invoice.'); }
  };

  const stepIndex = (status: string) => STATUS_STEPS.indexOf(status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 font-sans text-white">
      {notification && (
        <div className="fixed top-4 right-4 z-[99999] bg-white text-gray-800 px-5 py-3 rounded-2xl shadow-2xl border border-gray-100 flex items-center gap-3 animate-bounce max-w-sm">
          <span className="text-sm font-semibold">{notification}</span>
          <button onClick={() => setNotification(null)}><X size={14} /></button>
        </div>
      )}

      <header className="bg-white/5 backdrop-blur-md border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500 p-2 rounded-xl"><Package size={22} /></div>
          <h1 className="text-xl font-black">Smart Delivery</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white/10 rounded-xl p-1">
            {(['order','track','history'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-all ${tab === t ? 'bg-blue-500 text-white shadow-lg' : 'text-white/60 hover:text-white'}`}>
                {t === 'order' ? '📦 New Order' : t === 'track' ? '🚗 Track' : '📋 History'}
              </button>
            ))}
          </div>
          <button onClick={() => { localStorage.clear(); window.location.href = '/'; }} className="text-white/50 hover:text-white"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {tab === 'order' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h2 className="text-lg font-black mb-4 text-blue-300">📍 Set Locations</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-white/50 uppercase mb-1 block">Pickup Location</label>
                    <LocationSearch placeholder="Search pickup (e.g. SRM University)" value={pickup} onChange={setPickup}
                      onSelect={(lat,lng,addr) => { setPickupLoc({lat,lng}); setPickup(addr); setMapCenter([lat,lng]); }} color="green" id="pickup-search" />
                    <button onClick={() => { clickMode.current = clickMode.current === 'pickup' ? null : 'pickup'; }}
                      className={`mt-1 text-xs px-3 py-1 rounded-lg transition-all ${clickMode.current === 'pickup' ? 'bg-green-500 text-white' : 'bg-white/10 text-white/50'}`}>
                      📌 Click map to pin pickup
                    </button>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white/50 uppercase mb-1 block">Drop Location</label>
                    <LocationSearch placeholder="Search dropoff location" value={dropoff} onChange={setDropoff}
                      onSelect={(lat,lng,addr) => { setDropLoc({lat,lng}); setDropoff(addr); }} color="red" id="drop-search" />
                    <button onClick={() => { clickMode.current = clickMode.current === 'drop' ? null : 'drop'; }}
                      className={`mt-1 text-xs px-3 py-1 rounded-lg transition-all ${clickMode.current === 'drop' ? 'bg-red-500 text-white' : 'bg-white/10 text-white/50'}`}>
                      📌 Click map to pin dropoff
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h2 className="text-lg font-black mb-4 text-blue-300">📦 Package Details</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-white/50 uppercase mb-1 block">Category</label>
                    <select value={packageCategory} onChange={e => setPackageCategory(e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white outline-none">
                      <option value="COURIER">Courier</option><option value="FOOD">Food</option>
                      <option value="GROCERY">Grocery</option><option value="MEDICAL">Medical</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white/50 uppercase mb-1 block">Weight (kg)</label>
                    <input type="number" value={packageWeight} onChange={e => setPackageWeight(e.target.value)} min="0.1"
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white/50 uppercase mb-1 block">Priority</label>
                    <select value={priority} onChange={e => setPriority(e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white outline-none">
                      <option value="NORMAL">Normal</option><option value="EXPRESS">Express +50%</option>
                      <option value="EMERGENCY">Emergency +100%</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white/50 uppercase mb-1 block">Payment</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white outline-none">
                      <option value="COD">Cash on Delivery</option><option value="UPI">UPI</option>
                      <option value="CARD">Card</option><option value="WALLET">Wallet</option>
                    </select>
                  </div>
                </div>
                <textarea value={deliveryInstructions} onChange={e => setDeliveryInstructions(e.target.value)}
                  placeholder="Special instructions (optional)" rows={2}
                  className="mt-3 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white outline-none resize-none placeholder-white/30" />
                {quote && (
                  <div className="mt-3 bg-blue-500/20 border border-blue-400/30 rounded-xl p-4 flex justify-between items-center">
                    <div><div className="text-xs text-blue-300">Estimated Price</div><div className="text-2xl font-black text-blue-300">₹{quote.price}</div></div>
                    <div className="text-right">
                      <div className="text-xs text-blue-300">Distance & Time</div>
                      <div className="font-bold">{quote.distance} km {eta !== null && `• ~${eta} mins`}</div>
                    </div>
                  </div>
                )}
                <button onClick={handleCreateOrder} disabled={!pickupLoc || !dropLoc || placing}
                  className="mt-4 w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900">
                  <Navigation size={18} /> {placing ? 'Placing Order...' : 'Place Order'}
                </button>
              </div>
            </div>

            <div className="lg:col-span-3 bg-white/5 rounded-2xl overflow-hidden border border-white/10" style={{minHeight:'500px'}}>
              <MapComponent center={mapCenter} markers={mapMarkers} osmRoute={osmRoute} onMapClick={handleMapClick} zoom={13} />
            </div>
          </div>
        )}

        {tab === 'track' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {orders.filter(o => ['PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT'].includes(o.status)).length === 0
                ? <div className="bg-white/5 rounded-2xl p-8 text-center border border-white/10"><Truck size={40} className="mx-auto mb-3 text-white/20" /><p className="text-white/50">No active deliveries</p><button onClick={() => setTab('order')} className="mt-3 text-blue-400 underline text-sm">Place an order</button></div>
                : orders.filter(o => ['PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT'].includes(o.status)).map(order => {
                  const idx = stepIndex(order.status);
                  const drop = (() => { try { return JSON.parse(order.dropLocation); } catch { return null; } })();
                  return (
                    <div key={order.id} className="bg-white/10 rounded-2xl p-5 border border-white/10">
                      <div className="flex justify-between mb-4">
                        <span className="font-black text-blue-300">#{order.id.slice(0,8)}</span>
                        <span className="bg-blue-500/30 text-blue-300 text-xs font-bold px-3 py-1 rounded-full">{order.status}</span>
                      </div>
                      <div className="flex gap-1 mb-4">
                        {STATUS_STEPS.map((s,i) => (
                          <div key={s} className="flex-1 flex flex-col items-center gap-1">
                            <div className={`w-full h-1.5 rounded-full ${i <= idx ? 'bg-blue-400' : 'bg-white/10'}`} />
                            <span className="text-[9px] text-white/40 text-center leading-tight">{STATUS_LABELS[s]}</span>
                          </div>
                        ))}
                      </div>
                      {order.driver && (
                        <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center font-bold text-sm">
                            {order.driver.user?.name?.[0] || 'D'}
                          </div>
                          <div><div className="font-semibold text-sm">{order.driver.user?.name}</div><div className="text-xs text-white/40">{order.driver.vehicleType}</div></div>
                          <div className="ml-auto text-yellow-400 text-sm">★{order.driver.performanceRating?.toFixed(1)}</div>
                        </div>
                      )}
                      
                      {eta !== null && activeOrder?.id === order.id && (
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-2 mb-3 text-center text-sm font-semibold text-blue-300 flex items-center justify-center gap-2">
                           <Clock size={16} /> Estimated Time: ~{eta} mins
                        </div>
                      )}

                      <div className="text-xs text-white/50 mb-2">OTP: <span className="font-bold text-white text-base tracking-widest">{order.otp}</span></div>
                      <button onClick={() => { 
                        setActiveOrder(order); 
                        if(drop) setMapCenter([drop.lat, drop.lng]);
                        if(drop && order.pickupLocation) {
                           try {
                             const p = JSON.parse(order.pickupLocation);
                             fetchOsrmRoute(p, drop).then(({ coords, duration }) => {
                               setOsmRoute(coords);
                               setEta(Math.round(duration / 60));
                             });
                           } catch {}
                        }
                      }}
                        className="w-full bg-blue-600/40 hover:bg-blue-600/60 text-blue-300 font-bold py-2 rounded-xl text-sm transition-all">
                        📍 Track on Map
                      </button>
                    </div>
                  );
                })
              }
            </div>
            <div className="lg:col-span-3 bg-white/5 rounded-2xl overflow-hidden border border-white/10" style={{minHeight:'500px'}}>
              <MapComponent center={mapCenter} markers={activeOrder ? (() => {
                const m = [];
                try { const p = JSON.parse(activeOrder.pickupLocation); m.push({...p, label:'Pickup', type:'pickup'}); } catch {}
                try { const d = JSON.parse(activeOrder.dropLocation); m.push({...d, label:'Dropoff', type:'drop'}); } catch {}
                return m;
              })() : []} driverLocation={driverLocation} zoom={14} />
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="max-w-3xl mx-auto space-y-4">
            <h2 className="text-2xl font-black text-blue-300 mb-6">Order History</h2>
            {orders.length === 0 && <div className="text-center text-white/40 py-16">No orders yet</div>}
            {orders.map(order => {
              const isExpanded = expandedOrder === order.id;
              const delivered = order.status === 'DELIVERED';
              return (
                <div key={order.id} className={`bg-white/10 rounded-2xl border transition-all ${isExpanded ? 'border-blue-400/40' : 'border-white/10'}`}>
                  <button onClick={() => setExpandedOrder(isExpanded ? null : order.id)} className="w-full flex items-center justify-between p-5">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${delivered ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {delivered ? <CheckCircle size={20} /> : <Package size={20} />}
                      </div>
                      <div className="text-left">
                        <div className="font-bold">#{order.id.slice(0,8)}</div>
                        <div className="text-xs text-white/40">{new Date(order.createdAt).toLocaleDateString()} · ₹{order.price}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${delivered ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>{order.status}</span>
                      {isExpanded ? <ChevronUp size={18} className="text-white/40" /> : <ChevronDown size={18} className="text-white/40" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-white/10 p-5 space-y-3">
                      <div className="text-sm text-white/60">Payment: <span className={`font-bold ${order.paymentStatus === 'PAID' ? 'text-green-400' : 'text-yellow-400'}`}>{order.paymentStatus}</span></div>
                      {order.rating && <div className="text-sm text-white/60">Your Rating: <span className="text-yellow-400">{'★'.repeat(order.rating)}{'☆'.repeat(5-order.rating)}</span></div>}
                      <div className="flex flex-wrap gap-2">
                        {delivered && order.paymentStatus !== 'PAID' && (
                          <button onClick={() => handlePayment(order.id)} className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all">💳 Pay Now ₹{order.price}</button>
                        )}
                        {delivered && !order.rating && (
                          <button onClick={() => setRatingForm({ orderId: order.id, rating: 5, feedback: '' })} className="bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all">⭐ Rate Delivery</button>
                        )}
                        {delivered && (
                          <button onClick={() => handleInvoice(order.id)} className="bg-blue-700/50 hover:bg-blue-700 text-blue-300 text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1"><FileText size={12} /> Invoice</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {ratingForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[99999] p-4">
          <div className="bg-slate-800 border border-white/20 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-xl font-black mb-4">Rate Your Delivery ⭐</h3>
            <div className="flex gap-2 mb-4 justify-center">
              {[1,2,3,4,5].map(s => (
                <button key={s} onClick={() => setRatingForm(f => f ? {...f, rating:s} : null)}
                  className={`text-3xl transition-transform hover:scale-110 ${s <= ratingForm.rating ? 'text-yellow-400' : 'text-white/20'}`}>★</button>
              ))}
            </div>
            <textarea value={ratingForm.feedback} onChange={e => setRatingForm(f => f ? {...f, feedback:e.target.value} : null)}
              placeholder="Share your experience..." rows={3}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white outline-none resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setRatingForm(null)} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 rounded-xl transition-all">Cancel</button>
              <button onClick={handleRating} className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-white font-bold py-2.5 rounded-xl transition-all">Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
