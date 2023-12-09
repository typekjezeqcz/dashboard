import React from 'react';
import { Navigate } from 'react-router-dom';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) {
    // If there is no token, redirect to login
    return <Navigate to="/login" />;
  }
  return children;
}

export default ProtectedRoute;