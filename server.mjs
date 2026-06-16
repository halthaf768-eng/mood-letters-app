import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const TABLE_NAME = 'mood_letters';
const PHOTO_BUCKET = 'mood-photos';
const MUSIC_BUCKET = 'mood-music';
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const MAX_MUSIC_SIZE = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_MUSIC_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a']);
const ALLOWED_MUSIC_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_SIZE,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_PHOTO_TYPES.has(file.mimetype) || !ALLOWED_PHOTO_EXTENSIONS.has(extension)) {
      return callback(new Error('Only .jpg, .jpeg, .png, and .webp images are allowed.'));
    }

    return callback(null, true);
  }
});

const musicUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_MUSIC_SIZE,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_MUSIC_TYPES.has(file.mimetype) || !ALLOWED_MUSIC_EXTENSIONS.has(extension)) {
      return callback(new Error('Only .mp3, .wav, .ogg, and .m4a audio files are allowed.'));
    }

    return callback(null, true);
  }
});

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

function getConfigError() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (!missing.length) return null;
  return {
    error: 'Server is missing required Supabase environment variables.',
    missing
  };
}

function getSupabase() {
  const configError = getConfigError();
  if (configError) return { error: configError };

  return {
    client: createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    )
  };
}

function hasAdminAccess(req) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return false;

  const suppliedKey = req.query.key || req.get('x-admin-key') || req.get('authorization')?.replace(/^Bearer\s+/i, '');
  return suppliedKey === adminKey;
}

function requireAdmin(req, res, next) {
  if (hasAdminAccess(req)) return next();
  return res.status(401).json({
    error: 'Unauthorized. Provide the ADMIN_KEY as ?key=... or x-admin-key header.'
  });
}

function createSlug() {
  return crypto.randomBytes(6).toString('base64url').toLowerCase();
}

