import React, { useState, useEffect, useMemo, useRef } from 'react'; // Import useRef
import DateSelector from './DatePicker'; // Assuming DateSelector is in the same directory
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Spinner from './spinner'; // Import the Spinner component
import './fb.css'
import SummaryCardsContainer from './FacebookSalesSummary';

const DataTable = ({ data, title, prevData, onRowClick, type, selectedItem, filteredData, selectedSubItem, onSubRowClick, filteredSubData }) => {
  const [showAccountId, setShowAccountId] = useState(false); 
  const [sortConfig, setSortConfig] = useState({ key: 'total_spend', direction: 'descending' });
  const [searchTerm, setSearchTerm] = useState(''); // Search term state
  const [includeFilters, setIncludeFilters] = useState([]);
  const [excludeFilters, setExcludeFilters] = useState([]);
  const [showFilterOptions, setShowFilterOptions] = useState(false);
  const includeInputRef = useRef(null);
  const excludeInputRef = useRef(null);

    const isStickyColumn = (columnName) => {
        return ['campaign_name', 'adset_name', 'ad_name'].includes(columnName);
      };

    const requestSort = (key) => {
        let direction = 'ascending';
        if (
            sortConfig.key === key &&
            sortConfig.direction === 'ascending'
        ) {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const accountNames = {
        '798134188164544': '10FC_03_US',
        '489501699514603': '10FC_05_US',
        '1826497317736494': '10FC_06_US'
    };
    const handleSearchChange = (event) => {
        setSearchTerm(event.target.value);
    };

    const handleRowClick = (row) => {
      if (onRowClick) {
        // Use different ID fields based on the type of data
        let id;
        switch (type) {
          case 'ads':
            id = row.ad_id;
            break;
          case 'adset':
            id = row.adset_id;
            break;
          case 'campaign':
            id = row.campaign_id;
            break;
          case 'account':
            id = row.account_id;
            break;
          default:
            id = row.id; // Fallback if type is not specified
        }
        onRowClick(id, type, row);
      }
    };

    const isRowSelected = (row) => {
      let rowId;
      switch (type) {
        case 'ad':
          rowId = row.ad_id;
          break;
        case 'adset':
          rowId = row.adset_id;
          break;
        case 'campaign':
          rowId = row.campaign_id;
          break;
        case 'account':
          rowId = row.account_id;
          break;
        default:
          rowId = row.id;
      }
      return selectedItem.id === rowId && selectedItem.type === type;
    };

    const handleSubRowClick = (event, subRow) => {
      event.stopPropagation();
    
      let id;
      const currentType = subRow.data_set;

      switch (currentType) {
        case 'account':
          id = subRow.account_id; 
          break;
        case 'campaign':
          id = subRow.campaign_id; 
          break;
        case 'adset':
          id = subRow.adset_id; 
          break;
        default:
          console.log("Unhandled type in switch:", currentType);
          id = null;
      }
    
      if (id != null && onSubRowClick) {
        onSubRowClick(id, currentType, subRow);
      }
    };
    
    
    

    const sortedAndFilteredData = useMemo(() => {
        let sortableItems = [...data];

        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                // Compare using original, unformatted data
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                // Convert string to number for numeric fields if necessary
                aValue = (typeof aValue === 'string' && !isNaN(aValue)) ? parseFloat(aValue) : aValue;
                bValue = (typeof bValue === 'string' && !isNaN(bValue)) ? parseFloat(bValue) : bValue;

                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }

        if (searchTerm) {
            return sortableItems.filter(item => {
                return Object.values(item).some(value =>
                    String(value).toLowerCase().includes(searchTerm.toLowerCase())
                );
            });
        }
        sortableItems.sort((a, b) => {
    const aValue = parseFloat(a['total_spend']);
    const bValue = parseFloat(b['total_spend']);
    if (aValue === 0 && bValue !== 0) {
      return 1; // Move rows with 0 total_spend to the end
    }
    if (aValue !== 0 && bValue === 0) {
      return -1; // Keep non-zero total_spend rows before 0 total_spend rows
    }
    return 0;
  });

  let filteredItems = sortableItems.filter(item => {
    const itemString = JSON.stringify(item).toLowerCase();
    
    // Check includes
    const includeCheck = includeFilters.length === 0 || includeFilters.some(filter => itemString.includes(filter.toLowerCase()));

    // Check excludes
    const excludeCheck = !excludeFilters.some(filter => itemString.includes(filter.toLowerCase()));

    return includeCheck && excludeCheck;
  });

  return filteredItems;
}, [data, sortConfig, searchTerm, includeFilters, excludeFilters]);

const addFilter = (filter, type) => {
  if (type === 'include') {
    setIncludeFilters([...includeFilters, filter]);
    includeInputRef.current.value = ''; // Clear input field after adding
  } else if (type === 'exclude') {
    setExcludeFilters([...excludeFilters, filter]);
    excludeInputRef.current.value = ''; // Clear input field after adding
  }
};

const removeFilter = (filter, type) => {
  if (type === 'include') {
    setIncludeFilters(includeFilters.filter(f => f !== filter));
  } else if (type === 'exclude') {
    setExcludeFilters(excludeFilters.filter(f => f !== filter));
  }
};

    const formatValue = (key, value) => {
        // Handle null values
        if (value === null) {
            return 'N/A'; // Placeholder for null values
        }

        if (key === 'account_id') {
          return showAccountId ? (
              <span className="hover:underline cursor-pointer" onClick={() => setShowAccountId(false)}>
                  {value}
              </span>
          ) : (
              <span className="hover:underline cursor-pointer" onClick={() => setShowAccountId(true)}>
                  {accountNames[value] || value}
              </span>
          );
      }
        const unformattedFields = ['account_id', 'campaign_id', 'adset_id', 'ad_id'];
        if (unformattedFields.includes(key)) {
            return value;
        }

        // Convert string to number if it's a numeric string
        let numericValue = (typeof value === 'string' && !isNaN(value)) ? parseFloat(value) : value;

        // Check if numericValue is actually a number
        if (typeof numericValue !== 'number') {
            return value; // Return original value if it's not a number
        }
        // Define the formatter for currency
        const currencyFormatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    
        // Define the formatter for percentages
        const percentageFormatter = new Intl.NumberFormat('en-US', {
            style: 'percent',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    
        // Define which keys correspond to which types of data
        const currencyFields = ['total_spend', 'total_revenue', 'cpa', 'aov', 'epc', 'average_cpc', 'average_cpm'];
        const percentageFields = ['average_ctr', 'cvr'];
        const wholeNumberFields = ['total_impressions', 'total_clicks', 'order_count'];
        
    if (currencyFields.includes(key)) {
        return currencyFormatter.format(numericValue);
    } else if (percentageFields.includes(key)) {
        // Convert the decimal to a percentage and format
        return percentageFormatter.format(numericValue / 100);
    } else if (wholeNumberFields.includes(key)) {
        // Format whole numbers without decimal places
        return Math.round(numericValue).toLocaleString();
    } else {
        // For other numerical values, limit to 2 decimal places
        return numericValue.toFixed(2);
    }
    
};


const getColumnConfig = (type) => {
  switch (type) {
    case 'account':
      return [
        { key: 'account_id', label: 'Acc Name' },
        { key: 'total_spend', label: 'Spend' },
        { key: 'roas', label: 'ROAS' },
        { key: 'cpa', label: 'CPA' },
        { key: 'aov', label: 'AOV' },
        { key: 'cvr', label: 'CVR' },
        { key: 'epc', label: 'EPC' },
        { key: 'average_cpc', label: 'CPC' },
        { key: 'average_ctr', label: 'CTR' },
        { key: 'average_cpm', label: 'CPM' },
        { key: 'total_clicks', label: 'Clicks' },
        { key: 'order_count', label: 'PUR' },
        { key: 'total_revenue', label: 'Revenue' }
        // Add other columns specific to 'account'
      ];
    case 'campaign':
      return [
        { key: 'campaign_name', label: 'Campaign Name' },
        { key: 'total_spend', label: 'Spend' },
        { key: 'roas', label: 'ROAS' },
        { key: 'cpa', label: 'CPA' },
        { key: 'aov', label: 'AOV' },
        { key: 'cvr', label: 'CVR' },
        { key: 'epc', label: 'EPC' },
        { key: 'average_cpc', label: 'CPC' },
        { key: 'average_ctr', label: 'CTR' },
        { key: 'average_cpm', label: 'CPM' },
        { key: 'total_clicks', label: 'Clicks' },
        { key: 'order_count', label: 'PUR' },
        { key: 'total_revenue', label: 'Revenue' },
        { key: 'campaign_id', label: 'Campaign ID' },
        { key: 'account_id', label: 'Acc Name' },

        // Add other columns specific to 'campaign'
      ];
    case 'adset':
      return [
        { key: 'adset_name', label: 'Adset Name' },
        { key: 'total_spend', label: 'Spend' },
        { key: 'roas', label: 'ROAS' },
        { key: 'cpa', label: 'CPA' },
        { key: 'aov', label: 'AOV' },
        { key: 'cvr', label: 'CVR' },
        { key: 'epc', label: 'EPC' },
        { key: 'average_cpc', label: 'CPC' },
        { key: 'average_ctr', label: 'CTR' },
        { key: 'average_cpm', label: 'CPM' },
        { key: 'total_clicks', label: 'Clicks' },
        { key: 'order_count', label: 'PUR' },
        { key: 'total_revenue', label: 'Revenue' },
        { key: 'adset_id', label: 'Adset ID' },
        { key: 'account_id', label: 'Acc Name' },

        // Add other columns specific to 'adset'
      ];
    case 'ads':
      return [
        { key: 'ad_name', label: 'Ads Name' },
        { key: 'total_spend', label: 'Spend' },
        { key: 'roas', label: 'ROAS' },
        { key: 'cpa', label: 'CPA' },
        { key: 'aov', label: 'AOV' },
        { key: 'cvr', label: 'CVR' },
        { key: 'epc', label: 'EPC' },
        { key: 'average_cpc', label: 'CPC' },
        { key: 'average_ctr', label: 'CTR' },
        { key: 'average_cpm', label: 'CPM' },
        { key: 'total_clicks', label: 'Clicks' },
        { key: 'order_count', label: 'PUR' },
        { key: 'total_revenue', label: 'Revenue' },
        { key: 'ad_id', label: 'Ads ID' },

        // Add other columns specific to 'ads'
      ];
    default:
      return []; // Default case
  }
};


const getChangeIndicator = (key, currentValue, previousValue) => {
  if (!previousValue || !currentValue) return null; // No data for comparison
  if (currentValue > previousValue) return '↑';
  if (currentValue < previousValue) return '↓';
  return null; // No change
};

const columns = useMemo(() => getColumnConfig(type), [type]);


return (
  <div className="relative sm:rounded-lg">
    <div className="flex justify-between mb-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <div className="flex items-center space-x-2">
        {/* Filter Button */}
        <button 
          onClick={() => setShowFilterOptions(!showFilterOptions)}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Filter
        </button>
        {/* Include and Exclude Filters */}
        {showFilterOptions && (
          <>
            <input type="text" placeholder="Include filter" ref={includeInputRef} className="p-2 border border-gray-300 rounded"/>
            <button 
              onClick={() => addFilter(includeInputRef.current.value, 'include')} 
              className="bg-blue-500 hover:bg-blue-600 text-white text-sm py-2 px-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              Include
            </button>

            <input type="text" placeholder="Exclude filter" ref={excludeInputRef} className="p-2 border border-gray-300 rounded"/>
            <button 
              onClick={() => addFilter(excludeInputRef.current.value, 'exclude')} 
              className="bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-2 rounded focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              Exclude
            </button>
          </>
        )}

        {/* Search Input */}
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="p-2 border rounded"
        />
      </div>
    </div>

    {/* Display Active Filters */}
    <div className="active-filters flex flex-wrap space-x-2 mb-4">
      {includeFilters.map((filter, index) => (
        <span key={index} className="flex items-center bg-blue-100 text-blue-800 px-4 py-2 rounded-full">
          Include: {filter} 
          <button 
            onClick={() => removeFilter(filter, 'include')} 
            className="ml-2 p-1 rounded-full hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      {excludeFilters.map((filter, index) => (
        <span key={index} className="flex items-center bg-red-100 text-red-800 px-4 py-2 rounded-full">
          Exclude: {filter} 
          <button 
            onClick={() => removeFilter(filter, 'exclude')} 
            className="ml-2 p-1 rounded-full hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
    </div>

    <div className="overflow-x-auto" style={{ maxHeight: `600px` }}>
      <table className="w-full text-sm text-left text-white dark:text-white">
        <thead className="bg-white dark:bg-gray-700 shadow sticky top-0 z-10">
          <tr>
            {columns.map(({ key, label }) => (
              <th
                key={key}
                onClick={() => requestSort(key)}
                className={`py-3 px-6 text-center cursor-pointer z-10 ${isStickyColumn(key) ? 'sticky bg-gray-700 left-0' : ''}`}
              >
                {label}
                {sortConfig.key === key ? (sortConfig.direction === 'ascending' ? ' ↑' : ' ↓') : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedAndFilteredData.map((row, idx) => (
            <tr key={idx} onClick={() => handleRowClick(row)}  className={`${isRowSelected(row) ? 'selected-row ' : ''}${idx % 2 === 0 ? 'bg-white dark:bg-gray-400' : 'bg-gray-50 dark:bg-gray-300'}`}>
              {columns.map(({ key }) => {
                const val = row[key];
                const changeIndicator = prevData && prevData[idx] ? getChangeIndicator(key, val, prevData[idx][key]) : null;
                return (
                  <td key={key} className={`py-4 px-6 ${isStickyColumn(key) ? 'sticky left-0 sticky-column' : ''} ${idx % 2 === 0 ? 'dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900'}`}>
                    {formatValue(key, val)}
                    {changeIndicator && <span className="change-indicator">{changeIndicator}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
};


    const Fb = ({ data}) => {
      const [selectedItem, setSelectedItem] = useState({ id: null, type: null });
      const [selectedSubItem, setSelectedSubItem] = useState({ id: null, type: null });

      console.log("Data received in Fb component:", data);

      const handleRowClick = (id, type) => {
        if (selectedItem.id === id && selectedItem.type === type) {
          // If the same row is clicked again, reset the selection
          setSelectedItem({ id: null, type: null });
        } else {
          // Set the selected item
          setSelectedItem({ id, type });
        }
        console.log("Toggled Item:", { id, type });
      };

      const handleSubRowClick = (id, type, rowData) => {
        setSelectedSubItem({ id, type });
      };

      const filteredAccountsData = useMemo(() => {
        if (selectedItem.type === 'account') {
          return data.adaccountsData;
        }
        let accountId;
        switch (selectedItem.type) {
          case 'campaign':
            accountId = data.campaignsData.find(c => c.campaign_id === selectedItem.id)?.account_id;
            break;
          case 'adset':
            accountId = data.adsetsData.find(a => a.adset_id === selectedItem.id)?.account_id;
            break;
          case 'ads':
            accountId = data.adsData.find(a => a.ad_id === selectedItem.id)?.account_id;
            break;
          default:
            return data.adaccountsData;
        }
        return data.adaccountsData.filter(account => account.account_id === accountId);
      }, [selectedItem, data.adaccountsData, data.campaignsData, data.adsetsData, data.adsData]);
      
      const filteredCampaignsData = useMemo(() => {
        if (selectedItem.type === 'campaign') {
          return data.campaignsData;
        }
        switch (selectedItem.type) {
          case 'account':
            return data.campaignsData.filter(campaign => campaign.account_id === selectedItem.id);
          case 'adset':
            return data.campaignsData.filter(campaign => campaign.campaign_id === data.adsetsData.find(adset => adset.adset_id === selectedItem.id)?.campaign_id);
          case 'ads':
            const adsetForAd = data.adsData.find(ad => ad.ad_id === selectedItem.id)?.adset_id;
            const campaignIdForAd = data.adsetsData.find(adset => adset.adset_id === adsetForAd)?.campaign_id;
            return data.campaignsData.filter(campaign => campaign.campaign_id === campaignIdForAd);
          default:
            return data.campaignsData;
        }
      }, [selectedItem, data.campaignsData, data.adsetsData, data.adsData]);
      
      const filteredAdsetsData = useMemo(() => {
        if (selectedItem.type === 'adset') {
          return data.adsetsData;
        }
        switch (selectedItem.type) {
          case 'account':
            return data.adsetsData.filter(adset => adset.account_id === selectedItem.id);
          case 'campaign':
            return data.adsetsData.filter(adset => adset.campaign_id === selectedItem.id);
          case 'ads':
            return data.adsetsData.filter(adset => adset.adset_id === data.adsData.find(ad => ad.ad_id === selectedItem.id)?.adset_id);
          default:
            return data.adsetsData;
        }
      }, [selectedItem, data.adsetsData, data.adsData]);
      
      const filteredAdsData = useMemo(() => {
        if (selectedItem.type === 'ads') {
          return data.adsData;
        }
        switch (selectedItem.type) {
          case 'account':
            return data.adsData.filter(ad => ad.account_id === selectedItem.id);
          case 'campaign':
            return data.adsData.filter(ad => ad.campaign_id === selectedItem.id);
          case 'adset':
            return data.adsData.filter(ad => ad.adset_id === selectedItem.id);
          default:
            return data.adsData;
        }
      }, [selectedItem, data.adsData]);
      
      
      


      const filteredData = useMemo(() => {
        if (!selectedItem.id) return data; // Show all data if no selection
      
        switch (selectedItem.type) {
          case 'campaign':
            return data.adsetsData.filter(item => item.campaign_id === selectedItem.id);
          case 'adset':
            return data.adsData.filter(item => item.adset_id === selectedItem.id);
          case 'account':
            return data.campaignsData.filter(item => item.account_id === selectedItem.id);
          default:
            return data;
        }
      }, [selectedItem, data]);
      

      const filteredSubData = useMemo(() => {
        if (!selectedSubItem.id) return [];
        switch (selectedSubItem.type) {
          case 'campaign':
            return data.adsetsData.filter(item => item.campaign_id === selectedSubItem.id);
          case 'adset':
            return data.adsData.filter(item => item.adset_id === selectedSubItem.id);
          case'account':
          return data.campaignsData.filter(item => item.account_id === selectedSubItem.id);

            default:
            return [];
        }
      }, [selectedSubItem, data]);


        const { 
            adsData, 
            campaignsData, 
            adsetsData, 
            adaccountsData,
            isLoading,
        } = data;
    
       
        if (isLoading) {
            return <Spinner />;
          }

          return (
            <div>
              <SummaryCardsContainer adaccountsData={adaccountsData} />
              <div className="container mx-auto p-4">
                <div className="my-4">
                  <DataTable 
                    data={filteredAccountsData} 
                    title="Ad Accounts Data" 
                    onRowClick={handleRowClick} 
                    type="account" 
                    selectedItem={selectedItem}
                  />
                </div>
          
                <div className="my-4">
                  <DataTable 
                    data={filteredCampaignsData} 
                    title="Campaigns Data" 
                    onRowClick={handleRowClick} 
                    type="campaign" 
                    selectedItem={selectedItem}
                  />
                </div>
          
                <div className="my-4">
                  <DataTable 
                    data={filteredAdsetsData} 
                    title="Ad Sets Data" 
                    onRowClick={handleRowClick} 
                    type="adset" 
                    selectedItem={selectedItem}
                  />
                </div>
          
                <div className="my-4">
                  <DataTable 
                    data={filteredAdsData} 
                    title="Ads Data" 
                    onRowClick={handleRowClick} 
                    type="ads" 
                    selectedItem={selectedItem}
                  />
                </div>
              </div>
            </div>
          );
          };          

export default Fb;
