import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setCredentials, logout as reduxLogout } from '../auth/authSlice';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const dispatch = useDispatch();
  const { userInfo } = useSelector((state) => state.auth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const hasPermission = (requiredPermission) => {
    if (!userInfo || !userInfo.permissions) return false;
    return userInfo.permissions.includes(requiredPermission);
  };

  const clearAuthData = useCallback(() => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    dispatch(reduxLogout());
  }, [dispatch]);

  const register = async (userData, options = {}) => {
    try {
      setLoading(true);
      setError(null);

      const { data } = await axios.post('/api/auth/register', userData);

      if (options.autoLogin && data.token) {
        localStorage.setItem('token', data.token);
        // await validateToken(data.token);
      }

      return data;
    } catch (err) {
      console.error('Registration error:', err);
      const error = err.response?.data?.error ||
        err.response?.data?.message ||
        'Registration failed';
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Updated login function in AuthProvider
  const login = async (credentials) => {
    try {
      setLoading(true);
      setError(null);

      // Ensure credentials are properly formatted
      const { data } = await axios.post('/api/login', credentials, {
        withCredentials: true // Important for session cookies
      });

      if (!data.success) {
        throw new Error(data.message || 'Login failed');
      }

      dispatch(setCredentials({
        user: data.user
      }));

      return data;
    } catch (err) {
      const error = err.response?.data?.message || err.message || 'Login failed';
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // In your AuthContext.js
  const logout = useCallback(async () => {
    try {
      // Call the logout API endpoint
      await axios.post('/api/logout', {}, { withCredentials: true });

      // Clear frontend auth state
      dispatch(reduxLogout());

      // Optional: Redirect to login page
      // You can handle this in components instead if preferred
    } catch (err) {
      console.error('Logout error:', err);
      // Even if API fails, clear frontend state
      dispatch(reduxLogout());
    }
  }, [dispatch]);

  // const logout = useCallback(() => {
  //   clearAuthData();
  // }, [clearAuthData]);

  const value = {
    currentUser: userInfo,
    loading,
    error,
    hasPermission,
    register,
    login,
    logout,
    clearError: () => setError(null)
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};