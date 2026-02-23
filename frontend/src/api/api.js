import axios from 'axios';

const API = axios.create({
  baseURL: 'https://localhost:3000',
  withCredentials: true // IMPORTANTE: Autoriza o envio e recebimento de Cookies
});

// Removemos a injeção manual de Header pois o navegador anexará o HttpOnly Cookie sozinho:
// API.interceptors.request.use(...)

export default API;