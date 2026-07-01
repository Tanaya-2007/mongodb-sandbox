const mongoose = require('mongoose');

const SandboxAssignmentSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: [true, 'Device ID is required'],
    trim: true,
    index: true,
  },
  projectKey: {
    type: String,
    required: [true, 'Project Key is required'],
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

// Compound index to guarantee uniqueness of database assignments per device per project
SandboxAssignmentSchema.index({ deviceId: 1, projectKey: 1 }, { unique: true });


module.exports = mongoose.model('SandboxAssignment', SandboxAssignmentSchema);
