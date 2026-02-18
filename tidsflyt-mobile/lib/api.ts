import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Change to your backend URL
const API_URL = __DEV__ 
  ? 'http://localhost:5000'  // Local development
  : 'https://your-production-url.com';  // Production

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Auth interceptor - add token to requests
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401 unauthorized
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      await SecureStore.deleteItemAsync('authToken');
      // You can add navigation logic here
    }
    return Promise.reject(error);
  }
);

export default api;

// API client with TypeScript types
export const timeEntriesApi = {
  getAll: () => api.get('/api/time-entries'),
  getById: (id: number) => api.get(`/api/time-entries/${id}`),
  create: (data: any) => api.post('/api/time-entries', data),
  update: (id: number, data: any) => api.patch(`/api/time-entries/${id}`, data),
  delete: (id: number) => api.delete(`/api/time-entries/${id}`),
};

export const leaveApi = {
  getTypes: () => api.get('/api/leave/types'),
  getBalance: (userId: string, year: number) => 
    api.get(`/api/leave/balance?userId=${userId}&year=${year}`),
  getRequests: (userId?: string, status?: string) => 
    api.get('/api/leave/requests', { params: { userId, status } }),
  createRequest: (data: any) => api.post('/api/leave/requests', data),
  approveRequest: (id: number, status: string, notes?: string) => 
    api.patch(`/api/leave/requests/${id}`, { status, notes }),
};

export const recurringApi = {
  getAll: () => api.get('/api/recurring'),
  create: (data: any) => api.post('/api/recurring', data),
  update: (id: number, data: any) => api.patch(`/api/recurring/${id}`, data),
  delete: (id: number) => api.delete(`/api/recurring/${id}`),
  generate: () => api.post('/api/recurring/generate'),
};

export const overtimeApi = {
  getSettings: () => api.get('/api/overtime/settings'),
  updateSettings: (data: any) => api.post('/api/overtime/settings', data),
  getEntries: () => api.get('/api/overtime/entries'),
  getSummary: (month: string) => api.get(`/api/overtime/summary?month=${month}`),
  calculate: (startDate: string, endDate: string) => 
    api.post('/api/overtime/calculate', { startDate, endDate }),
  approve: (id: number, status: string, notes?: string) => 
    api.patch(`/api/overtime/entries/${id}/approve`, { status, notes }),
};

export const invoicesApi = {
  getAll: () => api.get('/api/invoices'),
  getById: (id: number) => api.get(`/api/invoices/${id}`),
  generate: (data: any) => api.post('/api/invoices/generate', data),
  getPDF: (id: number) => api.get(`/api/invoices/${id}/pdf`, { responseType: 'blob' }),
  updateStatus: (id: number, status: string) => 
    api.patch(`/api/invoices/${id}/status`, { status }),
};

export const reportsApi = {
  exportExcel: (params: any) => 
    api.get('/api/export/excel', { params, responseType: 'blob' }),
  exportCSV: (params: any) => 
    api.get('/api/export/csv', { params, responseType: 'blob' }),
  exportPDF: (params: any) => 
    api.get('/api/export/pdf', { params }),
};
