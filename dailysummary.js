const moment = require('moment-timezone');
const fs = require('fs');
const { fetchDashboardData, fetchFbData } = require('./app.js');

const { Pool } = require('pg');

// Configure the connection pool using environment variables
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const timezone = 'America/Los_Angeles';
const end = moment().tz(timezone).subtract(1, 'days').startOf('day'); // Yesterday
const start = moment("2023-12-01").tz(timezone).startOf('day'); // Starting from December 1st, 2023


async function insertData(tableName, data) {
  // Your existing insertData function seems to be designed for batch insertion.
  // It would be best to ensure that the data array is correctly structured and contains all necessary fields.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Loop through each item in the data array and insert it into the table
    for (const item of data) {
      const keys = Object.keys(item);
      const values = Object.values(item).map(val => val === null ? 'NULL' : `'${val.toString().replace(/'/g, "''")}'`); // Handling null values and escaping single quotes
      const insertQuery = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${values.join(", ")})`;
      await client.query(insertQuery);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

}

async function saveDashboardDataToDb(dashboardData) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Destructure the data to get individual parts
    const {
      count,
      revenue,
      largestOrder,
      aggregatedData
    } = dashboardData;

    // Extract aggregated data
    const {
      tags,
      utm_source,
      custom1,
      custom2,
      facebookOrders,
      utm_campaign,
      utm_content,
      utm_term
    } = aggregatedData;

    // Construct the insert query for dashboard data
    const keys = ['count', 'revenue', 'largestOrder', 'tags', 'utm_source', 'custom1', 'custom2', 'facebook_orders', 'utm_campaign', 'utm_content', 'utm_term'];
    const values = [
      count,
      revenue,
      largestOrder,
      JSON.stringify(tags),
      JSON.stringify(utm_source),
      JSON.stringify(custom1),
      JSON.stringify(custom2),
      JSON.stringify(facebookOrders),
      JSON.stringify(utm_campaign),
      JSON.stringify(utm_content),
      JSON.stringify(utm_term)
    ].map(val => val === null ? 'NULL' : `'${val.toString().replace(/'/g, "''")}'`); // Handling null values and escaping single quotes

    const insertQuery = `INSERT INTO summary_dashboard_data (${keys.join(", ")}) VALUES (${values.join(", ")})`;

    // Execute the query
    await client.query(insertQuery);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving dashboard data:', error);
  } finally {
    client.release();
  }
}

async function fetchDataForDate(date) {
  const formattedDateDashboard = date.toISOString().split('T')[0]; // 'YYYY-MM-DD'
  const formattedDateFb = date.clone().toDate().toLocaleDateString('en-US', { timeZone: timezone }); // 'M/D/YYYY'

  const dashboardData = await fetchDashboardData(formattedDateDashboard, formattedDateDashboard);
  const fbData = await fetchFbData(formattedDateFb, formattedDateFb);

  if (dashboardData) {
    await saveDashboardDataToDb(dashboardData);
  }

  if (fbData) {
    if (fbData.campaignsData && fbData.campaignsData.length) {
      await insertData('summary_campaigns', fbData.campaignsData);
    }
    if (fbData.adsetsData && fbData.adsetsData.length) {
      await insertData('summary_adsets', fbData.adsetsData);
    }
    if (fbData.adsData && fbData.adsData.length) {
      await insertData('summary_ads', fbData.adsData);
    }
    if (fbData.adaccounts && fbData.adaccounts.length) {
      await insertData('summary_accounts', fbData.adaccounts.map(acc => ({...acc, total_profit: fbData.totalProfit})));
    }
  }
}

async function fetchData() {
  let currentDate = end.clone();
  while (currentDate.isSameOrAfter(start, 'day')) {
    try {
      await fetchDataForDate(currentDate);
      console.log(`Data fetched for: ${currentDate.format('YYYY-MM-DD')}`);
    } catch (error) {
      console.error(`Error fetching or saving data for ${currentDate.format('YYYY-MM-DD')}:`, error);
    }
    currentDate = currentDate.subtract(1, 'days');
  }
}

fetchData();