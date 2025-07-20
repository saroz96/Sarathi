import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/retailer/Header';
import ProtectedRoute from './components/ProtectedRoute';
import Unauthorized from './components/retailer/Unauthorized';
import Items from './components/retailer/Items';
import WelcomePage from './components/retailer/welcome';
import LoginForm from './components/retailer/credential/Login';
import Dashboard from './components/Dashboard';

function App() {
  const { currentUser } = useAuth();
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* UnProtected Route */}

          <Route path='/' element={
            <>
              <WelcomePage />
            </>
          } />

          {/**Protected Routes */}
          <Route path="/login" element={
            <>
              {!currentUser ? <LoginForm /> : <Navigate to="/dashboard" replace />}
            </>
          } />
          <Route
            path="/api/items/getitemsinform"
            element={
              <ProtectedRoute requiredPermission="itemsHeader">
                <Items />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/unauthorized" element={<Unauthorized />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;