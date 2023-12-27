const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto'); // Add this if not already present
require('dotenv').config();
const fs = require('fs');
const LAST_ORDER_ID_FILE = 'last_order_id.txt';
const path = require('path');
const moment = require('moment-timezone');

const app = express();
const PORT = process.env.PORT || 2000;

let lastFetchedOrderId = 0;

async function initializeApp() {
  try {
    // Read lastFetchedOrderId from the file on startup
    lastFetchedOrderId = readLastOrderIdFromFile();
    console.log('Initial last fetched order ID:', lastFetchedOrderId);

    if (!fs.existsSync(LAST_ORDER_ID_FILE)) {
      saveLastOrderIdToFile(lastFetchedOrderId);
    }


    // Fetch and handle new orders on startup
    const newOrders = await fetchShopifyOrders('admin/api/2023-10/orders.json', {
      status: 'any',
      fields: 'created_at,id,total_price,current_total_price,current_total_tax,total_tax,currency,order_number,refunds,note,note_attributes,tags,line_items',
    }, lastFetchedOrderId);

    if (newOrders.length > 0) {
      console.log('New last fetched order ID:', newOrders[newOrders.length - 1].id);
      await handleNewOrders(newOrders);
      lastFetchedOrderId = newOrders[newOrders.length - 1].id;
      saveLastOrderIdToFile(lastFetchedOrderId);
    }
    console.log(`Fetched ${newOrders.length} new orders on startup.`);
  } catch (error) {
    console.error('Error during initial fetch:', error);
  }
}

initializeApp();


// Set up your PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Middleware to parse JSON bodies
app.use(express.json({
  verify: function(req, res, buf) {
    if (req.url.startsWith('/webhook')) {
      req.rawBody = buf.toString();
    }
  }
}));

function getTodaysDate() {
  const today = new Date();
  return today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
}





function saveLastOrderIdToFile(orderId) {
  try {
    console.log(`Attempting to save last order ID: ${orderId}`);
    fs.writeFileSync(LAST_ORDER_ID_FILE, orderId.toString());
    console.log('Last order ID saved:', orderId);
  } catch (err) {
    console.error('Error saving last order ID to file:', err);
  }
}



function readLastOrderIdFromFile() {
  if (fs.existsSync(LAST_ORDER_ID_FILE)) {
    return parseInt(fs.readFileSync(LAST_ORDER_ID_FILE, 'utf-8'), 10);
  }
  return 0; // Default to 0 if file doesn't exist
}

function extractVariantIds(order) {
  return order.line_items.map(item => item.variant_id);
}

// Function to fetch costs for a list of variant IDs
async function fetchCostsForVariants(variantIds) {
  const placeholders = variantIds.map((_, index) => `$${index + 1}`).join(', ');
  const query = `SELECT variant_id, cost FROM nooro_products WHERE variant_id IN (${placeholders})`;
  const res = await pool.query(query, variantIds);
  return res.rows.reduce((acc, row) => {
    acc[row.variant_id] = row.cost;
    return acc;
  }, {});
}


async function insertOrderToDatabase(order) {
  const utm_campaign = order.note_attributes.find(attr => attr.name === 'utm_campaign')?.value;
  const utm_content = order.note_attributes.find(attr => attr.name === 'utm_content')?.value;
  const utm_term = order.note_attributes.find(attr => attr.name === 'utm_term')?.value;

  const variantIds = extractVariantIds(order);
  const costs = await fetchCostsForVariants(variantIds);

  // Calculate total cost of the order
  let totalCost = 0;
  if (order.line_items && Array.isArray(order.line_items)) {
    order.line_items.forEach(item => {
      const itemCost = costs[item.variant_id] || 0;
      totalCost += itemCost * (item.quantity || 0);
    });
  } else {
    // Log for debugging purposes
    console.log("Order without line_items or not an array:", order);
  }

  const query = `INSERT INTO shopify_orders (
      shopify_order_id, created_at, total_price, current_total_price, 
      current_total_tax, total_tax, currency, order_number, 
      refunds, note, note_attributes, tags, status,
      utm_campaign, utm_content, utm_term, line_items, total_cost
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    ON CONFLICT (shopify_order_id) DO NOTHING;`;

  const values = [
    order.id, order.created_at, order.total_price, order.current_total_price,
    order.current_total_tax, order.total_tax, order.currency, order.order_number,
    JSON.stringify(order.refunds), order.note, JSON.stringify(order.note_attributes), order.tags,
    'active', utm_campaign, utm_content, utm_term, JSON.stringify(order.line_items), totalCost
  ];

  try {
    await pool.query(query, values);
  } catch (err) {
    console.error('Error inserting order into database:', err);
  }
}




const todaysDate = getTodaysDate();
const filename = `orders_${todaysDate}.json`;
readLastOrderIdFromFile(filename);


async function handleNewOrders(newOrders) {
  let existingOrders = [];

  // Read and parse existing file if it exists
  if (fs.existsSync(filename)) {
    const fileData = fs.readFileSync(filename, 'utf-8');
    existingOrders = JSON.parse(fileData);
  }

  // Filter out duplicate orders
  const uniqueNewOrders = newOrders.filter(newOrder => 
    !existingOrders.some(existingOrder => existingOrder.id === newOrder.id)
  );

  // Append unique new orders to the existing ones
  const updatedOrders = existingOrders.concat(uniqueNewOrders);

  // Insert unique new orders to the database and update the file
  try {
    await Promise.all(uniqueNewOrders.map(order => insertOrderToDatabase(order)));
    console.log(`Inserted ${uniqueNewOrders.length} new orders into the database.`);

    fs.writeFileSync(filename, JSON.stringify(updatedOrders, null, 2));
    console.log(`File updated with ${uniqueNewOrders.length} new orders.`);
  } catch (err) {
    console.error('Error while handling new orders:', err);
  }
}





setInterval(async () => {
  try {
    lastFetchedOrderId = readLastOrderIdFromFile(); // Read from file at the start
    console.log('Fetching new orders...');
    console.log('Last fetched order ID:', lastFetchedOrderId);

    const newOrders = await fetchShopifyOrders('admin/api/2023-10/orders.json', {
      status: 'any',
      fields: 'video_3_sec_watched_actions,created_at,id,total_price,current_total_price,current_total_tax,total_tax,currency,order_number,refunds,note,note_attributes,tags,line_items',
    }, lastFetchedOrderId);

    if (newOrders.length > 0) {
      console.log('New last fetched order ID:', newOrders[newOrders.length - 1].id);
      
      // Handle new orders (both file and database updates)
      await handleNewOrders(newOrders);

      // Update the lastFetchedOrderId and save it to the file
      lastFetchedOrderId = newOrders[newOrders.length - 1].id;
      saveLastOrderIdToFile(lastFetchedOrderId); // Save the updated lastFetchedOrderId
      
      // Now update the total costs of all orders, including the newly fetched ones
      await updateAllOrderCosts(lastFetchedOrderId);
    }
    console.log(`Fetched ${newOrders.length} new orders.`);
  } catch (error) {
    console.error('Error in scheduled order fetching:', error);
  }
}, 60000); // Runs every minute





async function fetchShopifyOrders(endpoint, initialParams, sinceId = 0) {
  let allOrders = [];
  let apiUrl = `https://${process.env.SHOPIFY_SHOP_DOMAIN}/${endpoint}`;
  let isInitialRequest = true;

  try {
    do {
      let params;
      if (isInitialRequest) {
        params = sinceId > 0 ? { ...initialParams, limit: 250, since_id: sinceId } : { ...initialParams, limit: 250 };
      } else {
        // No additional parameters for paginated requests
        params = { limit: 250 };
      }

      const response = await axios.get(apiUrl, {
        params: params,
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        },
      });

      console.log(`Fetched ${response.data.orders.length} orders.`); // Log the count of fetched orders
      for (const order of response.data.orders) {
          // Log a summary of each order's line_items immediately after fetching
          console.log(`Order ID: ${order.id}, Line Items Count: ${order.line_items ? order.line_items.length : 'None'}`);
      }


      allOrders = allOrders.concat(response.data.orders);

      // Update apiUrl and isInitialRequest for the next loop iteration
      apiUrl = null;
      const linkHeader = response.headers['link'];
      if (linkHeader) {
        const matches = linkHeader.match(/<(.*?)>; rel="next"/);
        if (matches) {
          apiUrl = matches[1];
          isInitialRequest = false;
        }
      }
    } while (apiUrl);
  } catch (error) {
    // Your existing error handling logic
    if (error.response) {
      console.log(error.response.data);
      console.log(error.response.status);
      console.log(error.response.headers);
    } else {
      console.log('Error', error.message);
    }
    throw error; // Re-throw the error to be handled by the caller
  }

  console.log(`Total orders fetched from Shopify: ${allOrders.length}`);
  return allOrders;
}


