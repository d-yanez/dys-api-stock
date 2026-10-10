import mongoose from 'mongoose';

const stockUpdateEventSchema = new mongoose.Schema({
  source: { type: String, required: true },
  eventKey: { type: String, required: true },
  revision: { type: Number, required: true },
  sku: { type: Number, required: true },
  location: { type: String, required: true },
  payloadHash: { type: String, required: true },
  response: { type: mongoose.Schema.Types.Mixed, required: true }
}, { collection: 'stockUpdateEvent', timestamps: true });

stockUpdateEventSchema.index({ source: 1, eventKey: 1 }, { unique: true });

export const StockUpdateEventModel = mongoose.model('StockUpdateEvent', stockUpdateEventSchema);
