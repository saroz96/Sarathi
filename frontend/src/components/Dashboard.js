import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faTachometerAlt, 
  faPlusCircle, 
  faSignOutAlt, 
  faSearch, 
  faCheckCircle, 
  faExclamationCircle, 
  faBuilding, 
  faDoorOpen, 
  faEye 
} from '@fortawesome/free-solid-svg-icons';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'animate.css/animate.min.css';
import '../stylesheet/Dashboard.css'; // We'll extract the CSS to a separate file
import LogoutButton from './retailer/credential/Logout';

const Dashboard = ({ user, companies, isAdminOrSupervisor, messages, error }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Filter companies based on search term
  const filteredCompanies = companies.filter(company => 
    company.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT' && e.key !== 'Enter') return;
      if (filteredCompanies.length === 0) return;

      switch(e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (currentRowIndex < filteredCompanies.length - 1) {
            setCurrentRowIndex(currentRowIndex + 1);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (currentRowIndex > 0) {
            setCurrentRowIndex(currentRowIndex - 1);
          }
          break;
        case 'Enter':
          e.preventDefault();
          const companyId = filteredCompanies[currentRowIndex]._id;
          navigate(`/switch/${companyId}`);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentRowIndex, filteredCompanies, navigate]);

  // Reset row index when search changes
  useEffect(() => {
    setCurrentRowIndex(0);
  }, [searchTerm]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleRowClick = (index) => {
    setCurrentRowIndex(index);
  };

  const handleLogout = () => {
    setLoading(true);
    // Add your logout logic here
  };

  return (

    <div className="dashboard">
            <LogoutButton/>

      Top Navigation Bar
      <nav className="navbar navbar-expand-lg navbar-light">
        <div className="container-fluid">
          <Link className="navbar-brand" to="/dashboard">
            <FontAwesomeIcon icon={faTachometerAlt} className="me-2" />
            Dashboard | {user.name}
          </Link>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse" id="navbarNav">
            <ul className="navbar-nav ms-auto">
              {isAdminOrSupervisor && (
                <li className="nav-item">
                  <Link className="nav-link" to="/company/new">
                    <FontAwesomeIcon icon={faPlusCircle} className="me-1" />
                    Create Company
                  </Link>
                </li>
              )}
              <li className="nav-item">
                <Link className="nav-link" to="/logout" onClick={handleLogout}>
                  <FontAwesomeIcon icon={faSignOutAlt} className="me-1" />
                  Logout
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <div className="dashboard-container">
        <div className="card dashboard-card animate__animated animate__fadeInUp">
          <div className="card-header">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <h1 className="welcome-title">Welcome, {user.name}</h1>
                <h2 className="card-title">Your Companies</h2>
              </div>
              <div className="search-container">
                <div className="input-group">
                  <span className="input-group-text bg-white">
                    <FontAwesomeIcon icon={faSearch} />
                  </span>
                  <input 
                    type="text" 
                    className="form-control search-input" 
                    placeholder="Search companies..." 
                    value={searchTerm}
                    onChange={handleSearchChange}
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="card-body p-0">
            {messages && (
              <div className="alert alert-success alert-dismissible fade show m-3" role="alert">
                <FontAwesomeIcon icon={faCheckCircle} className="me-2" />
                {messages}
                <button type="button" className="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
              </div>
            )}

            {error && (
              <div className="alert alert-danger alert-dismissible fade show m-3" role="alert">
                <FontAwesomeIcon icon={faExclamationCircle} className="me-2" />
                {error}
                <button type="button" className="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
              </div>
            )}

            {filteredCompanies.length === 0 && searchTerm ? (
              <div className="no-results" id="noResultsMessage">
                <FontAwesomeIcon icon={faBuilding} className="fa-3x mb-3" />
                <h4>No Companies Found</h4>
                <p>Try adjusting your search or create a new company</p>
              </div>
            ) : companies.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Company Name</th>
                      <th>Trade Type</th>
                      <th>Date Format</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="companyList">
                    {filteredCompanies.map((company, index) => (
                      <tr 
                        key={company._id}
                        className={`searchable-row ${index === currentRowIndex ? 'focused-row' : ''}`}
                        tabIndex="0"
                        onClick={() => handleRowClick(index)}
                        onMouseEnter={() => handleRowClick(index)}
                      >
                        <td>{index + 1}</td>
                        <td>
                          <strong>{company.name}</strong>
                        </td>
                        <td>
                          <span className="badge bg-primary">{company.tradeType}</span>
                        </td>
                        <td>
                          <span className="badge bg-info text-dark">
                            {company.dateFormat.charAt(0).toUpperCase() + company.dateFormat.slice(1)}
                          </span>
                        </td>
                        <td className="text-end">
                          <div className="action-buttons d-flex justify-content-end">
                            <Link 
                              to={`/switch/${company._id}`} 
                              className="btn btn-primary btn-sm open-btn me-2"
                              onClick={() => setLoading(true)}
                            >
                              <FontAwesomeIcon icon={faDoorOpen} className="me-1" />
                              Open
                            </Link>
                            <Link 
                              to={`/company/${company._id}`} 
                              className="btn btn-info btn-sm view-btn"
                              title="View Details"
                              onClick={() => setLoading(true)}
                            >
                              <FontAwesomeIcon icon={faEye} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-5">
                <FontAwesomeIcon icon={faBuilding} className="fa-3x text-muted mb-3" />
                <h4>No Companies Available</h4>
                <p className="text-muted">You don't have any companies yet. Create your first company to get started.</p>
                <Link to="/company/new" className="btn btn-primary mt-3" onClick={() => setLoading(true)}>
                  <FontAwesomeIcon icon={faPlusCircle} className="me-2" />
                  Create Company
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loader */}
      {loading && (
        <div id="loader">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;