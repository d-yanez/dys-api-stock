import mongoose from 'mongoose';

const stockItemSchema = new mongoose.Schema({
  sku:      { type: Number, required: true },
  title:    { type: String, required: true },
  stock:    { type: Number, required: true },
  location: { type: String, required: true },
  lastUpdate: { type: Date, default: Date.now }
}, { collection: 'stockItem' });

stockItemSchema.index({ sku: 1, location: 1 }, { unique: true });

export const StockItemModel = mongoose.model('StockItem', stockItemSchema);
