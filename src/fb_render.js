import React, { useState, useEffect, useMemo } from 'react';
import DateSelector from './DatePicker'; // Assuming DateSelector is in the same directory
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Spinner from './spinner'; // Import the Spinner component
import './fb.css'
const DataTable = ({ data, title, prevData, onRowClick, type, selectedItem, filteredData, selectedSubItem, onSubRowClick, filteredSubData }) => {
  const [showAccountId, setShowAccountId] = useState(false); 
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
    const [searchTerm, setSearchTerm] = useState(''); // Search term state
    const [isSubItemLoaded, setIsSubItemLoaded] = useState(false);

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

    useEffect(() => {
      if (selectedSubItem && selectedSubItem.id) {
        console.log("DataTable received selectedSubItem:", selectedSubItem);
        setIsSubItemLoaded(true);
      } else {
        setIsSubItemLoaded(false);
      }
    }, [selectedSubItem]);

    
    const accountNames = {
        '798134188164544': '10FC_03_US',
        '489501699514603': '10FC_05_US',
        '1826497317736494': '10FC_06_US'
    };
    const handleSearchChange = (event) => {
        setSearchTerm(event.target.value);
    };

    useEffect(() => {
      console.log("DataTable received selectedSubItem:", selectedSubItem);
    }, [selectedSubItem]);
    

    const handleRowClick = (row) => {
      console.log("Row clicked:", row);
      if (onRowClick) {
        // Use different ID fields based on the type of data
        let id;
        switch (type) {
          case 'ad':
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

    const handleSubRowClick = (event, subRow) => {
      event.stopPropagation();
      console.log("Sub Row clicked:", subRow);
    
      let id;
      const currentType = subRow.data_set;
      console.log("Current Type:", currentType);

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
      console.log("Extracted ID:", id);
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

  return sortableItems;
}, [data, sortConfig, searchTerm]);
    const formatValue = (key, value) => {
        // Handle null values
        if (value === null) {
            return 'N/A'; // Placeholder for null values
        }

        if (key === 'account_id' && showAccountId) {
            return (
              <span className="hover:underline cursor-pointer" onClick={() => setShowAccountId(false)}>
                {value}
              </span>
            );
          }
      
          if (key === 'account_id' && !showAccountId && accountNames[value]) {
            // Display the account name and toggle to account ID on click
            return (
              <span className="hover:underline cursor-pointer" onClick={() => setShowAccountId(true)}>
                {accountNames[value]}
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

const sortedAndFilteredSubData = useMemo(() => {
  let sortableItems = [...filteredSubData]; // Copy filteredData to avoid direct mutation

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

  return sortableItems;
}, [filteredSubData, sortConfig, searchTerm]);


const getChangeIndicator = (key, currentValue, previousValue) => {
  if (!previousValue || !currentValue) return null; // No data for comparison
  if (currentValue > previousValue) return '↑';
  if (currentValue < previousValue) return '↓';
  return null; // No change
};

return (
  <div className="relative shadow-md sm:rounded-lg">
    <div className="flex justify-between mb-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <div>
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="p-2 border rounded"
        />
      </div>
    </div>
    <div className="overflow-x-auto" style={{ maxHeight: `600px` }}>
      <table className="w-full text-sm text-left text-white dark:text-white">
        <thead className="bg-white dark:bg-gray-700 shadow">
          <tr>
            {Object.keys(data[0]).map((key) => (
              <th
                key={key}
                onClick={() => requestSort(key)}
                className={`py-3 px-6 cursor-pointer z-10 ${isStickyColumn(key) ? 'sticky left-0' : ''}`}
              >
                {key}
                {sortConfig.key === key ? (sortConfig.direction === 'ascending' ? ' ↑' : ' ↓') : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedAndFilteredData.map((row, idx) => (
            <React.Fragment key={idx}>
              {/* Main Row Rendering */}
              <tr key={idx} onClick={() => handleRowClick(row)} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-400' : 'bg-gray-50 dark:bg-gray-300'}>
                {Object.entries(row).map(([key, val], index) => {
                  const changeIndicator = prevData && prevData[idx] ? getChangeIndicator(key, val, prevData[idx][key]) : null;
                  return (
                    <td key={index} className={`py-4 px-6 ${isStickyColumn(key) ? 'sticky left-0 sticky-column' : ''} ${idx % 2 === 0 ? 'dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900'}`}>
                      {formatValue(key, val)}
                      {changeIndicator && <span className="change-indicator">{changeIndicator}</span>}
                    </td>
                  );
                })}
              </tr>

              {/* Nested filteredData Table */}
              {selectedItem && selectedItem.id === row[`${type}_id`] && filteredData.length > 0 && (
                <tr>
                  <td colSpan={Object.keys(row).length}>
                    <table className="min-w-full leading-normal ml-4">
                      <thead>
                        {Object.keys(filteredData[0]).map((key) => (
                          <th key={key} className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            {key}
                          </th>
                        ))}
                      </thead>
                      <tbody>
                        {filteredData.map((subRow, subIdx) => (
                          <React.Fragment key={subIdx}>
                            <tr onClick={(event) => handleSubRowClick(event, subRow, type)} className='bg-gray-200'>
                              {Object.entries(subRow).map(([key, value]) => (
                                <td key={key} className="px-5 py-5 border-b border-gray-200 bg-white text-black text-sm">
                                  {formatValue(key, value)}
                                </td>
                              ))}
                            </tr>
                            {console.log(`Rendering Check: Selected SubItem ID: ${selectedSubItem?.id}, SubRow Type ID: ${subRow[`${type}_id`]}`)}

                            {/* Nested filteredSubData Table */}
                            {isSubItemLoaded && selectedSubItem && selectedSubItem.id === subRow[`${type}_id`] && filteredSubData.length > 0 && (
                              <tr>
                                                          {console.log(`Rendering filteredSubData for subRow ID: ${subRow[`${type}_id`]}, Selected SubItem ID: ${selectedSubItem.id}`)}
                                <td colSpan={Object.keys(subRow).length}>
                                  <table className="min-w-full leading-normal ml-8">
                                    <tbody>
                                      {filteredSubData.map((subItem, subItemIdx) => (
                                        <tr key={subItemIdx} className="bg-gray-300">
                                          {Object.entries(subItem).map(([subKey, subValue]) => (
                                            <td key={subKey} className="px-5 py-5 border-b border-gray-200 bg-white text-black text-sm">
                                              {formatValue(subKey, subValue)}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </React.Fragment>
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


      const handleRowClick = (id, type, rowData) => {

        setSelectedItem({ id, type });
      };

      const handleSubRowClick = (id, type, rowData) => {
        console.log("Setting selectedSubItem with ID:", id, "and type:", type);
        setSelectedSubItem({ id, type });
        // Log right after setting the state
        console.log("selectedSubItem set to:", { id, type });
      };
      
      

      const filteredData = useMemo(() => {
        switch (selectedItem.type) {
          case 'campaign':
            return data.adsetsData.filter(item => item.campaign_id === selectedItem.id);
          case 'adset':
            return data.adsData.filter(item => item.adset_id === selectedItem.id);
          case'account':
          return data.campaignsData.filter(item => item.account_id === selectedItem.id);

            default:
            return [];
        }
      }, [selectedItem, data]);
      console.log("Filtered Data:", filteredData);

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
      console.log("Filtered Sub Data:", filteredSubData);


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
            <div className="container mx-auto p-4">

      <div className="my-4">
        {adaccountsData.length > 0 ? <DataTable data={adaccountsData} title="Ad Accounts Data" onRowClick={handleRowClick} onSubRowClick={handleSubRowClick} type="account"  selectedItem={selectedItem} filteredData={filteredData} selectedSubItem={selectedSubItem} filteredSubData={filteredSubData} /> : <p>No data available.</p>}
      </div>

      <div className="my-4">
        {campaignsData.length > 0 ? <DataTable data={campaignsData} title="Campaigns Data" onRowClick={handleRowClick} onSubRowClick={handleSubRowClick}  type="campaign" selectedItem={selectedItem} filteredData={filteredData} setSelectedSubItem={selectedSubItem} filteredSubData={filteredSubData} /> : <p>No data available.</p>}
      </div>

      <div className="my-4">
        {adsetsData.length > 0 ? <DataTable data={adsetsData}  onRowClick={handleRowClick} onSubRowClick={handleSubRowClick} title="Ad Sets Data" type="adset" selectedItem={selectedItem} filteredData={filteredData} selectedSubItem={selectedSubItem} filteredSubData={filteredSubData}/> : <p>No data available.</p>}
      </div>

      
      <div className="my-4">
        {adsData.length > 0 ? <DataTable data={adsData}  onRowClick={handleRowClick} onSubRowClick={handleSubRowClick} title="Ads Data" type="ad" selectedItem={selectedItem} filteredData={filteredData} selectedSubItem={selectedSubItem} filteredSubData={filteredSubData} /> : <p>No data available.</p>}
      </div>
      <div className="my-4">
      {filteredData.length > 0 ? (
        <table className="min-w-full leading-normal">
          <thead>
            <tr>
              {Object.keys(filteredData[0]).map((key) => (
                <th key={key} className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item, idx) => (
              <tr key={idx}>
                {Object.entries(item).map(([key, value]) => (
                  <td key={key} className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No filtered data available.</p>
      )}
    </div>
    <div className="my-4">
    {filteredSubData.length > 0 ? (
      <table className="min-w-full leading-normal">
        <thead>
          <tr>
            {Object.keys(filteredSubData[0]).map((key) => (
              <th key={key} className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredSubData.map((item, idx) => (
            <tr key={idx}>
              {Object.entries(item).map(([key, value]) => (
                <td key={key} className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ) : <p>No data available for selected sub-item.</p>}
  </div>
    
    </div>
  );
};

export default Fb;