function extractVariantIds(order) {
  // Check if line_items exists and is not null
  return order.line_items ? order.line_items.map(item => item.variant_id) : [];
}

async function fetchCostsForVariants(variantIds) {
    if (variantIds.length === 0) {
        return {}; // Return empty object if no variantIds are provided
    }
    const placeholders = variantIds.map((_, index) => `$${index + 1}`).join(', ');
    const query = `SELECT variant_id, cost FROM nooro_products WHERE variant_id IN (${placeholders})`;
    const res = await pool.query(query, variantIds);
    return res.rows.reduce((acc, row) => {
      acc[row.variant_id] = row.cost;
      return acc;
    }, {});
}

async function fetchAllOrders(lastFetchedOrderId) {
  const query = `
    SELECT * FROM shopify_orders
    WHERE shopify_order_id > $1;`; // Fetch only orders with ID greater than lastFetchedOrderId
  const values = [lastFetchedOrderId];
  const res = await pool.query(query, values);
  return res.rows;
}


async function updateOrderCost(order, costs) {
  let totalCost = 0;

  if (order.line_items && Array.isArray(order.line_items)) {
    for (const item of order.line_items) {
      const itemCost = costs[item.variant_id] || 0;
      const itemQuantity = item.quantity || 0;
      totalCost += itemCost * itemQuantity;

      // Log details of each line item
    }
  }

  const updateQuery = 'UPDATE shopify_orders SET total_cost = $1 WHERE shopify_order_id = $2;';
  await pool.query(updateQuery, [totalCost, order.shopify_order_id]);
  console.log(`Updated order ${order.shopify_order_id} with total cost: ${totalCost}`);
  return totalCost; // Return totalCost for logging
}


async function updateAllOrderCosts(lastFetchedOrderId) {
  try {
    const orders = await fetchAllOrders(lastFetchedOrderId);
    for (const order of orders) {
      const variantIds = extractVariantIds(order);
      const costs = await fetchCostsForVariants(variantIds);
      const totalCost = await updateOrderCost(order, costs); // Capture totalCost for logging
      console.log(`Updated order ${order.shopify_order_id} with total cost ${totalCost}`);
    }
    console.log('All orders have been updated.');
  } catch (error) {
    console.error('Error updating order costs:', error);
  }
}



app.get('/api/todays-orders', async (req, res) => {
  try {
    const todaysDate = getTodaysDate();
    const filename = `orders_${todaysDate}.json`;

    let orders;
    if (!fs.existsSync(filename)) {
      console.log('File does not exist. Fetching all orders for today...');
      // Fetch all orders for today
      orders = await fetchShopifyOrders('admin/api/2023-10/orders.json', {
        status: 'any',
        created_at_min: todaysDate,
        fields: 'created_at,id,total_price,current_total_price,current_total_tax,total_tax,currency,order_number,refunds,note,note_attributes,tags',
      });

      // Create the file with today's orders
      fs.writeFileSync(filename, JSON.stringify(orders, null, 2));
      console.log('File created with today\'s orders.');

      // Save orders to the database
      try {
        await Promise.all(orders.map(order => insertOrderToDatabase(order)));
        console.log('All orders for today inserted into the database.');
      } catch (dbError) {
        console.error('Error inserting orders into database:', dbError);
      }
    } else {
      // Read orders from the existing file
      const fileData = fs.readFileSync(filename, 'utf-8');
      orders = JSON.parse(fileData);
    }

    const aggregatedData = {
      tags: {},
      utm_source: {},
      custom1: {},
      custom2: {},
      facebookOrders: {},
      utm_campaign: {},
      utm_content: {},
      utm_term: {}
    };
    // Process today's orders
    const todaysOrders = orders.filter(order => order.created_at.split('T')[0] === todaysDate);

    todaysOrders.forEach(order => {
      const orderCreatedAtPacific = moment(order.created_at).tz("America/Los_Angeles").format('YYYY-MM-DD');
      if (orderCreatedAtPacific === todaysDate) {      const orderValue = parseFloat(order.current_total_price || '0');

      // Function to update the aggregated data
      const updateAggregatedData = (category, key, orderValue) => {
        if (!aggregatedData[category][key]) {
          aggregatedData[category][key] = { count: 0, totalSales: 0, largestOrder: 0 };
        }
        aggregatedData[category][key].count++;
        aggregatedData[category][key].totalSales += orderValue;
        if (orderValue > aggregatedData[category][key].largestOrder) {
          aggregatedData[category][key].largestOrder = orderValue;
        }
      };

      // Aggregate data for 'Tags'
      const tags = order.tags ? order.tags.split(',').map(tag => tag.trim()) : ['Other'];
      tags.forEach(tag => {
        updateAggregatedData('tags', tag, orderValue);
      });

      

      // Aggregate data for 'utm_source', 'custom1', 'custom2'
      order.note_attributes.forEach(attr => {
        const key = attr.value || 'Unknown';
        if (aggregatedData[attr.name]) {
          updateAggregatedData(attr.name, key, orderValue);
        }
  
        // Check if utm_source is 'facebook' and aggregate separately
        if (attr.name === 'utm_source' && key.toLowerCase() === 'facebook') {
          updateAggregatedData('facebookOrders', key, orderValue);
        }
        
      });}
    });


    // Calculate total revenue for today's orders
    const todaysRevenue = todaysOrders.reduce((total, order) => {
      // Parse prices to float
      const orderTotal = parseFloat(order.current_total_price || '0');

      // Subtract refunds if available
      if (order.refunds && order.refunds.length > 0) {
        const refundTotal = order.refunds.reduce((refundSum, refund) => {
          return refundSum + parseFloat(refund.amount || '0');
        }, 0);
        return total + orderTotal - refundTotal;
      } else {
        return total + orderTotal;
      }
    }, 0);
    const largestOrder = todaysOrders.reduce((largest, order) => {
      const orderTotal = parseFloat(order.current_total_price || '0');
      return orderTotal > largest ? orderTotal : largest;
  }, 0);

    // Send count and revenue of today's orders
    console.log("Today's Revenue:", todaysRevenue);
    console.log("Largest order:", largestOrder);

  
    fs.writeFile(filename, JSON.stringify(orders, null, 2), (err) => {
      if (err) {
        console.error('Error writing file:', err);
      }
    });
    res.json({ count: todaysOrders.length, revenue: todaysRevenue.toFixed(2), largestOrder: largestOrder.toFixed(2), aggregatedData });
  } catch (error) {
    console.error('Error fetching orders from Shopify:', error);
    res.status(500).send('Error fetching orders from Shopify');
  }
});


// Example usage

async function fetchVariantIds() {
  try {
    const query = `
      SELECT
        jsonb_array_elements(line_items)->>'variant_id' AS variant_id,
        jsonb_array_elements(line_items)->>'product_id' AS product_id,
        jsonb_array_elements(line_items)->>'title' AS title
      FROM 
        shopify_orders 
      ORDER BY 
        id DESC 
      LIMIT 50;
    `;
    const res = await pool.query(query);
    return res.rows.map(row => ({ 
      variantId: row.variant_id, 
      productId: row.product_id,
      title: row.title
    }));
    } catch (error) {
    console.error('Error fetching variant IDs from database:', error);
    throw error;
  }
}

async function fetchInventoryItemIds(variantProductPairs) {
  try {
    const inventoryItems = [];
    for (const pair of variantProductPairs) {
      // Skip if title is 'Tip' or variantId is null
      if (pair.title === 'Tip' || pair.variantId === null) {
        console.log(`Skipping variant with title 'Tip' or null variantId.`);
        continue;
      }

      try {
        const variantResponse = await axios.get(`https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/variants/${pair.variantId}.json`, {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          },
        });
        inventoryItems.push({
          variantId: pair.variantId,
          productId: pair.productId,
          title: pair.title,
          inventoryItemId: variantResponse.data.variant.inventory_item_id
        });
      } catch (innerError) {
        console.error(`Error fetching inventory item ID for variant ${pair.variantId}:`, innerError);
        // Continue to the next iteration even if there's an error
      }
    }
    return inventoryItems;
  } catch (error) {
    console.error('Error in fetchInventoryItemIds:', error);
    throw error;
  }
}



async function fetchInventoryItemDetails(inventoryItems) {
  const detailedInventory = [];
  for (const item of inventoryItems) {
    try {
      const inventoryItemResponse = await axios.get(`https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/inventory_items/${item.inventoryItemId}.json`, {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        },
      });

      const detail = inventoryItemResponse.data.inventory_item; // Corrected reference

      detailedInventory.push({
        variantId: item.variantId,
        productId: item.productId,
        title: item.title,
        inventoryItemId: item.inventoryItemId,
        inventorySku: detail.sku,
        createdAt: detail.created_at,
        updatedAt: detail.updated_at,
        requiresShipping: detail.requires_shipping,
        cost: detail.cost,
        countryCodeOfOrigin: detail.country_code_of_origin,
        provinceCodeOfOrigin: detail.province_code_of_origin,
        harmonizedSystemCode: detail.harmonized_system_code,
        tracked: detail.tracked,
        adminGraphqlApiId: detail.admin_graphql_api_id
      });
    } catch (error) {
      console.error(`Error fetching inventory item details for item ${item.inventoryItemId}:`, error);
      // Handle the error as per your policy (skip/continue/stop)
    }
  }
  return detailedInventory;
}



