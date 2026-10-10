import mongoose from 'mongoose';

const stockSourceCursorSchema = new mongoose.Schema({
  source: { type: String, required: true },
  sku: { type: Number, required: true },
  location: { type: String, required: true },
  revision: { type: Number, required: true },
  eventKey: { type: String, required: true },
  payloadHash: { type: String, required: true },
  response: { type: mongoose.Schema.Types.Mixed, required: true }
}, { collection: 'stockSourceCursor', timestamps: true });

stockSourceCursorSchema.index(
  { source: 1, sku: 1, location: 1 },
  { unique: true }
);

export const StockSourceCursorModel = mongoose.model('StockSourceCursor', stockSourceCursorSchema);
