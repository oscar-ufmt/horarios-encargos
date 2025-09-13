// src/api.js
import axios from 'axios';

const api = axios.create({
    baseURL: 'http://10.26.8.128:8000/api', // endereço do seu backend Laravel
    headers: {
        'Content-Type': 'application/json'
    }
});

export default api;
