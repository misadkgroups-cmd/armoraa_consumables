import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

const Login = () => {
  const [view, setView] = useState('login');
  const [error, setError] = useState('');
  
  const { user, loading, login, logout } = useAuth();

  useEffect(() => {
    if (user) setView('dashboard');
  }, [user]);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setError('');
    
    const result = await login('', 'demo', 'demo');
    if (!result.success) {
      setError(result.error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 max-w-md w-full border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-4">Welcome Back!</h2>
          <p className="text-slate-300 mb-6">You are logged in successfully.</p>
          <button
            onClick={logout}
            className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 relative overflow-hidden">
      {/* DNA Helix Background */}
      <div className="absolute inset-0 opacity-30">
        <svg className="absolute right-0 top-0 h-full w-full" viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M400 0C400 0 600 100 600 200C600 300 400 400 400 400C400 400 600 500 600 600C600 700 400 800 400 800" stroke="#3B82F6" stroke-width="2" opacity="0.6"/>
          <path d="M400 0C400 0 200 100 200 200C200 300 400 400 400 400C400 400 200 500 200 600C200 700 400 800 400 800" stroke="#3B82F6" stroke-width="2" opacity="0.6"/>
          {[...Array(20)].map((_, i) => (
            <g key={i}>
              <line x1="400" y1={i * 40} x2="600" y2={i * 40 + 40} stroke="#3B82F6" stroke-width="1.5" opacity="0.4"/>
              <line x1="400" y1={i * 40} x2="200" y2={i * 40 + 40} stroke="#3B82F6" stroke-width="1.5" opacity="0.4"/>
              <circle cx="600" cy={i * 40 + 40} r="3" fill="#3B82F6" opacity="0.6"/>
              <circle cx="200" cy={i * 40 + 40} r="3" fill="#3B82F6" opacity="0.6"/>
            </g>
          ))}
        </svg>
      </div>

      <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 max-w-md w-full border border-white/20 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <img src="/armoraa-logo.png" alt="ARMORAA Logo" className="h-16 w-auto mx-auto" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome back!</h1>
          <p className="text-slate-300">Click the button below to login</p>
        </div>

        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white py-4 rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg shadow-lg shadow-blue-600/50"
        >
          Login
        </button>

        {error && (
          <div className="mt-4 bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-white/10">
          <p className="text-xs text-slate-400 text-center">
            Secure Branch-Aware Authentication System
          </p>
        </div>
      </div>

      {/* Decorative gradient orbs */}
      <div className="absolute top-20 left-20 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-20 right-20 w-72 h-72 bg-blue-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
    </div>
  );
};

export default Login;