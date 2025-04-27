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
     * @param {{ sku: number, stock: number, location: string }} params
     */
    async upsertStock({ sku, stock, location }) {
      throw new Error('Método no implementado');
    }
  }
  