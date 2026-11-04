const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const { db, dbPath } = require('../db');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1200;
const MAX_INPUT_PIXELS = 16_000_000;
const PRODUCT_IMAGE_PUBLIC_PATH = '/api/products/images';
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const storedFilenamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;

function uploadDirectory() {
  return path.resolve(process.env.PRODUCT_UPLOAD_DIR || path.join(path.dirname(dbPath), 'uploads/products'));
}

function uploadError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 40 },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(extension)) {
      return callback(uploadError('Envie uma imagem JPG, PNG ou WebP de ate 2 MB.'));
    }
    return callback(null, true);
  }
});

function receiveProductImage(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (!error) {
      if (typeof req.body?.images === 'string') {
        try {
          req.body.images = JSON.parse(req.body.images);
        } catch {
          return next(uploadError('A lista de imagens enviada e invalida.'));
        }
      }
      for (const field of ['is_donation', 'visible_in_pos', 'active', 'published', 'remove_image']) {
        if (req.body?.[field] === undefined) continue;
        const value = String(req.body[field]).trim().toLowerCase();
        if (['true', '1', 'on', 'yes'].includes(value)) req.body[field] = true;
        else if (['false', '0', 'off', 'no'].includes(value)) req.body[field] = false;
        else return next(uploadError(`Valor booleano invalido no campo ${field}.`));
      }
      return next();
    }
    if (error.code === 'LIMIT_FILE_SIZE') return next(uploadError('A imagem deve ter no maximo 2 MB.'));
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(uploadError('Envie apenas uma imagem no campo image.'));
    }
    error.status = error.status || 400;
    return next(error);
  });
}

function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

function expectedType(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  if (file.mimetype === 'image/jpeg' && ['.jpg', '.jpeg'].includes(extension)) return 'jpeg';
  if (file.mimetype === 'image/png' && extension === '.png') return 'png';
  if (file.mimetype === 'image/webp' && extension === '.webp') return 'webp';
  return null;
}

async function storeProductImage(file, req) {
  if (!file) return null;

  const detectedType = detectImageType(file.buffer);
  if (!detectedType || detectedType !== expectedType(file)) {
    throw uploadError('O conteudo do arquivo nao corresponde a uma imagem JPG, PNG ou WebP valida.');
  }

  let normalized;
  try {
    const image = sharp(file.buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS });
    const metadata = await image.metadata();
    if (metadata.format !== detectedType) throw uploadError('O arquivo de imagem possui formato inconsistente.');
    normalized = await image
      .rotate()
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (error) {
    if (error.status === 400) throw error;
    throw uploadError('Nao foi possivel processar a imagem. Verifique se o arquivo nao esta corrompido.');
  }

  const directory = uploadDirectory();
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o755 });
  const filename = `${crypto.randomUUID()}.webp`;
  const target = path.join(directory, filename);
  await fs.promises.writeFile(target, normalized, { flag: 'wx', mode: 0o644 });
  try {
    db.prepare('INSERT INTO product_image_files (filename, content) VALUES (?, ?)').run(filename, normalized);
  } catch (error) {
    await fs.promises.unlink(target).catch(() => {});
    throw error;
  }
  return `${req.protocol}://${req.get('host')}${PRODUCT_IMAGE_PUBLIC_PATH}/${filename}`;
}

function managedFilename(imageUrl) {
  if (!imageUrl) return null;
  try {
    const parsed = new URL(imageUrl, 'http://local.invalid');
    if (!parsed.pathname.startsWith(`${PRODUCT_IMAGE_PUBLIC_PATH}/`)) return null;
    const filename = path.basename(parsed.pathname);
    return storedFilenamePattern.test(filename) ? filename : null;
  } catch {
    return null;
  }
}

function imageIsReferenced(filename) {
  const candidates = db.prepare(`
    SELECT image_url AS url FROM products WHERE image_url LIKE ?
    UNION ALL
    SELECT url FROM library_product_images WHERE url LIKE ?
  `).all(`%${filename}%`, `%${filename}%`);
  return candidates.some((candidate) => managedFilename(candidate.url) === filename);
}

async function removeStoredProductImage(imageUrl) {
  const filename = managedFilename(imageUrl);
  if (!filename) return false;
  try {
    if (imageIsReferenced(filename)) return false;
    await fs.promises.unlink(path.join(uploadDirectory(), filename)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    db.prepare('DELETE FROM product_image_files WHERE filename = ?').run(filename);
    return true;
  } catch (error) {
    console.error(`Falha ao limpar imagem de produto ${filename}: ${error.message}`);
    return false;
  }
}

async function serveProductImage(req, res, next) {
  const { filename } = req.params;
  if (!storedFilenamePattern.test(filename)) return res.status(404).end();
  res.set({
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff'
  });
  res.type('image/webp');
  const stored = db.prepare('SELECT content FROM product_image_files WHERE filename = ?').get(filename);
  if (!stored) return res.status(404).end();
  try {
    const file = await fs.promises.readFile(path.join(uploadDirectory(), filename));
    return res.send(file);
  } catch (error) {
    if (error.code !== 'ENOENT') return next(error);
    return res.send(stored.content);
  }
}

module.exports = {
  MAX_IMAGE_BYTES,
  receiveProductImage,
  removeStoredProductImage,
  serveProductImage,
  storeProductImage
};
