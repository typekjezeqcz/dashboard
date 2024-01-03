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


async function insertData(tableName, data, date) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of data) {
      // Include created_at with date for each item
      item.created_at = date;
      const keys = Object.keys(item);
      const values = Object.values(item).map(val => val === null ? 'NULL' : `'${val.toString().replace(/'/g, "''")}'`);
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


async function saveDashboardDataToDb(dashboardData, date) {
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
    const keys = ['count', 'revenue', 'largestOrder', 'tags', 'utm_source', 'custom1', 'custom2', 'facebook_orders', 'utm_campaign', 'utm_content', 'utm_term', 'created_at'];
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
      JSON.stringify(utm_term),
      `'${date}'` // Add date as created_at for the row
    ].map(val => val === null ? 'NULL' : `'${val.toString().replace(/'/g, "''")}'`);
  
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

  const dateString = date.toISOString().split('T')[0]; // 'YYYY-MM-DD'

  if (dashboardData) {
    await saveDashboardDataToDb(dashboardData, dateString);
  }

  try {
    const fbData = await fetchFbData(formattedDateFb, formattedDateFb);

    if (fbData) {
      // Pass the dateString as the date for each insert
      if (fbData.ads && fbData.ads.length) {
        await insertData('summary_ads', fbData.ads, dateString);
      }
      if (fbData.campaigns && fbData.campaigns.length) {
        await insertData('summary_campaigns', fbData.campaigns, dateString);
      }
      if (fbData.adsets && fbData.adsets.length) {
        await insertData('summary_adsets', fbData.adsets, dateString);
      }
      if (fbData.adaccounts && fbData.adaccounts.length) {
        await insertData('summary_accounts', fbData.adaccounts.map(acc => ({...acc, total_profit: fbData.totalProfit})), dateString);
      }
    }

    console.log(`Data fetched and saved for: ${dateString}`);
  } catch (error) {
    console.error(`Error fetching or saving data for ${dateString}:`, error);
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