async function master() {
  try {
    // Fetch variant IDs and log
    const variantIds = await fetchVariantIds();
    console.log('Fetched Variant IDs:', variantIds);

    // Fetch inventory items using variant IDs and log
    const inventoryItems = await fetchInventoryItemIds(variantIds);
    console.log('Fetched Inventory Items:', inventoryItems);

    // Extract inventory item IDs and log
    const inventoryItemIds = inventoryItems.map(item => item.inventoryItemId);
    console.log('Extracted Inventory Item IDs:', inventoryItemIds);

    // Fetch inventory details using inventory item IDs and log
    const inventoryDetails = await fetchInventoryItemDetails(inventoryItems);
    console.log('Fetched Inventory Details:', inventoryDetails);

    // Save the fetched data to a file
    fs.writeFileSync('costData.json', JSON.stringify(inventoryDetails, null, 2));
    console.log('Cost data saved to costData.json');

    for (const item of inventoryDetails) {
      const upsertQuery = `
        INSERT INTO nooro_products (
          variant_id, product_id, title, inventory_item_id, 
          inventory_sku, created_at, updated_at, requires_shipping, 
          cost, country_code_of_origin, province_code_of_origin, 
          harmonized_system_code, tracked, admin_graphql_api_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT (inventory_item_id) DO UPDATE SET
          variant_id = EXCLUDED.variant_id,
          product_id = EXCLUDED.product_id,
          title = EXCLUDED.title,
          inventory_sku = EXCLUDED.inventory_sku,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          requires_shipping = EXCLUDED.requires_shipping,
          cost = EXCLUDED.cost,
          country_code_of_origin = EXCLUDED.country_code_of_origin,
          province_code_of_origin = EXCLUDED.province_code_of_origin,
          harmonized_system_code = EXCLUDED.harmonized_system_code,
          tracked = EXCLUDED.tracked,
          admin_graphql_api_id = EXCLUDED.admin_graphql_api_id
      `;

      await pool.query(upsertQuery, [
        item.variantId, item.productId, item.title, item.inventoryItemId,
        item.inventorySku, item.createdAt, item.updatedAt, item.requiresShipping,
        item.cost, item.countryCodeOfOrigin, item.provinceCodeOfOrigin,
        item.harmonizedSystemCode, item.tracked, item.adminGraphqlApiId
      ]);
    }

    console.log('All data saved or updated in the database');
  } catch (error) {
    console.error('Error in master function:', error);
  }
}





app.get('/api/todays-orders-db', async (req, res) => {
  try {
    const todaysDate = getTodaysDate(); // Assuming this returns a date string like 
    const startDate = `${todaysDate}T00:00:00-08:00`; // Start of the day
    const endDate = `${todaysDate}T23:59:59-08:00`; 

    // Query to fetch orders created today
    const query = `SELECT * FROM shopify_orders WHERE created_at >= $1 AND created_at <= $2`;
    const values = [startDate, endDate];

    const result = await pool.query(query, values);
    const todaysOrders = result.rows;

    const aggregatedData = {
      tags: {},
      utm_source: {},
      custom1: {},
      custom2: {},
      facebookOrders: {},
      utm_campaign: {},
      utm_content: {},
      utm_term: {}
    };

    todaysOrders.forEach(order => {
      const orderValue = parseFloat(order.current_total_price || '0');

      // Function to update the aggregated data
      const updateAggregatedData = (category, key, orderValue) => {
        if (!aggregatedData[category][key]) {
          aggregatedData[category][key] = { count: 0, totalSales: 0, largestOrder: 0 };
        }
        aggregatedData[category][key].count++;
        aggregatedData[category][key].totalSales += orderValue;
        if (orderValue > aggregatedData[category][key].largestOrder) {
          aggregatedData[category][key].largestOrder = orderValue;
        }
      };

      // Aggregate data for 'Tags'
      const tags = order.tags ? order.tags.split(',').map(tag => tag.trim()) : ['Other'];
      tags.forEach(tag => {
        updateAggregatedData('tags', tag, orderValue);
      });

      

      // Aggregate data for 'utm_source', 'custom1', 'custom2'
      order.note_attributes.forEach(attr => {
        const key = attr.value || 'Unknown';
        if (aggregatedData[attr.name]) {
          updateAggregatedData(attr.name, key, orderValue);
        }
  
        // Check if utm_source is 'facebook' and aggregate separately
        if (attr.name === 'utm_source' && key.toLowerCase() === 'facebook') {
          updateAggregatedData('facebookOrders', key, orderValue);
        }
      });
    });

    

    // Calculate total revenue for today's orders
    const todaysRevenue = todaysOrders.reduce((total, order) => {
      // Parse prices to float
      const orderTotal = parseFloat(order.current_total_price || '0');

      // Subtract refunds if available
      if (order.refunds && order.refunds.length > 0) {
        const refundTotal = order.refunds.reduce((refundSum, refund) => {
          return refundSum + parseFloat(refund.amount || '0');
        }, 0);
        return total + orderTotal - refundTotal;
      } else {
        return total + orderTotal;
      }
    }, 0);
    const largestOrder = todaysOrders.reduce((largest, order) => {
      const orderTotal = parseFloat(order.current_total_price || '0');
      return orderTotal > largest ? orderTotal : largest;
  }, 0);

    // Send count and revenue of today's orders
    console.log("Today's Revenue from DB:", todaysRevenue);
    console.log("Largest order from DB:", largestOrder);

    res.json({
      count: todaysOrders.length, 
      revenue: todaysRevenue.toFixed(2), 
      largestOrder: largestOrder.toFixed(2), 
      aggregatedData
    });
  } catch (error) {
    console.error('Error fetching orders from database:', error);
    res.status(500).send('Error fetching orders from database');
  }
});

app.get('/api/orders-by-date', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).send('Start and end date parameters are required');
    }

    // Convert the dates to timestamps
    const startDate = `${start}T00:00:00-08:00`;
    const endDate = `${end}T23:59:59-08:00`;

    // Query to fetch orders for the given date
      const query = `SELECT * FROM shopify_orders WHERE created_at >= $1 AND created_at <= $2`;

      const values = [startDate, endDate];


      const result = await pool.query(query, values);
        const orders = result.rows;

    const aggregatedData = {
      tags: {},
      utm_source: {},
      custom1: {},
      custom2: {},
      facebookOrders: {},
      utm_campaign: {},
      utm_content: {},
      utm_term: {}
    };

    orders.forEach(order => {
      const orderValue = parseFloat(order.current_total_price || '0');

      // Function to update the aggregated data
      const updateAggregatedData = (category, key, orderValue) => {
        if (!aggregatedData[category][key]) {
          aggregatedData[category][key] = { count: 0, totalSales: 0, largestOrder: 0 };
        }
        aggregatedData[category][key].count++;
        aggregatedData[category][key].totalSales += orderValue;
        if (orderValue > aggregatedData[category][key].largestOrder) {
          aggregatedData[category][key].largestOrder = orderValue;
        }
      };

      // Aggregate data for 'Tags'
      const tags = order.tags ? order.tags.split(',').map(tag => tag.trim()) : ['Other'];
      tags.forEach(tag => {
        updateAggregatedData('tags', tag, orderValue);
      });

      

      // Aggregate data for 'utm_source', 'custom1', 'custom2'
      order.note_attributes.forEach(attr => {
        const key = attr.value || 'Unknown';
        if (aggregatedData[attr.name]) {
          updateAggregatedData(attr.name, key, orderValue);
        }
  
        // Check if utm_source is 'facebook' and aggregate separately
        if (attr.name === 'utm_source' && key.toLowerCase() === 'facebook') {
          updateAggregatedData('facebookOrders', key, orderValue);
        }
      });
    });

        // Calculate total revenue for today's orders
        const totalRevenue = orders.reduce((total, order) => {
          // Parse prices to float
          const orderTotal = parseFloat(order.current_total_price || '0');
    
          // Subtract refunds if available
          if (order.refunds && order.refunds.length > 0) {
            const refundTotal = order.refunds.reduce((refundSum, refund) => {
              return refundSum + parseFloat(refund.amount || '0');
            }, 0);
            return total + orderTotal - refundTotal;
          } else {
            return total + orderTotal;
          }
        }, 0);
        const largestOrderRevenue = orders.reduce((largest, order) => {
          const orderTotal = parseFloat(order.current_total_price || '0');
          return orderTotal > largest ? orderTotal : largest;
      }, 0);
    

    
        res.json({
          count: orders.length, 
          revenue: totalRevenue.toFixed(2), 
          largestOrder: largestOrderRevenue.toFixed(2), 
          aggregatedData
        });
      } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).send('Error fetching orders');
      }
    });





