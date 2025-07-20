import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { useAuth } from '../../../context/AuthContext';

const LoginForm = () => {
    const { login } = useAuth(); // Add this line
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingPercentage, setLoadingPercentage] = useState(0);
    const [messages, setMessages] = useState('');
    const [error, setError] = useState('');
    const [isButtonClicked, setIsButtonClicked] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // Simulate checking for messages/errors from server (like flash messages)
        // You would typically get these from props or context in a real app
        const urlParams = new URLSearchParams(window.location.search);
        const msg = urlParams.get('message');
        const err = urlParams.get('error');

        if (msg) setMessages(msg);
        if (err) setError(err);
    }, []);

    useEffect(() => {
        if (loading) {
            const interval = setInterval(() => {
                setLoadingPercentage(prev => {
                    if (prev >= 100) {
                        clearInterval(interval);
                        return 100;
                    }
                    return prev + 10;
                });
            }, 100);

            return () => clearInterval(interval);
        }
    }, [loading]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isButtonClicked) return;

        setLoading(true);
        setLoadingPercentage(0);

        // Simulate API call
        setTimeout(() => {
            // Replace with actual login logic
            console.log('Login attempted with:', { email, password });
            login({ email, password });
            setLoading(false);

            // For demo, just redirect after "loading"
            navigate('/dashboard');
        }, 2000);
    };

    // // Updated handleSubmit function
    // const handleSubmit = async (e) => {
    //     e.preventDefault();
    //     setIsButtonClicked(true);

    //     try {
    //         setLoading(true);
    //         setError('');

    //         // Call the actual login function from AuthContext
    //         await login({ email, password });

    //         // Redirect based on user role (handled in AuthProvider)
    //     } catch (err) {
    //         setError(err);
    //     } finally {
    //         setLoading(false);
    //     }
    // };

    // Remove the simulation code completely

    const handleSocialLogin = (provider) => {
        setLoading(true);
        console.log(`Logging in with ${provider}`);
        // Implement social login logic here
    };

    const moveToNextInput = (e, currentIndex) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const form = e.target.form;
            if (form.elements[currentIndex + 1]) {
                form.elements[currentIndex + 1].focus();
            }
        }
    };

    return (
        <div style={styles.body}>
            {loading && (
                <div style={styles.loader}>
                    <div style={styles.spinner}></div>
                    {/* <p style={styles.loaderPercentageText}>
            Loading... <span style={styles.loaderPercentage}>{loadingPercentage}%</span>
          </p> */}
                </div>
            )}

            <section style={styles.section}>
                <div style={styles.container}>
                    <div style={styles.card}>
                        {messages && (
                            <div className="alert alert-success alert-dismissible fade show text-center" role="alert">
                                {messages}
                                <button type="button" className="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                            </div>
                        )}

                        {error && (
                            <div className="alert alert-danger alert-dismissible fade show text-center" role="alert">
                                {error}
                                <button type="button" className="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                            </div>
                        )}

                        <div style={styles.row}>
                            <div style={styles.imageContainer}>
                                <h1><i></i></h1>
                                <img
                                    src="/logo/logo.jpg"
                                    style={styles.image}
                                    alt="Company Logo"
                                />
                            </div>

                            <div style={styles.formContainer}>
                                <form onSubmit={handleSubmit} id="login-form">
                                    <p className="text-center">Sign in with</p>
                                    <div style={styles.socialButtons}>
                                        <button
                                            type="button"
                                            className="btn btn-facebook"
                                            onClick={() => handleSocialLogin('facebook')}
                                        >
                                            <i className="bi bi-facebook"></i>
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-twitter"
                                            onClick={() => handleSocialLogin('twitter')}
                                        >
                                            <i className="bi bi-twitter"></i>
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-linkedin"
                                            onClick={() => handleSocialLogin('linkedin')}
                                        >
                                            <i className="bi bi-linkedin"></i>
                                        </button>
                                    </div>

                                    <div style={styles.divider}>
                                        <p className="text-center fw-bold mx-3 mb-0">Or</p>
                                    </div>

                                    {/* Email input */}
                                    <div className="form-outline mb-4">
                                        <input
                                            type="email"
                                            id="email"
                                            name="email"
                                            className="form-control form-control-lg"
                                            placeholder="Enter a valid email address"
                                            autoComplete="off"
                                            autoFocus
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            onKeyDown={(e) => moveToNextInput(e, 0)}
                                        />
                                        <label className="form-label" htmlFor="email">Email address</label>
                                    </div>

                                    {/* Password input */}
                                    <div className="form-outline mb-3">
                                        <input
                                            type="password"
                                            id="password"
                                            name="password"
                                            className="form-control form-control-lg"
                                            placeholder="Enter password"
                                            autoComplete="off"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            onKeyDown={(e) => moveToNextInput(e, 1)}
                                        />
                                        <label className="form-label" htmlFor="password">Password</label>
                                    </div>

                                    <div className="d-flex justify-content-between align-items-center">
                                        <Link to="/auth/verify-email">Verify Email</Link>
                                        <Link to="/forgot-password" className="text-body">Forgot password?</Link>
                                    </div>

                                    <div style={styles.submitContainer}>
                                        <button
                                            type="submit"
                                            className="btn btn-primary btn-lg"
                                            id="login-btn"
                                            style={styles.loginButton}
                                            onClick={() => setIsButtonClicked(true)}
                                        >
                                            Login
                                        </button>
                                        <p className="small fw-bold mt-2 pt-1 mb-0">
                                            Don't have an account? <Link to="/register" className="link-danger">Register</Link>
                                        </p>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

const styles = {
    body: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontFamily: 'Arial, sans-serif',
        backgroundImage: 'url(/logo/background.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        position: 'relative',
    },
    loader: {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    spinner: {
        width: '40px',
        height: '40px',
        border: '4px solid rgba(0, 0, 0, 0.1)',
        borderTopColor: '#007bff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },
    section: {
        width: '100%',
    },
    container: {
        maxWidth: '1200px',
        margin: '0 auto',
    },
    card: {
        marginTop: '1rem',
        boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
        padding: '2rem',
        borderRadius: '0.5rem',
    },
    row: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    imageContainer: {
        flex: '1',
        minWidth: '300px',
        maxWidth: '500px',
        textAlign: 'center',
        margin: '1rem',
    },
    image: {
        maxWidth: '100%',
        height: 'auto',
    },
    formContainer: {
        flex: '1',
        minWidth: '300px',
        maxWidth: '400px',
        margin: '1rem',
    },
    socialButtons: {
        display: 'flex',
        justifyContent: 'center',
        gap: '1rem',
        marginBottom: '1rem',
    },
    divider: {
        display: 'flex',
        alignItems: 'center',
        margin: '1rem 0',
    },
    submitContainer: {
        textAlign: 'center',
        marginTop: '1rem',
    },
    loginButton: {
        paddingLeft: '2.5rem',
        paddingRight: '2.5rem',
    },
};

export default LoginForm;