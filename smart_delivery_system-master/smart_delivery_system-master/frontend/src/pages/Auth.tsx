import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function Auth({ role }: { role: string }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bankDetails, setBankDetails] = useState('');
  const [shiftHours, setShiftHours] = useState('09:00-17:00');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = isLogin ? '/auth/login' : '/auth/register';
    try {
      const res = await axios.post(`http://localhost:5001/api${endpoint}`, {
        email, password, name, phone, role,
        vehicleType: role === 'DRIVER' ? 'BIKE' : undefined,
        capacity: role === 'DRIVER' ? 20 : undefined,
        bankDetails: role === 'DRIVER' ? bankDetails : undefined,
        shiftHours: role === 'DRIVER' ? shiftHours : undefined
      });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate(`/${role.toLowerCase()}`);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Auth failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-96">
        <h2 className="text-2xl font-bold mb-6 text-center">{isLogin ? 'Login' : 'Register'} as {role}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <input type="text" placeholder="Name" value={name} onChange={e => setName(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl outline-none" required />
              <input type="text" placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl outline-none" required />
              {role === 'DRIVER' && (
                <>
                  <input type="text" placeholder="Bank Details (A/C, IFSC)" value={bankDetails} onChange={e => setBankDetails(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl outline-none" required />
                  <input type="text" placeholder="Shift Hours (e.g. 09:00-17:00)" value={shiftHours} onChange={e => setShiftHours(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl outline-none" required />
                </>
              )}
            </>
          )}
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl outline-none" required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl outline-none" required />
          <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg">{isLogin ? 'Login' : 'Register'}</button>
        </form>
        <button onClick={() => setIsLogin(!isLogin)} className="w-full mt-4 text-blue-600 text-sm">{isLogin ? 'Need an account? Register' : 'Have an account? Login'}</button>
      </div>
    </div>
  );
}
