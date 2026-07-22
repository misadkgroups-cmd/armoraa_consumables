import { supabase } from '../config/supabase';

// Generate a unique session token
const generateSessionToken = () => {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
};

// Get current session info
export const getCurrentSession = async () => {
  const sessionToken = localStorage.getItem('sessionToken');
  if (!sessionToken) return null;

  const { data, error } = await supabase
    .from('user_sessions')
    .select(`*, users:user_id (username, role, branch_id)`)
    .eq('session_token', sessionToken)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data;
};

// Check if user has an active session (for concurrent login detection)
export const checkActiveSession = async (userId) => {
  const { data, error } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data;
};

// Create a new session
export const createSession = async (userId, ipAddress = null, deviceInfo = null) => {
  const sessionToken = generateSessionToken();
  const { data, error } = await supabase
    .from('user_sessions')
    .insert({
      user_id: userId,
      session_token: sessionToken,
      ip_address: ipAddress || 'unknown',
      device_info: deviceInfo || navigator.userAgent,
      is_active: true
    })
    .select()
    .single();

  if (error) return { success: false, error };
  
  localStorage.setItem('sessionToken', sessionToken);
  localStorage.setItem('sessionLoginTime', Date.now().toString());
  
  return { success: true, session: data };
};

// End a session (logout or conflict)
export const endSession = async (sessionToken = null, reason = 'logout') => {
  const tokenToEnd = sessionToken || localStorage.getItem('sessionToken');
  if (!tokenToEnd) return { success: true };

  // First get the session to update logout time
  const { data: session } = await supabase
    .from('user_sessions')
    .select('user_id')
    .eq('session_token', tokenToEnd)
    .maybeSingle();

  if (session) {
    await supabase
      .from('user_sessions')
      .update({ 
        is_active: false, 
        logout_time: new Date().toISOString() 
      })
      .eq('session_token', tokenToEnd);
  }

  localStorage.removeItem('sessionToken');
  localStorage.removeItem('sessionLoginTime');
  
  return { success: true };
};

// Check if current session is still valid
export const validateSession = async () => {
  const sessionToken = localStorage.getItem('sessionToken');
  if (!sessionToken) return false;

  // MIS direct login tokens start with 'mis_' - these are NOT stored in the DB,
  // they are direct/offline tokens that are always valid until logout.
  if (sessionToken.startsWith('mis_')) return true;

  const { data, error } = await supabase
    .from('user_sessions')
    .select('is_active, logout_time')
    .eq('session_token', sessionToken)
    .maybeSingle();

  if (error || !data || !data.is_active) return false;
  return true;
};

// Update heartbeat for active session
export const updateHeartbeat = async () => {
  const sessionToken = localStorage.getItem('sessionToken');
  if (!sessionToken) return;

  await supabase
    .from('user_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('session_token', sessionToken);
};

// Logout user due to concurrent login
export const logoutConcurrentUser = async (userId) => {
  await supabase
    .from('user_sessions')
    .update({ is_active: false, logout_time: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_active', true);
};

// Get all sessions for a user (for admin view)
export const getUserSessions = async (userId) => {
  const { data, error } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('login_time', { ascending: false });

  if (error) return [];
  return data;
};

// Start heartbeat interval
export const startHeartbeat = (intervalMs = 30000) => {
  if (!localStorage.getItem('sessionToken')) return null;
  
  return setInterval(() => {
    updateHeartbeat();
  }, intervalMs);
};

// Clear heartbeat
export const clearHeartbeat = (intervalId) => {
  if (intervalId) clearInterval(intervalId);
};