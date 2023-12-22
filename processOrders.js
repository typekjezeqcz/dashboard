require('dotenv').config();
const { Pool } = require('pg');
const axios = require('axios');
const fs = require('fs');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });

async function fetchAllVariantIds() {
    try {
        const query = `
          SELECT
            jsonb_array_elements(line_items)->>'variant_id' AS variant_id,
            jsonb_array_elements(line_items)->>'product_id' AS product_id,
            jsonb_array_elements(line_items)->>'title' AS title
          FROM 
            shopify_orders;
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
  async function processBatch(variantIdBatch) {
    const variantIds = await checkExistingVariantIds(variantIdBatch);
    if (variantIds.length === 0) return;
  
    const inventoryItems = await fetchInventoryItemIds(variantIds);
    const inventoryDetails = await fetchInventoryItemDetails(inventoryItems);
  
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
  
      // Log the variant ID and its cost
      console.log(`Variant ID: ${item.variantId}, Cost: ${item.cost}`);
    }
  
    console.log('Batch data saved or updated in the database');
  }
  

async function newMaster() {
  try {
    const allVariantIds = await fetchAllVariantIds();
    while (allVariantIds.length > 0) {
      const batch = allVariantIds.splice(0, 50); // Process in batches of 50
      await processBatch(batch);
      console.log(`Processed a batch of ${batch.length} variant IDs`);
    }
    console.log('All variant IDs processed');
  } catch (error) {
    console.error('Error in newMaster function:', error);
  }
}

newMaster();
