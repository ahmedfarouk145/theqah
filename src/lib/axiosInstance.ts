// src/lib/axiosInstance.ts
import axios from 'axios';
import { getAuth } from 'firebase/auth';
import { app } from './firebase';

const instance = axios.create();

instance.interceptors.request.use(async (config) => {
  const user = getAuth(app).currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default instance;
