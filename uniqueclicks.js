const { Pool } = require('pg');
const axios = require('axios');
const moment = require('moment'); // Moment.js is great for handling dates
require('dotenv').config();

// Configure your PostgreSQL connection
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Function to fetch all ads from the facebook_ads table
async function fetchAllAds() {
    const query = 'SELECT ad_id, time_database FROM facebook_ads;';
    try {
        const res = await pool.query(query);
        return res.rows; // rows is an array of objects with ad_id and time_database
    } catch (error) {
        console.error("Error fetching ads: ", error);
        return [];
    }
}

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

// Function to fetch unique clicks from Facebook API for a given ad
async function fetchUniqueClicksForAd(adId, date) {
    let backoffTime = 2000; // Initial backoff time in milliseconds
    const MAX_BACKOFF_TIME = 32000; 
    const formattedDate = date.format("YYYY-MM-DD"); // Format date for Facebook API
    const url = `https://graph.facebook.com/v18.0/${adId}/insights`;
    const params = {
        access_token: process.env.FACEBOOK_TOKEN,
        fields: 'unique_clicks',
        time_range: `{"since":"${formattedDate}","until":"${formattedDate}"}`, // Specific date
    };

    let attempts = 0;
    const MAX_ATTEMPTS = 5;

    while (attempts < MAX_ATTEMPTS) {
        try {
            const response = await axios.get(url, { params });
            console.log("API Response: ", response.data); // Log the entire response

            if (response.data.data.length > 0 && response.data.data[0].hasOwnProperty('unique_clicks')) {
                return response.data.data[0].unique_clicks;
            } else {
                console.log(`No unique clicks data available for ad ${adId} on ${formattedDate}`);
                return 0; // Default to 0 or handle as needed
            }
        } catch (error) {
            console.error(`Attempt ${attempts + 1}: Error fetching unique clicks for ad ${adId}:`, error);
            
            // Handling 429 Too Many Requests error specifically
            if (error.response && error.response.status === 429) {
                backoffTime = Math.min(backoffTime * 2, MAX_BACKOFF_TIME); // Double backoff time, but don't exceed MAX
                console.log(`Rate limit hit. Waiting ${backoffTime} ms before retrying...`);
                await wait(backoffTime);
                attempts++;
                continue; // Retry the request
            } else {
                break;

            }

        }
    }

    console.log(`Failed to fetch unique clicks for ad ${adId} on ${formattedDate} after ${MAX_ATTEMPTS} attempts.`);
    return 0;
}


// Function to update an ad with unique clicks in the facebook_ads table
async function updateAdWithUniqueClicks(adId, uniqueClicks) {
    const query = 'UPDATE facebook_ads SET unique_clicks = $1 WHERE ad_id = $2;';
    try {
        await pool.query(query, [uniqueClicks, adId]);
        console.log(`Updated ad ${adId} with unique clicks: ${uniqueClicks}`);
    } catch (error) {
        console.error(`Error updating unique clicks for ad ${adId}: `, error);
    }
}

// Main function to fetch and update ads with unique clicks
async function updateAdsDaily() {
    const ads = await fetchAllAds();
    const startDate = moment({ year: moment().year(), month: 10, date: 1 }); // November 1st of the current year
    const endDate = moment(); // until today

    for (let date = startDate.clone(); date.isBefore(endDate); date.add(1, 'days')) {
        const dateString = date.format("YYYY-MM-DD");
        
        // Check if any ads have time_database that matches the current date
        const adsForDate = ads.filter(ad => moment(ad.time_database).format("YYYY-MM-DD") === dateString);
        
        for (const ad of adsForDate) {
            const uniqueClicks = await fetchUniqueClicksForAd(ad.ad_id, date);
            await updateAdWithUniqueClicks(ad.ad_id, uniqueClicks);
            console.log(`Updated ad ${ad.ad_id} for date ${dateString} with unique clicks: ${uniqueClicks}`);
        }
    }
    console.log("Completed updating all ads with daily unique clicks based on time_database.");
}
// Start the process
updateAdsDaily();