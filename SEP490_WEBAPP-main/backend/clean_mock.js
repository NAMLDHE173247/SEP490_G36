const mongoose = require('mongoose');
require('dotenv').config();

async function cleanMock() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sep_training');
    const db = mongoose.connection.db;
    const result = await db.collection('datasetversions').deleteMany({ versionName: { $regex: /^Version \d+$/ } });
    console.log(`Deleted ${result.deletedCount} mock dataset versions`);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

cleanMock();