function absolutePublicLink(req, slug) {
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${baseUrl.replace(/\/$/, '')}/mood/${slug}`;
}

function cleanMoodPayload(body) {
  const allowedMediaTypes = new Set(['image', 'audio', 'youtube', 'video', 'link']);
  const textFields = [
    'recipient_name',
    'sender_name',
    'opening_message',
    'angry_letter',
    'happy_letter',
    'angry_button_text',
    'happy_button_text',
    'angry_media_url',
    'happy_media_url',
    'angry_music_url',
    'happy_music_url',
    'final_message'
  ];

  const payload = {};
  for (const field of textFields) {
    payload[field] = typeof body[field] === 'string' ? body[field].trim() : '';
  }

  payload.angry_media_type = allowedMediaTypes.has(body.angry_media_type) ? body.angry_media_type : 'link';
  payload.happy_media_type = allowedMediaTypes.has(body.happy_media_type) ? body.happy_media_type : 'link';

  return payload;
}

async function getPublicBucketSetupError(client, bucketName, purpose) {
  const { data, error } = await client.storage.getBucket(bucketName);

  if (error) {
    return {
      error: 'Supabase Storage setup error.',
      details: `Could not access the "${bucketName}" bucket from this server. Confirm Render uses the same SUPABASE_URL project where the bucket exists, and that SUPABASE_SERVICE_ROLE_KEY is the service role key for that project. Supabase said: ${error.message}`
    };
  }

  if (!data?.public) {
    return {
      error: 'Supabase Storage setup error.',
      details: `Make the "${bucketName}" bucket public so mood letter ${purpose} can display on public pages.`
    };
  }

  return null;
}

app.get('/ping', (_req, res) => {
  res.json({ ok: true });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/admin', '/admin.html'], (req, res) => {
  if (!hasAdminAccess(req)) {
    return res.status(401).sendFile(path.join(__dirname, 'public', 'admin-locked.html'));
  }

  return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/mood/:slug', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mood.html'));
});

app.post('/api/moods', requireAdmin, async (req, res) => {
  const { client, error: configError } = getSupabase();
  if (configError) return res.status(500).json(configError);

  const payload = cleanMoodPayload(req.body);
  if (!payload.recipient_name || !payload.opening_message) {
    return res.status(400).json({
      error: 'Recipient name and opening message are required.'
    });
  }

  let data = null;
  let error = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = createSlug();
    const insertPayload = {
      ...payload,
      slug,
      updated_at: new Date().toISOString()
    };

    const result = await client
      .from(TABLE_NAME)
      .insert(insertPayload)
      .select('slug')
      .single();

    data = result.data;
    error = result.error;
    if (!error || error.code !== '23505') break;
  }

  if (error) {
    return res.status(500).json({
      error: 'Failed to create mood letter.',
      details: error.message,
      code: error.code
    });
  }

  return res.status(201).json({
    slug: data.slug,
    link: absolutePublicLink(req, data.slug)
  });
});

app.post('/api/upload-photo', requireAdmin, (req, res) => {
  upload.single('photo')(req, res, async (uploadError) => {
    if (uploadError) {
      const isSizeError = uploadError.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        error: isSizeError ? 'Image must be 5MB or smaller.' : uploadError.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No image file was uploaded.'
      });
    }

    const { client, error: configError } = getSupabase();
    if (configError) return res.status(500).json(configError);

    const bucketSetupError = await getPublicBucketSetupError(client, PHOTO_BUCKET, 'images');
    if (bucketSetupError) return res.status(500).json(bucketSetupError);

    const extension = path.extname(req.file.originalname || '').toLowerCase();
    const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;
    const storagePath = `letters/${fileName}`;

    const { error } = await client.storage
      .from(PHOTO_BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: '31536000',
        upsert: false
      });

    if (error) {
      return res.status(500).json({
        error: 'Failed to upload image to Supabase Storage.',
        details: error.message
      });
    }

    const { data } = client.storage
      .from(PHOTO_BUCKET)
      .getPublicUrl(storagePath);

    return res.status(201).json({
      url: data.publicUrl,
      path: storagePath
    });
  });
});

app.post('/api/upload-music', requireAdmin, (req, res) => {
  musicUpload.single('music')(req, res, async (uploadError) => {
    if (uploadError) {
      const isSizeError = uploadError.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        error: isSizeError ? 'Music must be 10MB or smaller.' : uploadError.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No music file was uploaded.'
      });
    }

    const { client, error: configError } = getSupabase();
    if (configError) return res.status(500).json(configError);

    const bucketSetupError = await getPublicBucketSetupError(client, MUSIC_BUCKET, 'music');
    if (bucketSetupError) return res.status(500).json(bucketSetupError);

    const extension = path.extname(req.file.originalname || '').toLowerCase();
    const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;
    const storagePath = `letters/${fileName}`;

    const { error } = await client.storage
      .from(MUSIC_BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: '31536000',
        upsert: false
      });

    if (error) {
      return res.status(500).json({
        error: 'Failed to upload music to Supabase Storage.',
        details: error.message
      });
    }

    const { data } = client.storage
      .from(MUSIC_BUCKET)
      .getPublicUrl(storagePath);

    return res.status(201).json({
      url: data.publicUrl,
      path: storagePath
    });
  });
});

app.get('/api/moods/:slug', async (req, res) => {
  const { client, error: configError } = getSupabase();
  if (configError) return res.status(500).json(configError);

  const { data, error } = await client
    .from(TABLE_NAME)
    .select(`
      slug,
      recipient_name,
      sender_name,
      opening_message,
      angry_letter,
      happy_letter,
      angry_button_text,
      happy_button_text,
      angry_media_url,
      happy_media_url,
      angry_music_url,
      happy_music_url,
      angry_media_type,
      happy_media_type,
      final_message
    `)
    .eq('slug', req.params.slug)
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return res.status(status).json({
      error: status === 404 ? 'Mood letter not found.' : 'Failed to fetch mood letter.',
      details: error.message
    });
  }

  return res.json({ mood: data });
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Her Mood Letters is running on ${HOST}:${PORT}`);
});
