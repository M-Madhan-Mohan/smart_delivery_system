import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Truck, Package, Activity } from 'lucide-react';
import CustomerDashboard from './pages/CustomerDashboard';
import DriverDashboard from './pages/DriverDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Auth from './pages/Auth';

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col justify-center items-center font-sans">
      <div className="text-center max-w-3xl p-8 bg-white/40 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50">
        <h1 className="text-5xl md:text-6xl font-black text-gray-900 tracking-tight mb-6">
          Smart <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">Delivery</span>
        </h1>
        <p className="text-xl text-gray-600 mb-10 font-medium">
          Real-time logistics optimization powered by advanced algorithms.
        </p>
        <div className="flex flex-col md:flex-row gap-4 justify-center">
          <Link to="/login/customer" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-2xl shadow-xl flex items-center justify-center gap-3">
            <Package size={22} /> Customer Portal
          </Link>
          <Link to="/login/driver" className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-2xl shadow-xl flex items-center justify-center gap-3">
            <Truck size={22} /> Driver Dashboard
          </Link>
          <Link to="/login/admin" className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 px-8 rounded-2xl shadow-xl flex items-center justify-center gap-3">
            <Activity size={22} /> Admin Console
          </Link>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login/customer" element={<Auth role="CUSTOMER" />} />
        <Route path="/login/driver" element={<Auth role="DRIVER" />} />
        <Route path="/login/admin" element={<Auth role="ADMIN" />} />
        <Route path="/customer" element={<CustomerDashboard />} />
        <Route path="/driver" element={<DriverDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
