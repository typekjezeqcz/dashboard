import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';


const Final = () => {
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [shopifyData, setShopifyData] = useState(null);
  const [facebookData, setFacebookData] = useState(null);

  const fetchData = async () => {
    try {
      // Formatting dates to YYYY-MM-DD
      const formattedStartDate = startDate.toISOString().split('T')[0];
      const formattedEndDate = endDate.toISOString().split('T')[0];

      // Fetch Shopify data
      const shopifyResponse = await axios.get(`/api/orders-by-date?start=${formattedStartDate}&end=${formattedEndDate}`);
      setShopifyData(shopifyResponse.data);

      // Fetch Facebook data
      const facebookResponse = await axios.get(`/api/facebook-data?startDate=${formattedStartDate}&endDate=${formattedEndDate}`);
      setFacebookData(facebookResponse.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    fetchData(); // Fetch data on component mount
  }, []);
  
  

  return (
    <div className="container mx-auto p-4">
      <div className="flex gap-4 mb-4">
        <DatePicker
          selected={startDate}
          onChange={date => setStartDate(date)}
          className="p-2 border border-gray-300 rounded"
          dateFormat="yyyy-MM-dd"
        />
        <DatePicker
          selected={endDate}
          onChange={date => setEndDate(date)}
          className="p-2 border border-gray-300 rounded"
          dateFormat="yyyy-MM-dd"
        />
        <button
          onClick={fetchData}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Refresh Data
        </button>
      </div>
      <div>
        <h2 className="text-lg font-bold">Shopify Data</h2>
        <pre className="bg-gray-100 p-4 rounded">{JSON.stringify(shopifyData, null, 2)}</pre>
      </div>
      <div>
        <h2 className="text-lg font-bold">Facebook Data</h2>
        <pre className="bg-gray-100 p-4 rounded">{JSON.stringify(facebookData, null, 2)}</pre>
      </div>
    </div>
  );
};

export default Final;
