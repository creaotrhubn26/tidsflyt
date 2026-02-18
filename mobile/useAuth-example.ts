import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import api from './api';

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is logged in on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync('authToken');
      if (token) {
        // Verify token with backend
        const { data } = await api.get('/api/user');
        setUser(data);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      await SecureStore.deleteItemAsync('authToken');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const { data } = await api.post('/api/login', { username, password });
      
      // Store token
      if (data.token) {
        await SecureStore.setItemAsync('authToken', data.token);
      }
      
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Login failed' 
      };
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      await SecureStore.deleteItemAsync('authToken');
      setUser(null);
    }
  };

  const register = async (username: string, password: string, name: string) => {
    try {
      const { data } = await api.post('/api/register', { username, password, name });
      
      if (data.token) {
        await SecureStore.setItemAsync('authToken', data.token);
      }
      
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Registration failed' 
      };
    }
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    register,
    checkAuth,
  };
}