// FACEBOOK

function getTodaysDatePacific() {
  const pacificTime = moment().tz("America/Los_Angeles").format('YYYY-MM-DD');
  return pacificTime;
}

let today = getTodaysDatePacific();

async function fetchShopifyOrderCount(campaignId, pool, today) {
  const query = `
    SELECT COUNT(*) 
    FROM shopify_orders 
    WHERE note_attributes::jsonb @> '[{"name": "utm_campaign", "value": "${campaignId}"}]'
    AND DATE(created_at) = $1;
  `;  

  try {
    const result = await pool.query(query, [today]);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    console.error(`Error fetching Shopify order count for campaign ${campaignId}:`, error);
    return 0;
  }
}


async function fetchShopifyOrderCountAdSet(adset_id, pool, today) {
  const query = `
    SELECT COUNT(*) 
    FROM shopify_orders 
    WHERE note_attributes::jsonb @> '[{"name": "utm_term", "value": "${adset_id}"}]'
    AND DATE(created_at) = $1;
  `;  

  try {
    const result = await pool.query(query, [today]);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    console.error(`Error fetching Shopify order count for adset ${adset_id}:`, error);
    return 0;
  }
}

async function fetchShopifyOrderCountAds(ad_id, pool, today) {
  const query = `
    SELECT COUNT(*) 
    FROM shopify_orders 
    WHERE note_attributes::jsonb @> '[{"name": "utm_content", "value": "${ad_id}"}]'
    AND DATE(created_at) = $1;
  `;  

  try {
    const result = await pool.query(query, [today]);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    console.error(`Error fetching Shopify order count for ad ${ad_id}:`, error);
    return 0;
  }
}

const adAccounts = ['798134188164544', '489501699514603', '1826497317736494'];

const accountNames = {
  '798134188164544': '10FC_03_US',
  '489501699514603': '10FC_05_US',
  '1826497317736494': '10FC_06_US'
};

async function fetchFacebookCampaignData() {
  let combinedInsightsData = [];
  let fetchedCampaignIds = [];

  for (const account of adAccounts) {

    try {
      const url = `https://graph.facebook.com/v18.0/act_${account}/insights`;
      const params = {
        access_token: process.env.FACEBOOK_TOKEN,
        fields: [
          'campaign_name',
          'campaign_id',
          'impressions',
          'spend',
          'actions', 
          'clicks',
          'cpc', 
          'ctr', 
          'cpm',
          'reach',
          'updated_time',
          'date_start',
          'date_stop'
        ].join(','),
        level: 'campaign',
        date_preset: 'today',
      };

      const response = await axios.get(url, { params });
      const insightsData = response.data.data;

      for (const insight of insightsData) {
        const orderCount = await fetchShopifyOrderCount(insight.campaign_id, pool, today);
        combinedInsightsData.push({
          ...insight,
          account_id: account,
          accountName: accountNames[account], 
          shopifyOrderCountCampaign: orderCount,
          data_set: 'campaign'
        });
        fetchedCampaignIds.push(insight.campaign_id);
      }
    } catch (error) { // Notice the position of the catch block
      console.error(`Error fetching insights data for account ${account}`);
      if (error.response) {
        console.error('Response:', {
          status: error.response.status,
          headers: error.response.headers,
          data: error.response.data
        });
      } else if (error.request) {
        console.error('Request:', error.request);
      } else {
        console.error('Error', error.message);
      }
      console.error('Config:', error.config);
    }
  }

  return { combinedInsightsData, fetchedCampaignIds }; 
}

async function fetchFacebookAdSetData(fetchedCampaignIds) {
  let combinedAdSetData = [];
  let backoffTime = 2000;  // Starting with a 2-second backoff

  for (const account of adAccounts) {
    let hasNextPage = true;
    let nextPageUrl = `https://graph.facebook.com/v18.0/act_${account}/insights`;

    while (hasNextPage) {
      try {
        const params = {
          access_token: process.env.FACEBOOK_TOKEN,
          fields: [
            'campaign_id',
            'campaign_name',
            'adset_id',
            'adset_name',
            'impressions',
            'spend',
            'reach',
            'cpc',
            'ctr',
            'cpm',
            'clicks',
            'date_start',
            'date_stop'
          ].join(','),
          level: 'adset',
          date_preset: 'today',
        };

        const response = await axios.get(nextPageUrl, { params });
        // Reset backoff after a successful request
        backoffTime = 2000;

        const insightsData = response.data.data;

              for (const insight of insightsData) {
                  if (fetchedCampaignIds.includes(insight.campaign_id)) {
                      const orderCount = await fetchShopifyOrderCountAdSet(insight.adset_id, pool, today);
                      combinedAdSetData.push({
                          ...insight,
                          account_id: account,
                          accountName: accountNames[account],
                          shopifyOrderCountAdSet: orderCount,
                          data_set: 'adset'
                      });
                  }
              }

              // Check for the next page
              hasNextPage = response.data.paging && response.data.paging.next;
              nextPageUrl = hasNextPage ? response.data.paging.next : null;

            } catch (error) {
              console.error(`Error fetching ad insights data for account ${account}:`, error);
            
              if (error.response) {
                console.error('Response:', {
                  status: error.response.status,
                  headers: error.response.headers,
                  data: error.response.data
                });
            
                if (error.response.status === 429) { // Rate limit error code
                  console.log(`Rate limit hit, backing off for ${backoffTime} ms`);
                  await new Promise(resolve => setTimeout(resolve, backoffTime));
                  backoffTime *= 2;  // Exponential backoff
                  // Optionally, you can add a maximum backoff time to avoid very long delays
                  backoffTime = Math.min(backoffTime, MAX_BACKOFF_TIME); 
                  continue; // Retry the request
                }
              } else if (error.request) {
                console.error('Request:', error.request);
              } else {
                console.error('Error', error.message);
              }
              console.error('Config:', error.config);
              hasNextPage = false; // Stop the loop in case of a non-rate-limit error
            }
          }
        }
      
        return combinedAdSetData;
      }


      async function fetchFacebookAdsData(adAccounts) {
        let combinedAdsData = [];
        let backoffTime = 2000; // Initial backoff time in milliseconds
        const MAX_BACKOFF_TIME = 32000; // Maximum backoff time
    
        for (const account of adAccounts) {
            let hasNextPage = true;
            let nextPageUrl = `https://graph.facebook.com/v18.0/act_${account}/insights`;
    
            while (hasNextPage) {
                try {
                    const params = {
                        access_token: process.env.FACEBOOK_TOKEN,
                        fields: [
                            'adset_id',
                            'adset_name',
                            'ad_id',
                            'ad_name',
                            'impressions',
                            'spend',
                            'cpc',
                            'clicks',
                            'reach',
                            'ctr',
                            'cpm',
                            'date_start',
                            'date_stop'
                            // Add other relevant fields here
                        ].join(','),
                        level: 'ad',
                        date_preset: 'today',
                        limit: 40, // Set a limit for each page of data
                    };
    
                    const response = await axios.get(nextPageUrl, { params });
                    const insightsData = response.data.data;
    
                    for (const insight of insightsData) {
                      const orderCount = await fetchShopifyOrderCountAds(insight.ad_id, pool, today);
                      combinedAdsData.push({
                          ...insight,
                          account_id: account,
                          accountName: accountNames[account],
                          shopifyOrderCountAds: orderCount,
                          dataType: 'ads',
                          data_set: 'ads'
                      });
                  }
  
                  // Update pagination controls
                  hasNextPage = response.data.paging && response.data.paging.next;
                  nextPageUrl = hasNextPage ? response.data.paging.next : null;
  
              } catch (error) {
                    console.error(`Error fetching ad insights data for account ${account}:`, error);
                    if (error.response) {
                        console.error('Response:', {
                            status: error.response.status,
                            headers: error.response.headers,
                            data: error.response.data
                        });
    
                        if (error.response.status === 429) { // Rate limit error code
                            console.log(`Rate limit hit, backing off for ${backoffTime} ms`);
                            await new Promise(resolve => setTimeout(resolve, backoffTime));
                            backoffTime = Math.min(backoffTime * 2, MAX_BACKOFF_TIME);  // Exponential backoff
                            continue; // Retry the request
                        }
                    } else if (error.request) {
                        console.error('Request:', error.request);
                    } else {
                        console.error('Error', error.message);
                    }
                    console.error('Config:', error.config);
                    hasNextPage = false; // Stop the loop in case of a non-rate-limit error
                }
            }
        }
    
        return combinedAdsData;
    }
    



