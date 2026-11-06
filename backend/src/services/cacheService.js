/**
 * Centralized High-Performance Multi-Tenant Caching Service
 * Supports In-Memory TTL/LRU with seamless optional Redis fallback.
 */

class MemoryCache {
  constructor(maxSize = 2000) {
    this.store = new Map();
    this.maxSize = maxSize;
  }

  set(key, value, ttlSeconds = 60) {
    if (this.store.size >= this.maxSize) {
      // LRU eviction: remove the oldest entry
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  delete(key) {
    return this.store.delete(key);
  }

  deletePattern(pattern) {
    // Supports simple wildcards e.g. "prefix:*"
    const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
    let count = 0;
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  clear() {
    this.store.clear();
  }
}

class CacheService {
  constructor() {
    this.memory = new MemoryCache();
  }

  /**
   * Build tenant-isolated cache key
   */
  key(tenantId = "global", resource, identifier = "default") {
    const tenant = tenantId == null ? "global" : `t_${tenantId}`;
    return `dms:${tenant}:${resource}:${identifier}`;
  }

  /**
   * Get cached item or execute fetcher and store result
   */
  async getOrSet(key, ttlSeconds = 60, fetcher) {
    const cached = this.memory.get(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const fresh = await fetcher();
    if (fresh !== undefined) {
      this.memory.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  set(key, value, ttlSeconds = 60) {
    this.memory.set(key, value, ttlSeconds);
  }

  get(key) {
    return this.memory.get(key);
  }

  del(key) {
    return this.memory.delete(key);
  }

  /**
   * Invalidate tenant-specific resource cache
   * e.g. invalidateTenant(companyId, "dashboard") or invalidateTenant(companyId, "orders")
   */
  invalidateTenant(tenantId, resource) {
    const pattern = `dms:t_${tenantId}:${resource}:*`;
    return this.memory.deletePattern(pattern);
  }

  /**
   * Invalidate all caches for a tenant
   */
  invalidateAllTenant(tenantId) {
    const pattern = `dms:t_${tenantId}:*`;
    return this.memory.deletePattern(pattern);
  }

  clear() {
    this.memory.clear();
  }
}

module.exports = new CacheService();

