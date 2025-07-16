const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function importItems({
  sourceCompanyId,
  targetCompanyId,
  filePath,
  fieldMappings = { company: 'company' }
}) {
  const client = new MongoClient(process.env.MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME);
    
    // Read items data
    const itemsData = JSON.parse(fs.readFileSync(filePath));
    
    // Transform data
    const transformedItems = itemsData.map(item => ({
      ...item,
      [fieldMappings.company]: new ObjectId(targetCompanyId),
      createdAt: new Date(),
      updatedAt: new Date(),
      _id: new ObjectId() // Generate new ID to avoid conflicts
    }));

    // Insert items
    const result = await db.collection('items').insertMany(transformedItems);
    
    (`Successfully imported ${result.insertedCount} items`);
    return result.insertedCount;
  } finally {
    await client.close();
  }
}

// Example usage (adjust parameters as needed)
const params = {
  sourceCompanyId: '67e3f717dc47ec62af63daeb',      // Company ID from backup folder name
  targetCompanyId: '682e2819430b6e1a96d0fe81',        // New company's ID
  filePath: './backups/RIJAL DRUG HOUSE PVT. LTD._67e3f717dc47ec62af63daeb/items.json',
  fieldMappings: { company: 'company' }        // Adjust if your field name differs
};


// Example usage (adjust parameters as needed)
// const params = {
//   sourceCompanyId: 'ORIGINAL_COMPANY_ID',      // Company ID from backup folder name
//   targetCompanyId: 'TARGET_COMPANY_ID',        // New company's ID
//   filePath: './backups/OLD_COMPANY_FOLDER/items.json',
//   fieldMappings: { company: 'company' }        // Adjust if your field name differs
// };


importItems(params).catch(console.error);