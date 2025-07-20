// src/store.js
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../src/auth/authSlice'; // Adjust path as needed

export const store = configureStore({
    reducer: {
        auth: authReducer,
        // other reducers...
    },
});
