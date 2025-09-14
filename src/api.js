// src/api.js
import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8000/api', // endereço do seu backend Laravel
    headers: {
        'Content-Type': 'application/json'
    }
});

export default api;
