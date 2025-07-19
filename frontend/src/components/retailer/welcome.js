import React from 'react';
import { Link } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';

const WelcomePage = () => {
  return (
    <div style={styles.body}>
      <div style={styles.container}>
        <h1 style={styles.heading}>Sarathi A/c Software</h1>
        <p style={styles.paragraph}>Get started by creating an account or logging in.</p>
        <Link to="/register" className="btn btn-primary" style={styles.button}>
          Register
        </Link>
        <Link to="/login" className="btn btn-secondary" style={styles.button}>
          Login
        </Link>
      </div>
    </div>
  );
};

const styles = {
  body: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    margin: 0,
    fontFamily: 'Arial, sans-serif',
    backgroundImage: 'url(/logo/background.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
  },
  container: {
    textAlign: 'center',
    background: '#ffffff',
    padding: '3rem',
    borderRadius: '15px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
    maxWidth: '400px',
    width: '100%',
  },
  heading: {
    color: '#007bff',
    fontSize: '2rem',
    marginBottom: '1.5rem',
  },
  paragraph: {
    color: '#495057',
    marginBottom: '2rem',
    fontSize: '1.1rem',
  },
  button: {
    width: '100%',
    padding: '0.75rem 1.5rem',
    fontSize: '1.2rem',
    borderRadius: '8px',
    marginBottom: '1rem',
    transition: 'all 0.3s ease-in-out',
  },
};

export default WelcomePage;