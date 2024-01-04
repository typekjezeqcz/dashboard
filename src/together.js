import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Dashboard from './Dashboard';
import Fb from './fb';
import moment from 'moment-timezone';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Header from './Header';
import DateSelector from './DatePicker';
import { set } from 'date-fns';
import Spinner from './spinner'; // Import the Spinner component
import io from 'socket.io-client';


const Together = () => {
    const timezone = 'America/Los_Angeles';
    const todayLA = moment().tz(timezone).startOf('day').toDate();
    
    const [startDate, setStartDate] = useState(todayLA);
    const [endDate, setEndDate] = useState(todayLA);
    const [userRole, setUserRole] = useState('');
    const [fetchVersion, setFetchVersion] = useState(0); // or use a timestamp if more appropriate
    const [prevFbData, setPrevFbData] = useState(null);

    // States for Dashboard data
    const [dashboardData, setDashboardData] = useState({
        todaysSales: null,
        ordersCount: null,
        averageOrderValue: null,
        largestOrder: null,
        aggregatedData: {},
        isUpdating: false
    });

    // States for Fb data
    const [fbData, setFbData] = useState({
        adsData: [],
        campaignsData: [],
        adsetsData: [],
        adaccountsData: [],
        isLoading: true,
        isInitialLoad: true
    });

useEffect(() => {
    console.log("Attempting to connect to WebSocket");

    // Connect to WebSocket server
    const socket = io('http://roasbooster.com:2000');

    socket.on('connect', () => {
        console.log('Connected to the WebSocket server');
    });

    socket.on('data-update', (data) => {
        console.log('Received data-update from WebSocket', data);
            // Check if selected date is today before updating state
            if (isDateToday(moment(startDate)) && isDateToday(moment(endDate))) {
                setDashboardData({
                    todaysSales: data.dashboardData.revenue,
                    ordersCount: data.dashboardData.count,
                    averageOrderValue: data.dashboardData.revenue / data.dashboardData.count,
                    largestOrder: data.dashboardData.largestOrder,
                    aggregatedData: data.dashboardData.aggregatedData,
                    isUpdating: false
                });

                setFbData({
                    adsData: data.fbData.ads,
                    campaignsData: data.fbData.campaigns,
                    adsetsData: data.fbData.adsets,
                    adaccountsData: data.fbData.adaccounts,
                    isLoading: false,
                    totalProfit: data.fbData.totalProfit,
                });
                setPrevFbData(fbData);
            }
        });

    socket.on('data-error', (error) => {
        console.error('Received data-error from WebSocket', error);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from the WebSocket server');
    });

    // Clean up on unmount or when dependencies change
    return () => {
        console.log("Disconnecting WebSocket on cleanup");
        socket.off('data-update');
        socket.off('data-error');
        socket.close();
    };
}, [startDate, endDate]);
    useEffect(() => {
        const role = localStorage.getItem('userRole');
        setUserRole(role);
    }, []);

    const fetchData = async () => {
        // Formatted dates
        const formattedStartDate = startDate.toISOString().split('T')[0];
        const formattedEndDate = endDate.toISOString().split('T')[0];
    
        if (isDateToday(moment(startDate)) && isDateToday(moment(endDate))) {
            // Existing fetching logic for when the selected dates are today
    
            // Logic to fetch today's data for Dashboard
            try {
                setDashboardData(prevState => ({ ...prevState, isUpdating: true }));
                const responseDashboard = await fetch(`/api/orders-by-date?start=${formattedStartDate}&end=${formattedEndDate}`);
                const dataDashboard = await responseDashboard.json();
                setDashboardData({
                    todaysSales: dataDashboard.revenue,
                    ordersCount: dataDashboard.count,
                    averageOrderValue: dataDashboard.revenue / dataDashboard.count,
                    largestOrder: dataDashboard.largestOrder,
                    aggregatedData: dataDashboard.aggregatedData,
                    isUpdating: false
                });
            } catch (error) {
                console.error('Error fetching Dashboard data:', error);
                setDashboardData(prevState => ({ ...prevState, isUpdating: false }));
            }
    
            // Logic to fetch today's data for Facebook
            try {
                setFbData(prevState => ({ ...prevState, isLoading: true }));
                const timezone = 'America/Los_Angeles';
                const formattedStartDateFb = new Date(startDate).toLocaleDateString('en-US', { timeZone: timezone });
                const formattedEndDateFb = new Date(endDate).toLocaleDateString('en-US', { timeZone: timezone });
    
                const responseFb = await axios.get(`/api/facebook-data?startDate=${formattedStartDateFb}&endDate=${formattedEndDateFb}`);
                setFbData({
                    adsData: responseFb.data.ads,
                    campaignsData: responseFb.data.campaigns,
                    adsetsData: responseFb.data.adsets,
                    adaccountsData: responseFb.data.adaccounts,
                    isLoading: false,
                    totalProfit: responseFb.data.totalProfit,
                });
                setFetchVersion(prevVersion => prevVersion + 1);
                setPrevFbData(fbData);
            } catch (error) {
                console.error('Error fetching Facebook data:', error);
                setFbData(prevState => ({ ...prevState, isLoading: false }));
            }
        } else {
            // Fetching logic for when the selected dates are NOT today
            try {
                // Start updating state to show loading
                setDashboardData(prevState => ({ ...prevState, isUpdating: true }));
                setFbData(prevState => ({ ...prevState, isLoading: true }));
    
                // Fetch summary data for the specified date range
                const responseSummary = await axios.get(`/api/summary?startDate=${formattedStartDate}&endDate=${formattedEndDate}`);
                const { adsSummary, adsetsSummary, campaignsSummary, accountsSummary } = responseSummary.data;
    
                const responseDashboard = await axios.get(`/api/dashboard-summary?startDate=${formattedStartDate}&endDate=${formattedEndDate}`);
                const dashboardSummaryData = responseDashboard.data;
                console.log("Dashboard Summary Data:", dashboardSummaryData);

                // Update state with the fetched data
                setDashboardData({
                    todaysSales: dashboardSummaryData.revenue,
                    ordersCount: dashboardSummaryData.count,
                    averageOrderValue: dashboardSummaryData.averageOrderValue,
                    largestOrder: dashboardSummaryData.largestOrder,
                    aggregatedData: dashboardSummaryData.aggregatedData,
                    isUpdating: false
                });
    
                setFbData({
                    adsData: adsSummary,
                    campaignsData: campaignsSummary,
                    adsetsData: adsetsSummary,
                    adaccountsData: accountsSummary,
                    isLoading: false,
                });
            } catch (error) {
                console.error('Error fetching data:', error);
                // Update state to reflect the error/fetching completion
                setDashboardData(prevState => ({ ...prevState, isUpdating: false }));
                setFbData(prevState => ({ ...prevState, isLoading: false }));
            }
        }
    };
    
    const isDateToday = (date) => {
        const today = moment().tz(timezone).startOf('day');
        return date.isSame(today, 'day');
    };



    return (
        <div>
        <Header userRole={userRole} />
        <div className="container mx-auto px-6 py-4">
        <div className="sticky top-0 pt-2 pb-2 bg-white z-20">
            <div className="flex flex-wrap justify-between md:justify-end max-w-6xl gap-3 mb-4">
                <DateSelector setStartDate={setStartDate}     setEndDate={setEndDate} />
             <div className="flex gap-2">
                <DatePicker
                    selected={startDate}
                    onChange={date => setStartDate(date)}
                    className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-300 focus:border-blue-300 w-full md:w-auto"
                    dateFormat="yyyy-MM-dd"
                />
                <DatePicker
                    selected={endDate}
                    onChange={date => setEndDate(date)}
                    className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-300 focus:border-blue-300 w-full md:w-auto"
                    dateFormat="yyyy-MM-dd"
                />
                </div>
                <button
                    onClick={fetchData}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow transition duration-300 ease-in-out"
                >
                    Refresh Data
                </button>
            </div>

            </div>
                {dashboardData.isUpdating || fbData.isLoading ? (
                    <Spinner /> // Or replace with your loading indicator
                ) : null}
                </div>
                {!(dashboardData.isUpdating || fbData.isLoading) && (
                <>
                    <Dashboard data={dashboardData} />
                    <Fb data={fbData} prevData={prevFbData}/>
                </>
                )}

            <footer className="bg-white py-4">
            <div className="max-w-6xl mx-auto px-6 flex justify-center">
                <p className="text-gray-600">Made by Felix for rybízci at 10FC</p>
            </div>
        </footer>
        </div>
    );
};

export default Together;