async function fetchFacebookCampaignStatus() {
  let campaignStatusData = [];

  for (const account of adAccounts) {
    try {
      // Requesting data from the campaign node instead of the insights node
      const url = `https://graph.facebook.com/v18.0/act_${account}/campaigns`;
      const params = {
        access_token: process.env.FACEBOOK_TOKEN,
        fields: [
          'effective_status'
          // other fields as required
        ].join(',')
      };

      const response = await axios.get(url, { params });
      const campaignsData = response.data.data;

      campaignStatusData.push(...campaignsData);
    } catch (error) {
      console.error(`Error fetching campaign status for account ${account}:`, error);
      // handle error or continue to next account
    }
  }

  return campaignStatusData;
}



async function fetchFacebookAdAccountSummary(adAccounts) {
  let adAccountSummaryData = [];

  for (const account of adAccounts) {
    try {
      const url = `https://graph.facebook.com/v18.0/act_${account}/insights`;
      const params = {
        access_token: process.env.FACEBOOK_TOKEN,
        fields: [
          'spend', 'impressions', 'actions', 'clicks', 'reach', 'cpc', 'ctr', 'cpm', 'date_stop', 'date_start'
        ].join(','),
        action_breakdowns: 'action_type',
        summary: 'spend,impressions,actions,clicks,reach,cpc,ctr,cpm,date_stop,date_start',
        date_preset: 'today',
      };

      const response = await axios.get(url, { params });
      const summaryData = response.data.data;

      for (const data of summaryData) {
        const purchases = data.actions?.find(action => action.action_type === 'offsite_conversion.fb_pixel_purchase')?.value ?? 0;
        adAccountSummaryData.push({
          accountId: account,
          accountName: accountNames[account], // Look up the name using the account ID
          spend: data.spend,
          impressions: data.impressions,
          purchases: purchases,
          clicks: data.clicks,
          reach: data.reach,
          cpc: data.cpc,
          ctr: data.ctr,
          cpm: data.cpm,
          data_set: 'ad_account',
          date_start: data.date_start,
          date_stop: data.date_stop

          
        });
      }
    } catch (error) {
      console.error('Error fetching data for account:', account, error);
    }
  }

  return adAccountSummaryData;
}


async function saveDataToDatabase(dataset, tableName) {
  let insertQuery;
  
  switch (tableName) {
    case 'facebook_ads':
      insertQuery = `
      INSERT INTO facebook_ads (
        ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, account_id, account_name, 
        impressions, spend, cpc, ctr, cpm, clicks, reach, shopify_order_count, 
        time_database, data_set, date_start, date_stop
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      ) ON CONFLICT (ad_id, date_start) DO UPDATE SET
        ad_name = EXCLUDED.ad_name,
        adset_name = EXCLUDED.adset_name,
        campaign_name = EXCLUDED.campaign_name, 
        account_name = EXCLUDED.account_name, 
        impressions = EXCLUDED.impressions, 
        spend = EXCLUDED.spend, 
        cpc = EXCLUDED.cpc, 
        ctr = EXCLUDED.ctr, 
        cpm = EXCLUDED.cpm, 
        clicks = EXCLUDED.clicks, 
        reach = EXCLUDED.reach, 
        shopify_order_count = EXCLUDED.shopify_order_count, 
        time_database = EXCLUDED.time_database, 
        data_set = EXCLUDED.data_set, 
        date_stop = EXCLUDED.date_stop
      `;
      break;


      case 'facebook_adsets':
        insertQuery = `
          INSERT INTO facebook_adsets (
            adset_id, adset_name, campaign_id, campaign_name, account_id, account_name, 
            impressions, spend, cpc, ctr, cpm, clicks, reach, shopify_order_count, 
            time_database, data_set, date_start, date_stop
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
          ) ON CONFLICT (adset_id, date_start) DO UPDATE SET
            adset_name = EXCLUDED.adset_name, 
            campaign_name = EXCLUDED.campaign_name, 
            account_name = EXCLUDED.account_name, 
            impressions = EXCLUDED.impressions, 
            spend = EXCLUDED.spend, 
            cpc = EXCLUDED.cpc, 
            ctr = EXCLUDED.ctr, 
            cpm = EXCLUDED.cpm, 
            clicks = EXCLUDED.clicks, 
            reach = EXCLUDED.reach, 
            shopify_order_count = EXCLUDED.shopify_order_count, 
            time_database = EXCLUDED.time_database, 
            data_set = EXCLUDED.data_set, 
            date_stop = EXCLUDED.date_stop
        `;
        break;

        case 'facebook_campaigns':
          insertQuery = `
            INSERT INTO facebook_campaigns (
              campaign_id, campaign_name, account_id, account_name, 
              impressions, spend, cpc, ctr, cpm, clicks, reach, shopify_order_count, 
              time_database, data_set, date_start, date_stop
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
            ) ON CONFLICT (campaign_id, date_start) DO UPDATE SET
              campaign_name = EXCLUDED.campaign_name, 
              account_name = EXCLUDED.account_name, 
              impressions = EXCLUDED.impressions, 
              spend = EXCLUDED.spend, 
              cpc = EXCLUDED.cpc, 
              ctr = EXCLUDED.ctr, 
              cpm = EXCLUDED.cpm, 
              clicks = EXCLUDED.clicks, 
              reach = EXCLUDED.reach, 
              shopify_order_count = EXCLUDED.shopify_order_count, 
              time_database = EXCLUDED.time_database, 
              data_set = EXCLUDED.data_set, 
              date_stop = EXCLUDED.date_stop
          `;
          break;

          case 'facebook_adaccounts':
            insertQuery = `
              INSERT INTO facebook_adaccounts (
                account_id, account_name, impressions, spend, cpc, ctr, cpm, 
                clicks, reach, time_database, data_set, date_start, date_stop
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
              ) ON CONFLICT (account_id, date_start) DO UPDATE SET
                account_name = EXCLUDED.account_name, 
                impressions = EXCLUDED.impressions, 
                spend = EXCLUDED.spend, 
                cpc = EXCLUDED.cpc, 
                ctr = EXCLUDED.ctr, 
                cpm = EXCLUDED.cpm, 
                clicks = EXCLUDED.clicks, 
                reach = EXCLUDED.reach, 
                time_database = EXCLUDED.time_database, 
                data_set = EXCLUDED.data_set, 
                date_start = EXCLUDED.date_start,
                date_stop = EXCLUDED.date_stop
            `;
            break;

            default:
              throw new Error('Invalid table name');
          }

            for (const record of dataset) {
              let values;    
              const pacificTime = moment().tz("America/Los_Angeles").format('YYYY-MM-DD HH:mm:ss');
          
              switch (tableName) {
                case 'facebook_ads':
                  values = [
                    record.ad_id, record.ad_name, record.adset_id, record.adset_name, 
                    record.campaign_id, record.campaign_name, record.account_id, record.account_name, 
                    record.impressions, record.spend, record.cpc, record.ctr, record.cpm, 
                    record.clicks, record.reach, record.shopifyOrderCountAds, 
                    pacificTime, record.data_set, record.date_start, record.date_stop
                  ];
                  break;
          
                case 'facebook_adsets':
                  values = [
                    record.adset_id, record.adset_name, record.campaign_id, record.campaign_name, 
                    record.account_id, record.account_name, record.impressions, record.spend, 
                    record.cpc, record.ctr, record.cpm, record.clicks, record.reach, 
                    record.shopifyOrderCountAdSet, pacificTime, record.data_set, 
                    record.date_start, record.date_stop
                  ];
                  break;


                case 'facebook_campaigns':
                  values = [
                    record.campaign_id, record.campaign_name, 
                    record.account_id, record.account_name, record.impressions, record.spend, 
                    record.cpc, record.ctr, record.cpm, record.clicks, record.reach, 
                    record.shopifyOrderCountCampaign, pacificTime, record.data_set, 
                    record.date_start, record.date_stop
                  ];
                  break;

                  case 'facebook_adaccounts':
                    values = [ 
                      record.accountId, record.accountName, record.impressions, record.spend, 
                      record.cpc, record.ctr, record.cpm, record.clicks, record.reach, 
                      pacificTime, record.data_set, 
                      record.date_start, record.date_stop
                    ];
                  break;

                    default:
                      throw new Error('Invalid table name');
                  }
              
                  try {
                    await pool.query(insertQuery, values);
                  } catch (err) {
                    console.error('Error executing query', err.stack);
                    return { tableName, success: false }; // Return tableName with success status
                  }
                }
              
                return { tableName, success: true }; // Return tableName with success status
              }

            



