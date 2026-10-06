import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, symlink, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

assert(process.env.NODE_ENV!=='production','Run this isolated storage test in Development only');
const require=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url));
const {build}=require('esbuild');
const root=await mkdtemp(join(tmpdir(),'bhru-media-store-test-'));
try {
  const file=join(root,'storage.mjs');
  await build({
    stdin:{contents:'export * from "./src/lib/public-site/media"; export {pool} from "@workspace/db";',resolveDir:new URL('../artifacts/api-server/',import.meta.url).pathname,loader:'ts'},
    outfile:file,platform:'node',bundle:true,format:'esm',logLevel:'silent',
    banner:{js:'import {createRequire} from "node:module"; const require=createRequire(import.meta.url);'},
  });
  const media=await import(pathToFileURL(file).href);
  process.env.NODE_ENV='production';
  delete process.env.BHRU_MEDIA_DIR;
  await assert.rejects(media.initializePublicMedia(),/absolute BHRU_MEDIA_DIR/);
  process.env.BHRU_MEDIA_DIR='relative/path';
  await assert.rejects(media.initializePublicMedia(),/absolute BHRU_MEDIA_DIR/);
  console.log('PASS 1: Production refuses missing/relative media configuration; no Development fallback');
  process.env.BHRU_MEDIA_DIR=root;
  await assert.rejects(media.initializePublicMedia(),{code:'ENOENT'});
  const marker=join(root,'.bhru-persistent-media');
  const outside=join(root,'not-a-marker');
  await writeFile(outside,'test');
  await symlink(outside,marker);
  await assert.rejects(media.initializePublicMedia(),/confirmation/);
  await unlink(marker);
  await writeFile(marker,'BHRU persistent media volume\n',{mode:0o600});
  await media.initializePublicMedia();
  console.log('PASS 2: Mount confirmation rejects missing/symlink markers; configured writable regular-marker directory initializes');
  const key=`${randomUUID()}.png`,bytes=Buffer.from('isolated test bytes');
  await media.writeImage(key,bytes);
  assert.deepEqual(await media.readImage(key),bytes);
  await assert.rejects(media.readImage('../../outside'),/MEDIA_UNAVAILABLE/);
  await media.removeImage(key);
  await symlink(outside,join(root,key));
  await assert.rejects(media.readImage(key),{code:'ELOOP'});
  await media.removeImage(key);
  console.log('PASS 3: Atomic write/read/remove works; traversal and leaf-symlink reads rejected');
  const url=media.previewImageUrl(key.slice(0,36),key);
  const token=new URL(url,'https://example.test').searchParams.get('preview');
  assert(media.validPreviewToken(key.slice(0,36),token));
  assert(!media.validPreviewToken(randomUUID(),token));
  assert(!media.validPreviewToken(key.slice(0,36),'0000000000.'+'0'.repeat(64)));
  console.log('PASS 4: Short-lived preview signatures are image-specific; forgery/expiry rejected');
  await media.pool.end();
} finally {await rm(root,{recursive:true,force:true});}
