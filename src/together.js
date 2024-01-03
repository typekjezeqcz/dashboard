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
        const role = localStorage.getItem('userRole');
        setUserRole(role);
    }, []);

    const fetchData = async () => {
        // Fetching logic for Dashboard
        const formattedStartDateDashboard = startDate.toISOString().split('T')[0];
        const formattedEndDateDashboard = endDate.toISOString().split('T')[0];

        try {
            setDashboardData(prevState => ({ ...prevState}));
            const responseDashboard = await fetch(`/api/orders-by-date?start=${formattedStartDateDashboard}&end=${formattedEndDateDashboard}`);
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

        // Fetching logic for Fb
        try {
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
                totalProfit: responseFb.data.totalProfit, // Adding totalProfit here
            });
            setFetchVersion(prevVersion => prevVersion + 1);
            setPrevFbData(fbData);
        } catch (error) {
            console.error('Error fetching Facebook data:', error);
            setFbData(prevState => ({ ...prevState, isLoading: false }));
        }
    };

    const isDateToday = (date) => {
        const today = moment().tz(timezone).startOf('day');
        return date.isSame(today, 'day');
    };

    useEffect(() => {
        // Connect to WebSocket server
        const socket = io('http://localhost:2000');

        socket.on('data-update', (data) => {
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
            console.error('Error receiving data:', error.message);
        });

        // Clean up on unmount or when dependencies change
        return () => {
            socket.off('data-update');
            socket.off('data-error');
            socket.close();
        };
    }, [startDate, endDate]);

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