app.get('/api/fetch-facebook-ads-data', async (req, res) => {
  try {
    const { startDate, endDate } = getTodayDateRangePacific();

    // Fetching data - Ensure that these functions now return data with resolved Shopify order counts
    const campaignData = await fetchFacebookCampaignData();  // Shopify order counts should be resolved inside this function
    const combinedInsightsData = campaignData.combinedInsightsData;
    const fetchedCampaignIds = campaignData.fetchedCampaignIds;

    const fbAdsData = await fetchFacebookAdsData(adAccounts);  // Shopify order counts should be resolved inside this function
    const adSetData = await fetchFacebookAdSetData(fetchedCampaignIds);  // Shopify order counts should be resolved inside this function
    const adAccountSummaryData = await fetchFacebookAdAccountSummary(adAccounts);
    const campaignStatusData = await fetchFacebookCampaignStatus();

    // Saving data to the database
    const adsSaveResult = await saveDataToDatabase(fbAdsData, 'facebook_ads');
    const adSetsSaveResult = await saveDataToDatabase(adSetData, 'facebook_adsets');
    const campaignsSaveResult = await saveDataToDatabase(combinedInsightsData, 'facebook_campaigns');
    const adAccountsSaveResult = await saveDataToDatabase(adAccountSummaryData, 'facebook_adaccounts');

    // Process combinedData
    const combinedData = combinedInsightsData.map(insight => {
      const statusInfo = campaignStatusData.find(campaign => campaign.id === insight.campaign_id);
      const campaignStatus = statusInfo ? statusInfo.effective_status : 'unknown';
      return {
        ...insight,
        campaign_status: campaignStatus,
      };
    });

    // Define the response data
    const responseData = {
      combinedData: combinedData,
      adsetData: adSetData,
      fbAdsData: fbAdsData,
      adAccountSummaryData: adAccountSummaryData,
      campaignStatusData: campaignStatusData,
      saveResults: {
        ads: adsSaveResult,
        adSets: adSetsSaveResult,
        campaigns: campaignsSaveResult,
        adAccounts: adAccountsSaveResult
      }
    };

    const logData = {
      saveResults: {
        ads: adsSaveResult,
        adSets: adSetsSaveResult,
        campaigns: campaignsSaveResult,
        adAccounts: adAccountsSaveResult
      }
    };

    // Save to a JSON file
    const todayPacificTime = moment().tz("America/Los_Angeles").format('YYYY-MM-DD'); // Format: 'YYYY-MM-DD'
    const filePath = path.join(__dirname, `facebook_ads_data_${todayPacificTime}.json`);
    fs.writeFileSync(filePath, JSON.stringify(responseData, null, 2));

    console.log('Facebook Ads data saved to file');
    res.json(logData);
  } catch (error) {
    console.error('Error in API route:', error);
    res.status(500).json({ error: error.message });
  }
});

let isFetching = false;

setInterval(async () => {
  if (!isFetching) {
      isFetching = true;
      console.log('Running task every minute');
      try {
          const response = await axios.get('http://localhost:2000/api/fetch-facebook-ads-data');
          console.log('Fb Data fetched and saved');
      } catch (error) {
          console.error('Error fetching and saving data:', error);
      } finally {
          isFetching = false;
      }
  } else {
      console.log('Previous fetch still in progress, waiting for next interval.');
  }
}, 60000);


app.get('/api/facebook-data', async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
      return res.status(400).send('Start date and end date are required');
  }

  
  try {

    const adsQuery = `
    SELECT ad_id, 
           ad_name,
           adset_id,
           campaign_id,
           account_id,
           data_set,
           SUM(impressions) as total_impressions, 
           SUM(clicks) as total_clicks, 
           SUM(spend) as total_spend,
           AVG(cpm) as average_cpm,
           AVG(ctr) as average_ctr,
           SUM(unique_clicks) as unique_clicks
    FROM facebook_ads 
    WHERE date_start BETWEEN $1 AND $2 
    GROUP BY ad_id, ad_name, adset_id, data_set, campaign_id, account_id`;
  

    const campaignsQuery = `
    SELECT campaign_id, 
           campaign_name,
           account_id,
           data_set,
           SUM(impressions) as total_impressions, 
           SUM(clicks) as total_clicks, 
           SUM(spend) as total_spend,
           AVG(cpm) as average_cpm,
           AVG(ctr) as average_ctr,
           SUM(unique_clicks) as unique_clicks
    FROM facebook_campaigns
    WHERE date_start BETWEEN $1 AND $2 
    GROUP BY campaign_id, campaign_name, account_id, data_set`;


        const adsetsQuery = `
        SELECT adset_id, 
               adset_name,
               campaign_id,
               account_id,
               data_set,
        SUM(impressions) as total_impressions, 
        SUM(clicks) as total_clicks, 
        SUM(spend) as total_spend,
        AVG(cpm) as average_cpm,
        AVG(ctr) as average_ctr,
        SUM(unique_clicks) as unique_clicks
  FROM facebook_adsets
  WHERE date_start BETWEEN $1 AND $2 
  GROUP BY adset_id, adset_name, campaign_id, account_id, data_set`;

  const adaccountsQuery = `
  SELECT account_id, 
  SUM(impressions) as total_impressions, 
  SUM(clicks) as total_clicks, 
  SUM(spend) as total_spend,
  AVG(cpm) as average_cpm,
  AVG(ctr) as average_ctr,
  SUM(unique_clicks) as unique_clicks
FROM facebook_adaccounts
WHERE date_start BETWEEN $1 AND $2 
GROUP BY account_id`;


        const campaignIdsQuery = `
        SELECT account_id, campaign_id
        FROM facebook_campaigns
        WHERE date_start BETWEEN $1 AND $2
        GROUP BY account_id, campaign_id`;

        const [campaignIdsResult, adsResult, campaignsResult, adsetsResult, adaccountsResult] = await Promise.all([
          pool.query(campaignIdsQuery, [startDate, endDate]),
          pool.query(adsQuery, [startDate, endDate]),
          pool.query(campaignsQuery, [startDate, endDate]),
          pool.query(adsetsQuery, [startDate, endDate]),
          pool.query(adaccountsQuery, [startDate, endDate])
      ]);

      const campaignIdsByAccount = campaignIdsResult.rows.reduce((acc, row) => {
        if (!acc[row.account_id]) {
          acc[row.account_id] = [];
        }
        acc[row.account_id].push(row.campaign_id);
        return acc;
      }, {});

      const ads = await pool.query(adsQuery, [startDate, endDate]);
      const campaigns = await pool.query(campaignsQuery, [startDate, endDate]);
      const adsets = await pool.query(adsetsQuery, [startDate, endDate]);
      const adaccounts = await pool.query(adaccountsQuery, [startDate, endDate]);

      const calculateRoasAndOrderCount = async (data, utmColumn, fbColumn) => {
        try {
          for (const obj of data) {
            const fbId = obj[fbColumn];
      
            // Ensure the query is correctly constructed
            const shopifyDataQuery = `
            SELECT SUM(total_price) as total_revenue, 
                   SUM(total_cost) as total_cost, 
                   COUNT(*) as order_count
            FROM shopify_orders
            WHERE ${utmColumn} = $1 AND DATE(created_at) BETWEEN DATE($2) AND DATE($3);`;
          
            // Ensure the parameters are correctly passed
            const shopifyDataResult = await pool.query(shopifyDataQuery, [fbId, startDate, endDate]);
            const shopifyData = shopifyDataResult.rows[0];
            const totalRevenue = parseFloat(shopifyData.total_revenue) || 0;
            const orderCount = parseInt(shopifyData.order_count, 10) || 0;
      
            const totalCost = parseFloat(shopifyData.total_cost) || 0; // Parse total_cost
            obj.total_revenue = totalRevenue;
            obj.total_cost = totalCost; // Add total_cost to the object
            obj.order_count = orderCount;
            obj.roas = totalRevenue / obj.total_spend;
          }
          return data;
        } catch (error) {
          console.error(`Error in calculateRoasAndOrderCount for ${utmColumn}:`, error);
          return [];
        }
      };
      
      
      
      
      for (const account of adaccounts.rows) {
        let totalRevenue = 0;
        let totalCost = 0; // Initialize total cost
        let totalOrderCount = 0; // Initialize total order count
        const campaignIds = campaignIdsByAccount[account.account_id] || [];
        
        for (const campaignId of campaignIds) {
            const shopifyRevenueQuery = `
              SELECT SUM(total_price) as total_revenue, 
              SUM(total_cost) as total_cost, 
              COUNT(*) as order_count
              FROM shopify_orders
              WHERE utm_campaign = $1 AND DATE(created_at) BETWEEN DATE($2) AND DATE($3)`;
            
            const shopifyRevenueResult = await pool.query(shopifyRevenueQuery, [campaignId, startDate, endDate]);
            const revenue = parseFloat(shopifyRevenueResult.rows[0].total_revenue) || 0;
            const cost = parseFloat(shopifyRevenueResult.rows[0].total_cost) || 0;
            const orderCount = parseInt(shopifyRevenueResult.rows[0].order_count, 10) || 0; // Parse order count
            
            totalRevenue += revenue;
            totalCost += cost; // Add to total cost
            totalOrderCount += orderCount; // Add to total order count
        }
    
        // Calculate and add profit to each account object
        const revenueAfterCosts = totalRevenue * 0.86;
        const profit = revenueAfterCosts - totalCost - parseFloat(account.total_spend);
      
        account.total_revenue = totalRevenue;
        account.total_spend = parseFloat(account.total_spend); // Ensure this is also a number
        account.total_cost = totalCost; // Add total cost to account object
        account.order_count = totalOrderCount; // Set total order count
        account.roas = account.total_revenue / account.total_spend || 0;
        account.profit = profit; // Set profit
    }
      
      const [adsWithRoasAndCount, adsetsWithRoasAndCount, campaignsWithRoasAndCount] = await Promise.all([
        calculateRoasAndOrderCount(adsResult.rows, 'utm_content', 'ad_id'),
        calculateRoasAndOrderCount(adsetsResult.rows, 'utm_term', 'adset_id'),
        calculateRoasAndOrderCount(campaignsResult.rows, 'utm_campaign', 'campaign_id')
      ]);
      
    
    

      const calculateCpaAndCpc = (dataRows) => {
        for (const data of dataRows) {
          // Calculate CPA
          if (data.order_count && data.order_count > 0) {
            data.cpa = data.total_spend / data.order_count;
          } else {
            data.cpa = 0; // If order_count is 0, set CPA to 0 to avoid division by zero
          }
      
          // Calculate CPC
          if (data.unique_clicks && data.unique_clicks > 0) {
            data.cpc = data.total_spend / data.unique_clicks; // Calculate CPC as Spend/unique_clicks
          } else {
            data.cpc = 0; // If unique_clicks is 0, set CPC to 0 to avoid division by zero
          }
        }
        return dataRows;
      };

      const adsWithCpaAndCpc = calculateCpaAndCpc(adsWithRoasAndCount);
      const adsetsWithCpaAndCpc = calculateCpaAndCpc(adsetsWithRoasAndCount);
      const campaignsWithCpaAndCpc = calculateCpaAndCpc(campaignsWithRoasAndCount);
      const adAccountsWithCpaAndCpc = calculateCpaAndCpc(adaccounts.rows);
      

      const calculateAov = (dataRows) => {
        for (const data of dataRows) {
          if (data.order_count && data.order_count > 0) {
            data.aov = data.total_revenue / data.order_count;
          } else {
            data.aov = 0; // If order_count is 0, set AOV to 0 to avoid division by zero
          }
        }
        return dataRows;
      };
      
      // Calculate AOV for each set of data
      const adsWithAov = calculateAov(adsWithRoasAndCount);
      const adsetsWithAov = calculateAov(adsetsWithRoasAndCount);
      const campaignsWithAov = calculateAov(campaignsWithRoasAndCount);
      const adAccountsWithAov = calculateAov(adaccounts.rows);

      const calculateCvr = (dataRows) => {
        for (const data of dataRows) {
          if (data.unique_clicks && data.unique_clicks > 0) {
            data.cvr = (data.order_count / data.unique_clicks) * 100; // CVR as a percentage
          } else {
            data.cvr = 0; // If total_clicks is 0, set CVR to 0 to avoid division by zero
          }
        }
        return dataRows;
      };
      
      // Calculate CVR for each set of data
      const adsWithCvr = calculateCvr(adsWithRoasAndCount);
      const adsetsWithCvr = calculateCvr(adsetsWithRoasAndCount);
      const campaignsWithCvr = calculateCvr(campaignsWithRoasAndCount);
      const adAccountsWithCvr = calculateCvr(adaccounts.rows);


      const calculateEpc = (dataRows) => {
        for (const data of dataRows) {
          if (data.unique_clicks && data.unique_clicks > 0) {
            data.epc = data.total_revenue / data.unique_clicks; // EPC calculation
          } else {
            data.epc = 0; // If total_clicks is 0, set EPC to 0 to avoid division by zero
          }
        }
        return dataRows;
      };
      
      // Calculate EPC for each set of data
      const adsWithEpc = calculateEpc(adsWithRoasAndCount);
      const adsetsWithEpc = calculateEpc(adsetsWithRoasAndCount);
      const campaignsWithEpc = calculateEpc(campaignsWithRoasAndCount);
      const adAccountsWithEpc = calculateEpc(adaccounts.rows);


      const calculateProfit = (dataRows) => {
        for (const data of dataRows) {
          const revenueAfterCosts = data.total_revenue * 0.86;
          data.profit = revenueAfterCosts - data.total_cost - data.total_spend; // Apply profit calculation
        }
        return dataRows;
      };
      


      const adsWithProfit = calculateProfit(adsWithEpc);
      const adsetsWithProfit = calculateProfit(adsetsWithEpc);
      const campaignsWithProfit = calculateProfit(campaignsWithEpc);
      const adAccountsWithProfit = calculateProfit(adAccountsWithEpc);




      res.json({
        ads: adsWithProfit,
        campaigns: campaignsWithProfit,
        adsets: adsetsWithProfit,
        adaccounts: adAccountsWithProfit,
      });
  } catch (error) {
      console.error('Error fetching data:', error);
      res.status(500).send('Error fetching data');
  }
});


