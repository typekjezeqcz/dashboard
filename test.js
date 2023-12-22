const axios = require('axios');
require('dotenv').config();

async function fetchOrder(orderId) {
  const params = {
    status: 'any',
    fields: 'created_at,id,total_price,current_total_price,current_total_tax,total_tax,currency,order_number,refunds,note,note_attributes,tags,line_items'
  };

  try {
    const response = await axios.get(`https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/orders/5426173378746.json`, {
      params: params,
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      }
    });

    console.log('Order:', JSON.stringify(response.data.order, null, 2));
  } catch (error) {
    console.error('Error fetching order:', error);
  }
}

// Replace '450789469' with the actual order ID you want to fetch
fetchOrder('5426173378746');
