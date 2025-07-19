import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    user: null,
    permissions: new Map(),
    loading: true,
    isAdminOrSupervisor: false
  });

  const fetchUserData = async () => {
    try {
      const res = await axios.get('/me');
      
      // Convert permissions array back to Map
      const permissionsMap = new Map(res.data.user.menuPermissions);
      
      setAuthState({
        user: res.data.user,
        permissions: permissionsMap,
        loading: false,
        isAdminOrSupervisor: 
          res.data.user.role === 'ADMINISTRATOR' || 
          res.data.user.role === 'Supervisor' || 
          res.data.user.isAdmin
      });
    } catch (err) {
      setAuthState(prev => ({ ...prev, loading: false }));
      console.error('Error fetching user data:', err);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  const hasPermission = (permissionKey) => {
    return (
      authState.isAdminOrSupervisor || 
      authState.permissions.get(permissionKey) === true
    );
  };

  return (
    <AuthContext.Provider value={{ ...authState, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);