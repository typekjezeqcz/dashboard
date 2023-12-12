import React, { useState, useEffect, useRef } from 'react';
import Spinner from './spinner'; 

const Dashboard = ({ data }) => {
  const {
      todaysSales, 
      ordersCount, 
      averageOrderValue, 
      largestOrder, 
      isUpdating, 
      aggregatedData, 
      counter
  } = data;

  const [facebookSalesTotal, setFacebookSalesTotal] = useState(0);
  const [facebookOrdersCount, setFacebookOrdersCount] = useState(0);
  const [facebookAverageOrder, setFacebookAverageOrder] = useState(0);
  const [facebookLargestOrder, setFacebookLargestOrder] = useState(0);



    useEffect(() => {
        const facebookData = aggregatedData.facebookOrders || {};
        const totalSales = Object.values(facebookData).reduce((acc, item) => acc + item.totalSales, 0);
        const ordersCount = Object.values(facebookData).reduce((acc, item) => acc + item.count, 0);
        const averageOrder = ordersCount ? (totalSales / ordersCount) : 0;
        const largestOrder = Math.max(0, ...Object.values(facebookData).map(item => item.largestOrder));

        setFacebookSalesTotal(totalSales);
        setFacebookOrdersCount(ordersCount);
        setFacebookAverageOrder(averageOrder);
        setFacebookLargestOrder(largestOrder);
    }, [aggregatedData]);
    
    if (isUpdating) {
      return <Spinner />;
    }
  
    return (
        <div>
            <SalesSummary
                ordersCount={ordersCount} 
                todaysSales={todaysSales}
                averageOrderValue={averageOrderValue}
                largestOrder={largestOrder}
                isUpdating={isUpdating} 
                aggregatedData={aggregatedData}
                counter={counter}
            />

        </div>
    );
};


function formatCurrency(value) {
  if (value === null || value === undefined) {
    return 'Loading...';
  }

  // Use Intl.NumberFormat for currency formatting
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
}

// usePrevious hook
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

function SalesSummary({ isUpdating, ordersCount, todaysSales, averageOrderValue, largestOrder, aggregatedData, counter }) {
  const updateClass = isUpdating ? 'updating-effect' : '';

  return (
    <>
      <div className="mt-5 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold text-gray-900">All Sales</h2>
        <p className="text-gray-600">
          Gross data from Shopify
        </p>
      </div>
      <div className={`mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${updateClass}`}>
        <SummaryCard title="Total Sales" value={formatCurrency(todaysSales)} />
        <SummaryCard title="Today's Orders" value={ordersCount || 'Loading...'} />
        <SummaryCard title="Average Order Value" value={formatCurrency(averageOrderValue)} />
        <SummaryCard title="Largest Value of Order" value={formatCurrency(largestOrder)} />
      </div>
      
      {/* Render dynamic summaries in table format */}
    </>
  );
}




  
function SummaryCard({ title, value }) {
  const prevValue = usePrevious(value);
  const hasChanged = prevValue !== value && prevValue !== undefined; // Ensure it's not the initial render
  const changeClass = hasChanged ? 'value-changed' : '';

  return (
    <div className={`bg-white border overflow-hidden rounded-lg ${changeClass}`}>
      <div className="px-4 py-5 sm:p-6">
        <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
        <dd className="mt-1 text-3xl font-semibold text-gray-900">{value}</dd>
      </div>
    </div>
  );
}
  
  export default Dashboard;
  
