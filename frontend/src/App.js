import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';

import Items from './components/retailer/Items';
import { AuthProvider } from './context/AuthContext';
// import Header from './components/retailer/Header';
import ProtectedRoute from './components/ProtectedRoute';
import Unauthorized from './components/retailer/Unauthorized';

function App() {
  return (
    <AuthProvider>
      <Router>
        {/* <Header /> */}
        <Routes>
          <Route 
            path="/api/items/getitemsinform" 
            element={
              <ProtectedRoute requiredPermission="itemsHeader">
                <Items />
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