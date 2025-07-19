// components/ProtectedRoute.js
import { Navigate, Route } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, requiredPermission }) => {
  const { hasPermission, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  return hasPermission(requiredPermission) ? children : <Navigate to="/unauthorized" replace />;
};

export default ProtectedRoute;