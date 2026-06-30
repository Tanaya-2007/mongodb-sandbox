const mongoose = require('mongoose');

const SandboxAssignmentSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: [true, 'Device ID is required'],
    unique: true,
    trim: true,
    index: true,
  },
  databaseName: {
    type: String,
    required: [true, 'Database name is required'],
    unique: true,
    trim: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('SandboxAssignment', SandboxAssignmentSchema);
