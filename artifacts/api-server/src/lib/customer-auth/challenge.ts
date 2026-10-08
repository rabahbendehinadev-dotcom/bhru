import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { PNG } from 'pngjs';
import type { Request, Response } from 'express';
import { pool } from '@workspace/db';
import { HttpError, rateLimit } from '../auth';
import type { CustomerDB } from './types';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const GLYPHS = [
  '01110/10001/00001/00010/00100/01000/11111','11110/00001/00001/01110/00001/00001/11110',
  '00010/00110/01010/10010/11111/00010/00010','11111/10000/10000/11110/00001/00001/11110',
  '01110/10000/10000/11110/10001/10001/01110','11111/00001/00010/00100/01000/01000/01000',
  '01110/10001/10001/01110/10001/10001/01110','01110/10001/10001/01111/00001/00001/01110',
  '01110/10001/10001/11111/10001/10001/10001','11110/10001/10001/11110/10001/10001/11110',
  '01111/10000/10000/10000/10000/10000/01111','11110/10001/10001/10001/10001/10001/11110',
  '11111/10000/10000/11110/10000/10000/11111','11111/10000/10000/11110/10000/10000/10000',
  '01111/10000/10000/10111/10001/10001/01111','10001/10001/10001/11111/10001/10001/10001',
  '00111/00010/00010/00010/10010/10010/01100','10001/10010/10100/11000/10100/10010/10001',
  '10000/10000/10000/10000/10000/10000/11111','10001/11011/10101/10101/10001/10001/10001',
  '10001/11001/11001/10101/10011/10011/10001','11110/10001/10001/11110/10000/10000/10000',
  '01110/10001/10001/10001/10101/10010/01101','11110/10001/10001/11110/10100/10010/10001',
  '01111/10000/10000/01110/00001/00001/11110','11111/00100/00100/00100/00100/00100/00100',
  '10001/10001/10001/10001/10001/10001/01110','10001/10001/10001/10001/01010/01010/00100',
  '10001/10001/10001/10101/10101/11011/10001','10001/10001/01010/00100/01010/10001/10001',
  '10001/10001/01010/00100/00100/00100/00100','11111/00001/00010/00100/01000/10000/11111',
];
function hash(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Registration challenge signing is not configured.');
  return createHmac('sha256', secret).update(`public-registration:${value}`).digest('hex');
}
const cookieName = (slug: string) => `bhru_registration_${slug}`;
function binding(req: Request, slug: string) {
  const key = `${cookieName(slug)}=`;
  const value = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(key))?.slice(key.length);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
export function challengeImage(answer: string): string {
  const image = new PNG({ width: 250, height: 74 });
  const dot = (x: number, y: number, color: number[]) => {
    if (x < 0 || x >= image.width || y < 0 || y >= image.height) return;
    const i = (Math.floor(y) * image.width + Math.floor(x)) * 4;
    image.data[i] = color[0]!; image.data[i+1] = color[1]!; image.data[i+2] = color[2]!; image.data[i+3] = 255;
  };
  for (let y=0;y<image.height;y++) for(let x=0;x<image.width;x++) dot(x,y,[246,248,250]);
  for(let i=0;i<1200;i++) dot(randomInt(image.width),randomInt(image.height),[160,176,191]);
  [...answer].forEach((letter,i) => {
    const glyph = GLYPHS[ALPHABET.indexOf(letter)]!.split('/');
    const ox = 14 + i * 38 + randomInt(4), oy = 16 + randomInt(10), slope = randomInt(5)-2;
    glyph.forEach((row,y) => [...row].forEach((bit,x) => {
      if(bit==='1') for(let dy=0;dy<4;dy++) for(let dx=0;dx<4;dx++) dot(ox+x*4+dx+Math.round(y*slope/5),oy+y*4+dy,[25,53+i*6,77]);
    }));
  });
  return `data:image/png;base64,${PNG.sync.write(image).toString('base64')}`;
}
export async function issueRegistrationChallenge(req: Request, res: Response, db: CustomerDB = pool) {
  const tenant = req.customerPublic?.tenant;
  if (!tenant) throw new HttpError(404, 'Public website not found.');
  await rateLimit(`public-customer:challenge:${req.ip}`, 60);
  await rateLimit(`public-customer:challenge:${tenant.id}:${req.ip}`, 30);
  const browser = binding(req, tenant.slug) ?? randomBytes(32).toString('hex');
  const id = randomUUID(), answer = Array.from({length:6}, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  const expiresAt = new Date(Date.now()+10*60*1000);
  await db.query('DELETE FROM public_customer_registration_challenges WHERE subscriber_id=$1 AND expires_at<=now()', [tenant.id]);
  // Keep one outstanding challenge per browser and tenant.
  await db.query('DELETE FROM public_customer_registration_challenges WHERE subscriber_id=$1 AND binding_hash=$2', [tenant.id,hash(`${tenant.id}:${browser}`)]);
  await db.query(`INSERT INTO public_customer_registration_challenges(id,subscriber_id,binding_hash,answer_hash,expires_at)
    VALUES($1,$2,$3,$4,$5)`,[id,tenant.id,hash(`${tenant.id}:${browser}`),hash(`${tenant.id}:${id}:${answer}`),expiresAt]);
  res.cookie(cookieName(tenant.slug), browser, { httpOnly:true, secure:process.env.NODE_ENV==='production'||req.secure, sameSite:'lax', path:'/',maxAge:10*60*1000 });
  return { id, image:challengeImage(answer), expiresAt:expiresAt.toISOString() };
}
export async function consumeRegistrationChallenge(req: Request, id: string, answer: string, db: CustomerDB = pool) {
  const tenant = req.customerPublic!.tenant, browser = binding(req, tenant.slug);
  if (!browser) throw new HttpError(400, 'Verification failed. Request a new challenge.');
  // DELETE ... RETURNING is atomic across workers; every attempt consumes its challenge,
  // including wrong answers. Stored hashes never reveal the solution.
  const row = (await db.query(`DELETE FROM public_customer_registration_challenges
    WHERE id=$1 AND subscriber_id=$2 AND binding_hash=$3 RETURNING answer_hash,expires_at`,
    [id,tenant.id,hash(`${tenant.id}:${browser}`)])).rows[0];
  const expected = hash(`${tenant.id}:${id}:${answer.trim().toUpperCase()}`);
  if (!row || new Date(row.expires_at).getTime() <= Date.now() ||
      !timingSafeEqual(Buffer.from(row.answer_hash,'hex'),Buffer.from(expected,'hex'))) {
    throw new HttpError(400,'Verification failed or expired. Request a new challenge.');
  }
}
