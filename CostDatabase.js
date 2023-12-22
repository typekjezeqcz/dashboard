const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

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

async function fetchAllOrders() {
  const query = 'SELECT * FROM shopify_orders;';
  const res = await pool.query(query);
  return res.rows;
}

async function updateOrderCost(order, costs) {
  let totalCost = 0;

  if (order.line_items && Array.isArray(order.line_items)) {
    console.log(`Processing order ID: ${order.shopify_order_id}`);
    for (const item of order.line_items) {
      const itemCost = costs[item.variant_id] || 0;
      const itemQuantity = item.quantity || 0;
      totalCost += itemCost * itemQuantity;

      // Log details of each line item
      console.log(`Variant ID: ${item.variant_id}, Cost: ${itemCost}, Quantity: ${itemQuantity}, Intermediate Total Cost: ${totalCost}`);
    }
  }

  const updateQuery = 'UPDATE shopify_orders SET total_cost = $1 WHERE shopify_order_id = $2;';
  await pool.query(updateQuery, [totalCost, order.shopify_order_id]);
  console.log(`Updated order ${order.shopify_order_id} with total cost: ${totalCost}`);
  return totalCost; // Return totalCost for logging
}


async function updateAllOrderCosts() {
  try {
    const orders = await fetchAllOrders();
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

updateAllOrderCosts();
