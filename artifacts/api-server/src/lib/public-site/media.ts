import { constants } from 'node:fs';
import { mkdir, open, realpath, rename, unlink, lstat } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { HttpError } from '../auth';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const KEY = /^[a-f0-9-]{36}\.(png|jpg)$/;
let directory: string | undefined;
let activeDecodes = 0;

export async function initializePublicMedia(): Promise<void> {
  const configured = process.env.BHRU_MEDIA_DIR;
  if (process.env.NODE_ENV === 'production') {
    if (!configured || !isAbsolute(configured)) throw new Error('Configure an absolute BHRU_MEDIA_DIR persistent mount before production startup.');
    const marker = await lstat(join(configured, '.bhru-persistent-media'));
    if (!marker.isFile() || marker.isSymbolicLink()) throw new Error('Persistent media mount confirmation is required.');
  } else {
    await mkdir(configured ? resolve(configured) : resolve(process.cwd(), '.local/bhru-public-media'), { recursive: true, mode: 0o700 });
  }
  directory = await realpath(configured ? resolve(configured) : resolve(process.cwd(), '.local/bhru-public-media'));
  // Fail before serving if the non-root runtime cannot write the directory.
  const probe = join(directory, `.write-check-${randomUUID()}`);
  const handle = await open(probe, 'wx', 0o600);
  await handle.close();
  await unlink(probe);
}

const assetPath = (key: string) => {
  if (!directory || !KEY.test(key)) throw new Error('MEDIA_UNAVAILABLE');
  return join(directory, key);
};

export function normalizeImage(bytes: Buffer, contentType: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Images must be no larger than 5 MB.');
  if (activeDecodes >= 2) throw new HttpError(429, 'Image processing is busy. Please try again.');
  activeDecodes++;
  try {
    let width: number, height: number, data: Buffer, output: Buffer, extension: 'png' | 'jpg';
    if (contentType === 'image/png' && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
      dimensions(width, height);
      let offset=8, complete=false;
      while (offset+12<=bytes.length) {
        const length=bytes.readUInt32BE(offset), type=bytes.toString('ascii',offset+4,offset+8);
        if (length>bytes.length-offset-12 || ['acTL','fcTL','fdAT'].includes(type)) throw new Error('Unexpected or animated PNG content');
        offset+=length+12;
        if (type==='IEND') { complete=length===0 && offset===bytes.length; break; }
      }
      if (!complete) throw new Error('Invalid PNG structure');
      if (!bytes.subarray(-8).equals(Buffer.from([73,69,78,68,174,66,96,130]))) throw new Error('Unexpected PNG trailing content');
      const decoded = PNG.sync.read(bytes, { checkCRC: true });
      data = decoded.data;
      const normalized = new PNG({ width, height });
      normalized.data = data;
      output = PNG.sync.write(normalized);
      extension = 'png';
    } else if (contentType === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 &&
        bytes[bytes.length-2] === 255 && bytes[bytes.length-1] === 217) {
      if (!completeJPEG(bytes)) throw new Error('Unexpected JPEG content');
      const decoded = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 8, maxMemoryUsageInMB: 128 });
      width = decoded.width; height = decoded.height;
      dimensions(width, height);
      output = jpeg.encode(decoded, 85).data;
      extension = 'jpg';
    } else throw new Error('Unsupported image');
    if (output.length > 8 * 1024 * 1024) throw new Error('Decoded image is too large');
    return { bytes: output, width, height, extension, contentType: extension === 'png' ? 'image/png' : 'image/jpeg' };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Upload a valid PNG or JPEG image, up to 4096px per side and 8 megapixels. SVG, animated and executable files are not accepted.');
  } finally { activeDecodes--; }
}
function dimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || width>4096 || height>4096 || width*height>8_000_000) throw new Error('Image dimensions');
}
function completeJPEG(bytes: Buffer) {
  let position=2;
  while (position<bytes.length) {
    if (bytes[position++]!==255) return false;
    while (bytes[position]===255) position++;
    const marker=bytes[position++];
    if (marker===217) return position===bytes.length;
    if (marker===undefined || marker===0 || marker===216) return false;
    if (marker===1 || marker>=208 && marker<=215) continue;
    if (position+2>bytes.length) return false;
    const size=bytes.readUInt16BE(position);
    if (size<2 || position+size>bytes.length) return false;
    position+=size;
    if (marker===218) {
      while (position<bytes.length) {
        if (bytes[position]!==255) { position++; continue; }
        const start=position++;
        while (bytes[position]===255) position++;
        if (bytes[position]===0 || (bytes[position]!>=208 && bytes[position]!<=215)) { position++; continue; }
        position=start;
        break;
      }
    }
  }
  return false;
}

export async function writeImage(key: string, bytes: Buffer) {
  const final = assetPath(key), temporary = `${final}.tmp-${randomUUID()}`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, final);
  } catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
}
export async function readImage(key: string) {
  const handle = await open(assetPath(key), constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return await handle.readFile(); } finally { await handle.close(); }
}
export async function removeImage(key: string) {
  await unlink(assetPath(key)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
export const publicImageUrl = (id: string, key: string) => `/api/public/media/${id}.${key.endsWith('.png') ? 'png' : 'jpg'}`;
const sign = (id: string, expiry: string) => createHmac('sha256', process.env.SESSION_SECRET!).update(`bhru-cms-image-preview:${id}:${expiry}`).digest('hex');
export function previewImageUrl(id: string, key: string) {
  const expiry = String(Math.floor(Date.now()/1000)+600);
  return `${publicImageUrl(id,key)}?preview=${expiry}.${sign(id,expiry)}`;
}
export function validPreviewToken(id: string, token: unknown) {
  if (typeof token !== 'string' || !/^\d{10}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expiry, supplied] = token.split('.');
  const now = Math.floor(Date.now()/1000);
  if (Number(expiry)<now || Number(expiry)>now+600) return false;
  return timingSafeEqual(Buffer.from(supplied!, 'hex'), Buffer.from(sign(id,expiry!), 'hex'));
}
