import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function AdminDashboard() {
    const [users, setUsers] = useState([]);
    const [editingUser, setEditingUser] = useState(null);
    const [editFormData, setEditFormData] = useState({
      name: '',
      password: '',
      role: ''
    });
    const navigate = useNavigate();

  useEffect(() => {
    // Fetch users from the API
    const fetchUsers = async () => {
      // Add your token from local storage to the authorization header
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else if (response.status === 403) {
        navigate('/');
      }
    };

    fetchUsers();
  }, [navigate]);

  const handleEditFormChange = (event) => {
    setEditFormData({
      ...editFormData,
      [event.target.name]: event.target.value,
    });
  };

  const handleEditFormSubmit = async (event) => {
    event.preventDefault();
    const token = localStorage.getItem('token');
    
    // Create a new form data object with changes or original values
    const updatedData = {
      name: editFormData.name !== '' ? editFormData.name : editingUser.name,
      password: editFormData.password, // Password should be always set if changed, otherwise it should be empty
      role: editFormData.role !== '' ? editFormData.role : editingUser.role,
    };
  
    try {
      // Exclude password if it's empty, indicating no change
      if (updatedData.password === '') {
        delete updatedData.password;
      }
  
      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedData),
      });
  
      if (response.ok) {
        const updatedUser = await response.json();
        setUsers(users.map((user) => user.id === editingUser.id ? updatedUser : user));
        setEditingUser(null);
        alert('User updated successfully');
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  };

  const handleEditClick = (user) => {
    setEditingUser(user);
    setEditFormData({
      name: user.name,
      password: '', // Don't pre-fill the password
      role: user.role
    });
  };

  const handleCancelClick = () => {
    setEditingUser(null);
  };

  const handleDeleteUser = async (id) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        },
      });
      if (response.ok) {
        setUsers(users.filter((user) => user.id !== id));
        alert('User deleted successfully');
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  const confirmEdit = (user) => {
    const confirmEdit = window.confirm(`Are you sure you want to edit ${user.name}?`);
    if (confirmEdit) {
      handleEditClick(user);
    }
  };

  const confirmDelete = (id) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this user?');
    if (confirmDelete) {
      handleDeleteUser(id);
    }
  };

  return (
    <div className="container mx-auto my-8 p-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-8">Admin Dashboard</h1>
      {/* Render the form only when editingUser is set */}
      {editingUser && (
        <form onSubmit={handleEditFormSubmit} className="mb-6">
          <div className="mb-4">
            <label htmlFor="name" className="block text-gray-700 text-sm font-bold mb-2">Name:</label>
            <input
              id="name"
              type="text"
              name="name"
              value={editFormData.name}
              onChange={handleEditFormChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="password" className="block text-gray-700 text-sm font-bold mb-2">Password:</label>
            <input
              id="password"
              type="password"
              name="password"
              placeholder="New password"
              onChange={handleEditFormChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="role" className="block text-gray-700 text-sm font-bold mb-2">Role:</label>
            <select
              id="role"
              name="role"
              value={editFormData.role}
              onChange={handleEditFormChange}
              className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <button type="submit" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
              Save
            </button>
            <button type="button" onClick={handleCancelClick} className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
              Cancel
            </button>
          </div>
        </form>
      )}
      {/* Map over the users and render them */}
      {users.map(user => (
        <div key={user.id} className="mb-4 p-4 shadow rounded bg-white flex justify-between items-center">
          <p className="text-gray-800">{user.name} - {user.role}</p>
          <div className="flex items-center">
            <button 
              onClick={() => confirmEdit(user)} 
              className="text-xs bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-2 rounded focus:outline-none focus:shadow-outline mr-2">
              Edit
            </button>
            <button 
              onClick={() => confirmDelete(user.id)} 
              className="text-xs bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded focus:outline-none focus:shadow-outline">
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
  
}

export default AdminDashboard;
