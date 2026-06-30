const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const connUri = process.env.MANAGEMENT_DB_URI;
    if (!connUri) {
      console.error('Error: MANAGEMENT_DB_URI is not defined in environment variables.');
      process.exit(1);
    }

    const conn = await mongoose.connect(connUri);
    console.log(`MongoDB Connected to management DB: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
