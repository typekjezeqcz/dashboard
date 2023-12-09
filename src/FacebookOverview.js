import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import DateSelector from './DatePicker';

const FacebookOverview = () => {
    const [adsData, setAdsData] = useState([]);
    const [summaryData, setSummaryData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [shopifyOrdersSummary, setShopifyOrdersSummary] = useState({}); // New state variable
    const [adsetData, setAdsetData] = useState([]); // State variable for ad set data
    const [fbAdsData, setfbAdsData] = useState([])
    const [selectedDate, setSelectedDate] = useState(new Date());

    useEffect(() => {
        setIsLoading(true);
        Promise.all([
            axios.get('/api/fetch-facebook-ads-data'),
            axios.get('/api/facebook-shopify', { params: { date: '2023-11-28' } })
        ]).then(([adsDataResponse, facebookShopifyResponse]) => {
            let fetchedAdsData = Array.isArray(adsDataResponse.data.combinedData) ? adsDataResponse.data.combinedData : [];
            let fetchedAdsetData = Array.isArray(adsDataResponse.data.adsetData) ? adsDataResponse.data.adsetData : []; // Fetch ad set data
            let fetchedFbAdsData = Array.isArray(adsDataResponse.data.fbAdsData) ? adsDataResponse.data.fbAdsData : [];
            // Sort as strings to handle large numbers correctly
            fetchedAdsData.sort((a, b) => a.account_id.localeCompare(b.account_id));
    
            setAdsData(fetchedAdsData);
            setAdsetData(fetchedAdsetData); // Set ad set data
            setSummaryData(adsDataResponse.data.adAccountSummaryData ? adsDataResponse.data.adAccountSummaryData : null);
            setShopifyOrdersSummary(adsDataResponse.data.shopifyOrdersSumByAccount);
            setfbAdsData(fetchedFbAdsData);

            const shopifyOrdersByAccount = {};

        fetchedAdsData.forEach(ad => {
            const accountId = ad.account_id;
            if (!shopifyOrdersByAccount[accountId]) {
                shopifyOrdersByAccount[accountId] = 0;
            }
            shopifyOrdersByAccount[accountId] += ad.shopifyOrderCountCampaign;
        });

        setShopifyOrdersSummary(shopifyOrdersByAccount);

            setIsLoading(false);
        }).catch(err => {
            setError(err);
            setIsLoading(false);
        });
    }, [selectedDate])

    const formatNumber = (value) => {
        return value ? parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
    };
    

    const formatNumberWithSpace = (value) => {
        return value ? parseFloat(value).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0';
    };

        const Tooltip = ({ text, children }) => {
        const [showTooltip, setShowTooltip] = useState(false);

        return (
            <div className="relative flex items-center"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}>
            {children}
            {showTooltip && (
                <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-3 py-1 bg-black text-white text-xs rounded">
                {text}
                </div>
            )}
            </div>
        );
        };


    if (isLoading) return <div className="text-center p-4">Loading Facebook Data...</div>;
    if (error) return <div className="text-red-500 text-center p-4">Error: {error.message}</div>;

    return (
        <div>
    <div className="ad-account-summary max-w-7xl mx-auto my-8">
        <div className="ad-account-summary max-w-7xl mx-auto my-8 flex justify-end pr-4">
    <DateSelector selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
    </div>
    <h2 className="text-xl font-bold mb-2">Ad Account Summary</h2>
    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-blue-50">
                <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Account Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Spend</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Impressions</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purchases FB</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sales Shopify</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clicks</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reach</th>
                    {/* Add more headers as needed */}
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {summaryData && summaryData.map((account, index) => (
                    <tr key={index}>
                        <Tooltip text={`Account ID: ${account.accountId}`}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-black-500">{account.accountName}</td>
                        </Tooltip>                 
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${formatNumber(account.spend)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{formatNumberWithSpace(account.impressions)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{formatNumberWithSpace(account.purchases)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                            {formatNumberWithSpace(shopifyOrdersSummary[account.accountId] || 0)}
                        </td>                        
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{formatNumberWithSpace(account.clicks)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{formatNumberWithSpace(account.reach)}</td>
                        {/* Add more cells as needed */}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
</div>


 <div className="ads-data max-w-7xl mx-auto my-8">
    <h2 className="text-xl font-bold mb-4">Campaign Data</h2>
    <div className="overflow-x-auto">
        <table className="min-w-full bg-white divide-y divide-gray-200">
            <thead className="bg-blue-50">
                <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Ad Account</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Campaign Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Spend</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Conversions Shopify</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Clicks</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">CTR</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">CPC</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">CPM</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Impressions</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Reach</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
            {adsData.map((ad, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                        <Tooltip text={`Account ID: ${ad.account_id}`}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{ad.accountName}</td>
                        </Tooltip>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900">{ad.campaign_name}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900">{ad.campaign_status}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${formatNumber(ad.spend)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{formatNumberWithSpace(ad.shopifyOrderCountCampaign)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{ad.clicks}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{formatNumber(ad.ctr)}%</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${formatNumber(ad.cpc)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${formatNumber(ad.cpm)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{ad.impressions}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{ad.reach}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
</div>

<div className="ad-set-data max-w-7xl mx-auto my-8">
    <h2 className="text-xl font-bold mb-4">Ad Set Data</h2>
    <div className="overflow-x-auto">
        <table className="min-w-full bg-white divide-y divide-gray-200">
            <thead className="bg-blue-50">
                <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Ad Account</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Campaign</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Ad Set Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Spend</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Impressions</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Shopify Orders</th>
                    {/* Add more headers as needed */}
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
                {adsetData.map((adSet, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900">{adSet.accountName}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900">{adSet.campaign_name}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900">{adSet.adset_name}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${formatNumber(adSet.spend)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{formatNumberWithSpace(adSet.impressions)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{formatNumberWithSpace(adSet.shopifyOrderCountAdSet)}</td>
                        {/* Add more cells as needed */}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
</div>

<div className="ads-data max-w-7xl mx-auto my-8">
    <h2 className="text-xl font-bold mb-4">Ads Data</h2>
    <div className="overflow-x-auto">
        <table className="min-w-full bg-white divide-y divide-gray-200">
            <thead className="bg-blue-50">
                <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Ad Account</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Ad Set Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Ad Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Spend</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Impressions</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Clicks</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-black-500 uppercase tracking-wider">Shopify Orders</th>
                    {/* Add more headers as needed */}
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
                {fbAdsData.map((ad, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900">{ad.accountName}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900">{ad.adset_name}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900">{ad.ad_name}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${formatNumber(ad.spend)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{formatNumberWithSpace(ad.impressions)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{formatNumberWithSpace(ad.clicks)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{formatNumberWithSpace(ad.shopifyOrderCountAds)}</td>
                        {/* Add more cells as needed */}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
</div>

        </div>
    );
};

export default FacebookOverview;
