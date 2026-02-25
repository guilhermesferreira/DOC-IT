import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_API_URL || `https://${window.location.hostname}:3000`;

const API = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true // IMPORTANTE: Autoriza o envio e recebimento de Cookies
});
// Removemos a injeção manual de Header pois o navegador anexará o HttpOnly Cookie sozinho:
// API.interceptors.request.use(...)

export default API;