import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import logo from './10fc black.png';

const Header = () => {
  const navigate = useNavigate();
  const userRole = localStorage.getItem('userRole');

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <header className="bg-white py-4">
      <nav className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center">
        {/* Logo */}
        <div className="mb-4 md:mb-0">
          <Link to="/" className="text-gray-900 hover:text-blue-600 font-medium">
            <img src={logo} alt="Dashboard Logo" className="h-6 mx-auto md:mx-0" />
          </Link>
        </div>

        {/* Links and Logout Button */}
        <div className="flex flex-row justify-between items-center space-x-6 w-full md:w-auto">
          {userRole === 'admin' && (
            <>
              <Link to="/users" className="text-gray-900 hover:text-blue-600 font-medium">Create User</Link>
              <Link to="/admin-dashboard" className="text-gray-900 hover:text-blue-600 font-medium">Manage Users</Link>
            </>
          )}
          <button
            onClick={handleLogout}
            className="text-blue-600 hover:text-white border border-blue-600 hover:bg-blue-600 rounded-full px-5 py-2 transition-colors duration-300"
          >
            Log Out
          </button>
        </div>
      </nav>
    </header>
  );
};

export default Header;
