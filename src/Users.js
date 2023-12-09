import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';

function Users() {
  const navigate = useNavigate();

  const [user, setUser] = useState({
    name: '',
    password: '',
    role: 'user', // Set default role or make it selectable
  });

  const handleChange = (e) => {
    setUser({ ...user, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/createusers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      navigate('/admin-dashboard');

    } catch (error) {
      console.error('There was an error!', error);
    }
  };

  return (
    <div>
            <Header />
    <div className="flex justify-center items-center h-screen bg-gray-100 px-6">
      <div className="w-full max-w-xs">
        <h2 className="mb-6 text-center text-3xl font-extrabold text-gray-900">
          Create User
        </h2>
        <form onSubmit={handleSubmit} className="mt-8 space-y-6 bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={user.name}
              onChange={handleChange}
              placeholder="Enter name"
              className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={user.password}
              onChange={handleChange}
              placeholder="Enter password"
              className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700">
              Role
            </label>
            <select
              id="role"
              name="role"
              required
              value={user.role}
              onChange={handleChange}
              className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
              {/* Add more roles as needed */}
            </select>
          </div>
          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>
    </div>
  );
}

export default Users;