const LAST_PROCESSED_FILE = './last_processed.txt'; // or any path you prefer

  function saveLastProcessedId(lastId) {
    fs.writeFileSync(LAST_PROCESSED_FILE, lastId.toString());
}

function readLastProcessedId() {
  try {
      const lastId = fs.readFileSync(LAST_PROCESSED_FILE, 'utf8');
      return lastId ? parseInt(lastId, 10) : null;
  } catch (error) {
      // Handle error (e.g., file doesn't exist)
      return null; // or appropriate starting value
  }
}


async function fetchAllVariantIds() {
  const lastProcessedId = readLastProcessedId();
  try {
      let query = `
        SELECT
          shopify_order_id,
          jsonb_array_elements(line_items)->>'variant_id' AS variant_id,
          jsonb_array_elements(line_items)->>'product_id' AS product_id,
          jsonb_array_elements(line_items)->>'title' AS title
        FROM 
          shopify_orders
      `;
      if (lastProcessedId) {
        query += ` WHERE shopify_order_id > ${lastProcessedId}`;
    }
    query += ` ORDER BY shopify_order_id`;
    const res = await pool.query(query);
    return res.rows.map(row => ({ 
      orderId: row.shopify_order_id, // store order ID for later use
      variantId: row.variant_id, 
      productId: row.product_id,
      title: row.title
    }));
    } catch (error) {
    console.error('Error fetching variant IDs from database:', error);
    throw error;
  }
}



async function checkExistingVariantIds(variantIds) {
  const placeholders = variantIds.map((_, index) => `$${index + 1}`).join(', ');
  const query = `
    SELECT variant_id 
    FROM nooro_products 
    WHERE variant_id IN (${placeholders});
  `;
  const res = await pool.query(query, variantIds);
  const existingIds = new Set(res.rows.map(row => row.variant_id));
  return variantIds.filter(id => !existingIds.has(id));
}

