export default class StockRepository {
  /** @param {number} sku */
  async findBySku(sku) {
    throw new Error('Método no implementado');
  }

  /** @param {number[]} skus */
  async findBySkus(skus) {
    throw new Error('Método no implementado');
  }

  /**
   * @param {{ sku: number, stock: number, location: string, stockItemId?: string }} params
   */
  async upsertStock({ sku, stock, location, stockItemId }) {
    throw new Error('Método no implementado');
  }

  /**
   * Atomically applies, rejects, or records a no-op for an ordered stock event.
   * @param {{ source: string, eventKey: string, revision: number, payloadHash: string, sku: number, stock: number, location: string, stockItemId?: string }} params
   * @returns {Promise<{ response: object, shouldNotify: boolean }>}
   */
  async processStockUpdateEvent(params) {
    throw new Error('Método no implementado');
  }

  /**
   * @param {{ stockItemId: string, qty: number, now: Date }} params
   */
  async addStockByItemId({ stockItemId, qty, now }) {
    throw new Error('Método no implementado');
  }

  /**
   * @param {{ stockItemId: string, qty: number, now: Date }} params
   */
  async subStockByItemId({ stockItemId, qty, now }) {
    throw new Error('Método no implementado');
  }
}
