const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function fetchOrdersWithoutLineItems() {
    const query = `SELECT shopify_order_id FROM shopify_orders WHERE line_items IS NULL OR line_items = '[]' LIMIT 50;`;
    const res = await pool.query(query);
    return res.rows.map(row => row.shopify_order_id);
}

async function fetchOrder(orderId) {
    const params = {
      status: 'any',
      fields: 'created_at,id,total_price,current_total_price,current_total_tax,total_tax,currency,order_number,refunds,note,note_attributes,tags,line_items'
    };

    try {
      const response = await axios.get(`https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/orders/${orderId}.json`, {
        params: params,
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      });
      return response.data.order; // Return the order data
    } catch (error) {
      console.error(`Error fetching order ${orderId}:`, error);
      return null; // Return null in case of error
    }
}

async function updateOrderLineItems(orderId, lineItems) {
    const updateQuery = `UPDATE shopify_orders SET line_items = $1 WHERE shopify_order_id = $2;`;
    await pool.query(updateQuery, [JSON.stringify(lineItems), orderId]);
}

async function updateOrdersWithLineItems() {
    let totalUpdated = 0;
    while (true) {
        const orderIds = await fetchOrdersWithoutLineItems();
        if (orderIds.length === 0) {
            console.log('No more orders to update.');
            break;
        }

        for (const orderId of orderIds) {
            const order = await fetchOrder(orderId);
            if (order) {
                await updateOrderLineItems(orderId, order.line_items);
                console.log(`Updated order ${orderId} with line items.`);
                totalUpdated++;
            }
        }

        console.log(`Batch updated. Total orders updated so far: ${totalUpdated}`);
    }
    console.log('All orders have been updated.');
}

updateOrdersWithLineItems();
