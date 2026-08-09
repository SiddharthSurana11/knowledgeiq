const { connectToDB } = require('./mongoClient.js');

async function seedCategories() {
  try {
    const db = await connectToDB();
    const categoriesCollection = db.collection('categories');

    const initialCategories = [
      {
        key: 'hr',
        name: 'HR',
        description: 'Human Resources documents',
      },
      {
        key: 'finance',
        name: 'Finance',
        description: 'Finance and Expense documents',
      },
      {
        key: 'it',
        name: 'IT',
        description: 'IT and Password Management documents',
      },
      {
        key: 'compliance',
        name: 'Compliance',
        description: 'Compliance and Data Retention documents',
      },
      {
        key: 'business_operations',
        name: 'Business Operations',
        description: 'Business Operations and Vendor SOPs',
      }
    ];

    for (const cat of initialCategories) {
      await categoriesCollection.updateOne(
        { key: cat.key },
        {
          $setOnInsert: { createdAt: new Date() },
          $set: {
            name: cat.name,
            description: cat.description,
          }
        },
        { upsert: true }
      );
    }
    console.log('✅ Categories collection seeded successfully.');
  } catch (error) {
    console.error('❌ Failed to seed categories:', error);
  }
}

module.exports = { seedCategories };
