import { useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabase';

const NotificationBell = ({ userId, onConflictLogin }) => {
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const dropdownRef = useRef(null);

  // Check for session conflicts periodically
  useEffect(() => {
    if (!userId) return;

    const checkSessionConflicts = async () => {
      const sessionToken = localStorage.getItem('sessionToken');
      if (!sessionToken) return;

      // Check if our session is still active
      const { data: session, error } = await supabase
        .from('user_sessions')
        .select('is_active, logout_time')
        .eq('session_token', sessionToken)
        .single();

      if (session && !session.is_active) {
        // Session was ended by another login - show notification
        setNotifications([{
          id: 'conflict',
          type: 'conflict',
          message: 'Your login credential was used on another device',
          timestamp: new Date().toISOString()
        }]);
        setHasUnread(true);
      }
    };

    // Check every 30 seconds
    const interval = setInterval(checkSessionConflicts, 30000);
    
    // Also check on focus
    const handleFocus = () => checkSessionConflicts();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [userId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notification) => {
    if (notification.type === 'conflict' && onConflictLogin) {
      await onConflictLogin();
    }
    setNotifications([]);
    setHasUnread(false);
    setShowDropdown(false);
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    setHasUnread(false);
    setShowDropdown(false);
  };

  if (!hasUnread && notifications.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 rounded-lg bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors"
        title="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {hasUnread && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-violet-500/30 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="p-3 border-b border-violet-500/20 flex justify-between items-center">
            <h3 className="text-sm font-bold text-white">Notifications</h3>
            {notifications.length > 0 && (
              <button 
                onClick={clearAllNotifications}
                className="text-xs text-violet-300 hover:text-white"
              >
                Clear all
              </button>
            )}
          </div>
          
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">
              No notifications
            </div>
          ) : (
            <div>
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="p-4 border-b border-violet-500/10 hover:bg-violet-500/10 cursor-pointer transition-colors"
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-white font-medium">{notification.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Click to login again
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;