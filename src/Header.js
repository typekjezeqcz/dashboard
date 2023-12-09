import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';

const Header = () => {
  const navigate = useNavigate();
  const userRole = localStorage.getItem('userRole');

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <header className="bg-white py-4">
      <nav className="max-w-6xl mx-auto px-6 flex justify-between items-center">
        <div className="flex items-start space-x-6">
        <Link to="/" className="text-gray-900 hover:text-blue-600 font-medium">Dashboard</Link>
          {userRole === 'admin' && (
            <>
              <Link to="/users" className="text-gray-900 hover:text-blue-600 font-medium">Create User</Link>
              <Link to="/admin-dashboard" className="text-gray-900 hover:text-blue-600 font-medium">Manage Users</Link>
            </>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="text-blue-600 hover:text-white border border-blue-600 hover:bg-blue-600 rounded-full px-5 py-2 transition-colors duration-300"
        >
          Log Out
        </button>
      </nav>
    </header>
  );
};

export default Header;
