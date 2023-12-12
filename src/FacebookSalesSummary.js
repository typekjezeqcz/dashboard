// FacebookSalesSummary.js

import React from 'react';

// SummaryCard Component
function SummaryCard({ title, value }) {
  return (
    <div className="bg-white border overflow-hidden rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
        <dd className="mt-1 text-3xl font-semibold text-gray-900">{value}</dd>
      </div>
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
  }).format(value);
}

// Component to calculate and display summary cards
const SummaryCardsContainer = ({ adaccountsData }) => {
  const totalSales = adaccountsData.reduce((acc, account) => acc + account.total_revenue, 0);
  const totalOrders = adaccountsData.reduce((acc, account) => acc + account.order_count, 0);
  const totalSpend = adaccountsData.reduce((acc, account) => acc + account.total_spend, 0);
  const averageROAS = totalSpend ? (totalSales / totalSpend) : 0; // Calculating ROAS

  return (
    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <SummaryCard title="Facebook Total Sales" value={formatCurrency(totalSales)} />
      <SummaryCard title="Facebook Orders Count" value={totalOrders} />
      <SummaryCard title="Facebook ROAS" value={`${averageROAS.toFixed(2)}`} />
      <SummaryCard title="Facebook Total Spend" value={formatCurrency(totalSpend)} />
    </div>
  );
};

export default SummaryCardsContainer;
