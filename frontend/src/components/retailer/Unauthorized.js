import React from 'react';
import { useNavigate } from 'react-router-dom';

const Unauthorized = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      textAlign: 'center',
      padding: '20px'
    }}>
      <h1>401 - Unauthorized</h1>
      <p>You don't have permission to view this page.</p>
      <div style={{ marginTop: '20px' }}>
        <button 
          onClick={() => navigate(-1)}
          style={{ marginRight: '10px', padding: '8px 16px' }}
        >
          Go Back
        </button>
        <button 
          onClick={() => navigate('/')}
          style={{ padding: '8px 16px' }}
        >
          Home
        </button>
      </div>
    </div>
  );
};

export default Unauthorized;