async function fetchInventoryItemIds(variantProductPairs, processedVariants) {
  try {
      const inventoryItems = [];
      for (const pair of variantProductPairs) {
          // Skip if title is 'Tip' or variantId is null or already processed
          if (pair.title === 'Tip' || pair.variantId === null || processedVariants.has(pair.variantId)) {
              console.log(`Skipping variant with title 'Tip', null variantId, or already processed Variant ID: ${pair.variantId}.`);
              continue;
          }
  
          try {
              const variantResponse = await axios.get(`https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/variants/${pair.variantId}.json`, {
                  headers: {
                      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
                  },
              });
              inventoryItems.push({
                  variantId: pair.variantId,
                  productId: pair.productId,
                  title: pair.title,
                  inventoryItemId: variantResponse.data.variant.inventory_item_id
              });
          } catch (innerError) {
              console.error(`Error fetching inventory item ID for variant ${pair.variantId}:`, innerError);
          }
      }
      return inventoryItems;
  } catch (error) {
      console.error('Error in fetchInventoryItemIds:', error);
      throw error;
  }
}


  async function fetchInventoryItemDetails(inventoryItems) {
    const detailedInventory = [];
    for (const item of inventoryItems) {
      
      try {
        const inventoryItemResponse = await axios.get(`https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/inventory_items/${item.inventoryItemId}.json`, {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          },
        });
  
        const detail = inventoryItemResponse.data.inventory_item; // Corrected reference
  
        detailedInventory.push({
          variantId: item.variantId,
          productId: item.productId,
          title: item.title,
          inventoryItemId: item.inventoryItemId,
          inventorySku: detail.sku,
          createdAt: detail.created_at,
          updatedAt: detail.updated_at,
          requiresShipping: detail.requires_shipping,
          cost: detail.cost,
          countryCodeOfOrigin: detail.country_code_of_origin,
          provinceCodeOfOrigin: detail.province_code_of_origin,
          harmonizedSystemCode: detail.harmonized_system_code,
          tracked: detail.tracked,
          adminGraphqlApiId: detail.admin_graphql_api_id
        });
      } catch (error) {
        console.error(`Error fetching inventory item details for item ${item.inventoryItemId}:`, error);
        // Handle the error as per your policy (skip/continue/stop)
      }
    }
    return detailedInventory;
  }
  async function processBatch(variantIdBatch, processedVariants) {
    const variantIds = await checkExistingVariantIds(variantIdBatch);
    if (variantIds.length === 0) return;
  
    const inventoryItems = await fetchInventoryItemIds(variantIdBatch, processedVariants); // Pass processedVariants here
    const inventoryDetails = await fetchInventoryItemDetails(inventoryItems);
  
    for (const item of inventoryDetails) {
        if (processedVariants.has(item.variantId)) {
            console.log(`Skipping already processed Variant ID: ${item.variantId}`);
            continue; // Skip this variant if it was already processed
        }
      const upsertQuery = `
        INSERT INTO nooro_products (
          variant_id, product_id, title, inventory_item_id, 
          inventory_sku, created_at, updated_at, requires_shipping, 
          cost, country_code_of_origin, province_code_of_origin, 
          harmonized_system_code, tracked, admin_graphql_api_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT (inventory_item_id) DO UPDATE SET
          variant_id = EXCLUDED.variant_id,
          product_id = EXCLUDED.product_id,
          title = EXCLUDED.title,
          inventory_sku = EXCLUDED.inventory_sku,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          requires_shipping = EXCLUDED.requires_shipping,
          cost = EXCLUDED.cost,
          country_code_of_origin = EXCLUDED.country_code_of_origin,
          province_code_of_origin = EXCLUDED.province_code_of_origin,
          harmonized_system_code = EXCLUDED.harmonized_system_code,
          tracked = EXCLUDED.tracked,
          admin_graphql_api_id = EXCLUDED.admin_graphql_api_id
          RETURNING inventory_item_id, cost as new_cost, (SELECT cost FROM nooro_products WHERE inventory_item_id = $4) as old_cost;

      `;
      try {
        const result = await pool.query(upsertQuery, [
            item.variantId, item.productId, item.title, item.inventoryItemId,
            item.inventorySku, item.createdAt, item.updatedAt, item.requiresShipping,
            item.cost, item.countryCodeOfOrigin, item.provinceCodeOfOrigin,
            item.harmonizedSystemCode, item.tracked, item.adminGraphqlApiId
        ]);
    
        // Log the variant ID and its cost
        console.log(`Processed Variant ID: ${item.variantId}, Cost: ${item.cost}`);
        
        // Check result and log any changes in cost
        if(result && result.rows.length > 0) {
            const updatedItem = result.rows[0];
            if(updatedItem.new_cost !== updatedItem.old_cost) {
                console.log(`Updated cost for Variant ID: ${item.variantId}. Old Cost: ${updatedItem.old_cost}, New Cost: ${updatedItem.new_cost}`);
            }
        }
        // After processing, add variantId to the processedVariants set
        processedVariants.add(item.variantId);
    } catch (error) {
        console.error(`Error processing variant ${item.variantId}: ${error.message}`);
    }
}

console.log('Batch data saved or updated in the database');
}

async function newMaster() {
  try {
      const lastProcessedId = readLastProcessedId();
      const processedVariants = new Set(); // Initialize a set to track processed variant IDs
      
      console.log(`Starting from Shopify Order ID: ${lastProcessedId}`);

      let allVariants = await fetchAllVariantIds(); 
      let highestOrderId = lastProcessedId;
      let currentBatch = []; // Initialize the current batch

      while (allVariants.length > 0 || currentBatch.length > 0) {
          // Fill the current batch with unprocessed variants
          while (currentBatch.length < 50 && allVariants.length > 0) {
              let variant = allVariants.shift(); // Take one variant from the list
              if (!processedVariants.has(variant.variantId)) {
                  currentBatch.push(variant); // Add to current batch if not processed
              }
          }

          if (currentBatch.length > 0) {
              await processBatch(currentBatch, processedVariants); // Process the current batch

              // Update highest order ID if applicable
              const batchMaxOrderId = Math.max(...currentBatch.map(item => parseInt(item.orderId)));
              if (batchMaxOrderId > highestOrderId) {
                  highestOrderId = batchMaxOrderId;
              }

              console.log(`Processed a batch of ${currentBatch.length} items`);
              currentBatch = []; // Reset the current batch after processing
          } else {
              console.log("No more unprocessed variants in the batch to process.");
              break;
          }
      }
  
      if (highestOrderId && highestOrderId !== lastProcessedId) {
          saveLastProcessedId(highestOrderId);
      }
  
      console.log('All items processed');
  } catch (error) {
      console.error('Error in newMaster function:', error);
  }
}



function startInterval() {
  // Run the function immediately if you want or wait for first 12 hours tick
  newMaster();

  // Set the interval to run every 12 hours
  setInterval(() => {
      console.log('Starting newMaster function as per scheduled interval.');
      newMaster();
  }, 43200000); // 12 hours in milliseconds
}

// Start the interval
startInterval();






function getTodayDateRangePacific() {
  const start = moment().tz("America/Los_Angeles").startOf('day');
  const end = moment(start).add(1, 'day');
  return { startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD') };
}

function getYesterdayDateRangePacific() {
  const start = moment().tz("America/Los_Angeles").subtract(1, 'day').startOf('day');
  const end = moment(start).add(1, 'day');
  return { startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD') };
}

function getThisWeekDateRangePacific() {
  const start = moment().tz("America/Los_Angeles").startOf('week');
  const end = moment().tz("America/Los_Angeles").startOf('day').add(1, 'day');
  return { startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD') };
}





app.get('/api/facebook-shopify', async (req, res) => {
  try {
    const requestedDate = req.query.date; // Get the date from the query parameter
    if (!requestedDate) {
      return res.status(400).send('Date parameter is required');
    }

    // Convert the requested date to start and end timestamps
    const startDate = `${requestedDate}T00:00:00-08:00`;
    const endDate = `${requestedDate}T23:59:59-08:00`;

    // Query to fetch orders for the given date
    const query = `
      SELECT * FROM shopify_orders 
      WHERE created_at >= $1 AND created_at <= $2
    `;
    const values = [startDate, endDate];

    const result = await pool.query(query, values);
    const orders = result.rows;

    // Filter orders by 'utm_source' attribute equal to 'facebook'
    const facebookShopifyOrderCount = orders.filter(order =>
      order.note_attributes.some(attr => 
        attr.name === 'utm_source' && attr.value.toLowerCase() === 'facebook'
      )
    ).length; // Get the length of filtered orders

    // Return the count of Facebook orders
    res.json({ facebookShopifyOrderCount });
  } catch (error) {
    console.error('Error fetching the count of Facebook orders from Shopify:', error);
    res.status(500).send('Error fetching the count of Facebook orders from Shopify');
  }
});




// POST route to create a new user
app.post('/api/createusers', async (req, res) => {
  const { name, password, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      'INSERT INTO dashboard (name, password, role) VALUES ($1, $2, $3) RETURNING *',
      [name, hashedPassword, role]
    );
    res.json(newUser.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

app.post('/api/login', async (req, res) => {
  const { name, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM dashboard WHERE name = $1', [name]);
    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'User does not exist.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.rows[0].password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Create token payload (you can include anything you want here)
    const payload = {
      id: user.rows[0].id,
      name: user.rows[0].name,
      role: user.rows[0].role
    };

    // Sign token
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({ token });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

function authenticateToken(req, res, next) {
  // Gather the jwt access token from the request header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  if (token == null) return res.sendStatus(401); // if there isn't any token

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next(); // pass the execution off to whatever request the client intended
  });
}

function authenticateAdmin(req, res, next) {
  // This should come after the authenticateToken middleware
  if (req.user.role !== 'admin') {
    return res.sendStatus(403); // Forbidden
  }
  next();
}

app.use('/api/admin', authenticateToken, authenticateAdmin);


// PUT route to update an existing user
app.put('/api/users/:id', authenticateToken, authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, password, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const updateUser = await pool.query(
      'UPDATE dashboard SET name = $1, password = $2, role = $3 WHERE id = $4 RETURNING *',
      [name, hashedPassword, role, id]
    );
    res.json(updateUser.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

app.delete('/api/users/:id', authenticateToken, authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM dashboard WHERE id = $1', [id]);
    res.status(204).send(); // No Content
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

app.get('/api/users', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const allUsers = await pool.query('SELECT * FROM dashboard');
    res.json(allUsers.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
