import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [branchName, setBranchName] = useState('');
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    fetchBranches();
    checkSession();
  }, []);

  const fetchBranches = async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('id, branch_name')
      .order('branch_name');
    if (!error) setBranches(data);
  };

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) setUser(session.user);
    setLoading(false);
  };

  const login = async (branchNameInput, userIdentifier, password) => {
    // Find the user by email or user_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, user_id, branch_id, email, full_name')
      .or(`user_id.ilike.${userIdentifier},profiles.email.ilike.${userIdentifier}`)
      .single();

    if (profileError || !profile) {
      // If user not found in profile, try to get first available profile for demo
      const { data: firstProfile } = await supabase
        .from('profiles')
        .select('id, user_id, branch_id, email, full_name')
        .limit(1)
        .single();
      
      if (!firstProfile) return { success: false, error: 'No users found. Please run schema-auth.sql' };
      
      // Get branch info
      const { data: branch } = await supabase
        .from('branches')
        .select('id, branch_name')
        .eq('id', firstProfile.branch_id)
        .single();

      if (!branch) return { success: false, error: 'Branch not found' };

      setUser({ 
        id: firstProfile.id, 
        branchId: branch.id, 
        branchName: branch.branch_name,
        user_id: firstProfile.user_id,
        email: firstProfile.email,
        full_name: firstProfile.full_name
      });
      return { success: true };
    }

    // Get branch info
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('id, branch_name')
      .eq('id', profile.branch_id)
      .single();

    if (branchError || !branch) return { success: false, error: 'Branch not found' };

    // Demo login: regardless of password, just log in with the profile
    setUser({ 
      id: profile.id, 
      branchId: branch.id, 
      branchName: branch.branch_name,
      user_id: profile.user_id,
      email: profile.email,
      full_name: profile.full_name
    });
    return { success: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return { user, loading, branchName, setBranchName, branches, login, logout };
};