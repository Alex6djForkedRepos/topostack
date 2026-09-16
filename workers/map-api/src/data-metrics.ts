export interface DataMetrics { r2Reads: number; r2Writes: number }
/** Request-local counters retain the R2 binding's receiver for every method. */
export function measureBucket(bucket: R2Bucket, metrics: DataMetrics): R2Bucket {
  return new Proxy(bucket, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (property === "get" || property === "head" || property === "list") metrics.r2Reads += 1;
        if (property === "put" || property === "delete") metrics.r2Writes += 1;
        return Reflect.apply(value, target, args);
      };
    },
  });
}
