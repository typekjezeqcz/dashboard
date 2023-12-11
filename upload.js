const fs = require('fs');
const pgp = require('pg-promise')();

// Database connection parameters
const dbConfig = {
  user: 'felixschon',
  password: 'AVNS_4lw6WYIN0XDurxxd1WF',
  host: 'localhost', // Change to your PostgreSQL host
  port: 5432,        // Change to your PostgreSQL port
  database: 'dashboard',
};

const db = pgp(dbConfig);

const jsonFileName = 'orders_2032-12-11.json';

fs.readFile(jsonFileName, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading ${jsonFileName}: ${err}`);
    return;
  }

  try {
    const orders = JSON.parse(data);

    // Loop through the orders and insert them into the database
    orders.forEach(async (order) => {
      try {
        await db.none(
          `INSERT INTO shopify_orders (
            shopify_order_id, created_at, total_price, current_total_price, 
            current_total_tax, total_tax, currency, order_number, 
            refunds, note, note_attributes, tags, status,
            utm_campaign, utm_content, utm_term
          ) VALUES ($1, $2::timestamp, $3::numeric, $4::numeric, $5::numeric, $6::numeric, $7, $8::bigint, $9::jsonb, $10, $11::jsonb, $12, $13, $14, $15, $16)
          ON CONFLICT (shopify_order_id) DO NOTHING;`,
          [
            order.id,
            order.created_at,
            parseFloat(order.total_price),
            parseFloat(order.current_total_price),
            parseFloat(order.current_total_tax),
            parseFloat(order.total_tax),
            order.currency,
            order.order_number,
            JSON.stringify(order.refunds),
            order.note,
            JSON.stringify(order.note_attributes),
            order.tags,
            order.status,
            order.note_attributes.find(attr => attr.name === 'utm_campaign')?.value || null,
            order.note_attributes.find(attr => attr.name === 'utm_content')?.value || null,
            order.note_attributes.find(attr => attr.name === 'utm_term')?.value || null,
          ]
        );
        console.log(`Order with ID ${order.id} inserted successfully.`);
      } catch (error) {
        console.error(`Error inserting order with ID ${order.id}: ${error}`);
      }
    });
  } catch (jsonError) {
    console.error(`Error parsing JSON data: ${jsonError}`);
  } finally {
    db.$pool.end();
  }
});
