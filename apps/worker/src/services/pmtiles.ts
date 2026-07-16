import { PMTiles, ResolvedValueCache, type RangeResponse, type Source } from 'pmtiles';

class R2PmtilesSource implements Source {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly key: string,
  ) {}

  getKey() {
    return `r2://${this.key}`;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const object = await this.bucket.get(this.key, { range: { offset, length } });
    if (!object?.body) throw new Error(`PMTiles archive range is unavailable: ${this.key}`);
    const cacheControl = object.httpMetadata?.cacheControl;
    const expires = object.httpMetadata?.cacheExpiry?.toUTCString();
    return {
      data: await object.arrayBuffer(),
      ...(object.httpEtag ? { etag: object.httpEtag } : {}),
      ...(cacheControl ? { cacheControl } : {}),
      ...(expires ? { expires } : {}),
    };
  }
}

export async function readPmtilesVectorTile(
  bucket: R2Bucket,
  key: string,
  z: number,
  x: number,
  y: number,
) {
  const archive = new PMTiles(
    new R2PmtilesSource(bucket, key),
    new ResolvedValueCache(),
  );
  return archive.getZxy(z, x, y);
}
