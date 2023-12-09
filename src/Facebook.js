import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const FacebookAdsData = () => {
    const [adsData, setAdsData] = useState([]);
    const [summaryData, setSummaryData] = useState(null);
    const [facebookShopifyConversions, setFacebookShopifyConversions] = useState(0);
    const [totalShopifyConversions, setTotalShopifyConversions] = useState(0); // State to store total Shopify conversions
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setIsLoading(true);
        Promise.all([
            axios.get('/api/fetch-facebook-ads-data'),
            axios.get('/api/facebook-shopify', { params: { date: '2023-11-28' } })
        ]).then(([adsDataResponse, facebookShopifyResponse]) => {
            const adsData = Array.isArray(adsDataResponse.data.combinedData) ? adsDataResponse.data.combinedData : [];
            setAdsData(adsData);
            setSummaryData(adsDataResponse.data.adAccountSummaryData ? adsDataResponse.data.adAccountSummaryData : null);
            setFacebookShopifyConversions(facebookShopifyResponse.data.facebookShopifyOrderCount);

            // Calculate total Shopify conversions
            const totalConversions = adsData.reduce((acc, ad) => acc + ad.shopifyOrderCount, 0);
            setTotalShopifyConversions(totalConversions);

            setIsLoading(false);
        }).catch(err => {
            setError(err);
            setIsLoading(false);
        });
    }, []);



    if (isLoading) return <div className="text-center p-4">Loading...</div>;
  if (error) return <div className="text-red-500 text-center p-4">Error: {error.message}</div>;

  const formatNumber = (value) => {
    if (value === null || value === undefined) {
        return 'N/A';
    }

    const number = parseFloat(value);
    return isNaN(number) ? 'N/A' : number.toFixed(2);
};

const formatNumberWithSpace = (value) => {
    if (value === null || value === undefined) {
        return 'N/A';
    }

    const number = parseFloat(value);
    if (isNaN(number)) {
        return 'N/A';
    }

    // Format the number with spaces as thousand separators
    return number.toLocaleString('en-US', { maximumFractionDigits: 0 }).replace(/,/g, ' ');
};



function usePrevious(value) {
    const ref = useRef();
    useEffect(() => {
      ref.current = value;
    });
    return ref.current;
  }

function SummaryCard({ title, value }) {
  const prevValue = usePrevious(value);
  const hasChanged = prevValue !== value && prevValue !== undefined; // Ensure it's not the initial render


  return (
    <div className={`bg-white overflow-hidden shadow rounded-lg`}>
      <div className="px-4 py-5 sm:p-6">
        <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
        <dd className="mt-1 text-3xl font-semibold text-gray-900">{value}</dd>
      </div>
    </div>
  );
}

  return (
    <div className="overflow-x-auto mt-6">
{summaryData && (
            <div className="mt-2 mb-2">
                <h2 className="text-xl font-semibold mb-2 ml-4">10FC_03_US Ad Account Summary</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          {summaryData.map((accountSummary, index) => (
            <React.Fragment key={index}>
              <SummaryCard 
                title="Spend" 
                value={`$${formatNumber(accountSummary.spend)}`} 
              />
              <SummaryCard 
                title="Impressions" 
                value={formatNumberWithSpace(accountSummary.impressions)} 
                />
                <SummaryCard 
                title="FB Conversions" 
                value={formatNumberWithSpace(accountSummary.purchases)} 
              />
                <SummaryCard 
                title="Shopify Conversions" 
                value={formatNumberWithSpace(totalShopifyConversions)} 
                n                />
                <SummaryCard 
                title="Clicks" 
                value={formatNumberWithSpace(accountSummary.clicks)} 
              />
                <SummaryCard 
                title="Reach" 
                value={formatNumberWithSpace(accountSummary.reach)} 
              />

            </React.Fragment>
          ))}
        </div>
      </div>
    )}
      <table className="w-full bg-white">
        <thead>
          <tr className="bg-blue-50">
            <th className="px-6 py-3 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Campaign Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Spend</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Conversions-Shopify</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Clicks</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-black-500 uppercase tracking-wider">CTR</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-black-500 uppercase tracking-wider">CPC</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-black-500 uppercase tracking-wider">CPM</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Impressions</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Reach</th>

            {/* ... other headers */}
          </tr>
        </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {adsData.map((ad, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-ellipsis">{ad.campaign_name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-ellipsis">{ad.campaign_status}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatNumber(ad.spend)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatNumberWithSpace(ad.shopifyOrderCount)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{ad.clicks}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatNumber(ad.ctr)}%</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatNumber(ad.cpc)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatNumber(ad.cpm)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{ad.impressions}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{ad.reach}</td>
                            {/* ... other data cells */}
                        </tr>
                    ))}
                </tbody>
      </table>

        </div>
    );
};
  

export default FacebookAdsData;
