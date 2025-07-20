// components/common/LogoutButton.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from 'react-bootstrap/Button';
import { useAuth } from '../../../context/AuthContext';

const LogoutButton = ({ variant = 'danger', size = 'sm', className = '' }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login'); // Redirect after logout
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <Button 
      variant={variant}
      size={size}
      className={className}
      onClick={handleLogout}
    >
      Logout
    </Button>
  );
};

export default LogoutButton;