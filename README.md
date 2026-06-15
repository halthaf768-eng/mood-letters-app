# Her Mood Letters - Media Edition

A production-ready Node.js + Express app for private mood-based emotional gift pages. A recipient opens a private `/mood/:slug` link, chooses between Angry and Happy, reads a personalized letter, hears soft looping background music when available, then opens attached image, YouTube, video, audio, or link media.

## Features

- Express backend with plain HTML/CSS/JS frontend
- Supabase-backed `mood_letters` storage
- Protected admin page at `/admin?key=YOUR_ADMIN_KEY`
- Protected creation API using `?key=...` or `x-admin-key`
- Admin photo uploads to Supabase Storage bucket `mood-photos`
- Mood-based background music with mute control and smooth fade-in
- Mobile-first glassmorphism UI
- Render-ready with `process.env.PORT`
- `/ping` health endpoint

## Environment Variables

Copy `.env.example` to `.env` for local development, or set these in Render:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_KEY=change-this-admin-password
BASE_URL=https://your-render-app.onrender.com
HOST=127.0.0.1
```

`BASE_URL` is optional. If omitted, generated links use the current request host. `HOST` is useful for local development; omit it on Render unless you specifically need it.

## Supabase SQL

Run this in the Supabase SQL editor:

```sql
create extension if not exists pgcrypto;

create table if not exists mood_letters (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  recipient_name text,
  sender_name text,
  opening_message text,
  angry_letter text,
  happy_letter text,
  angry_button_text text,
  happy_button_text text,
  angry_media_url text,
  happy_media_url text,
  angry_music_url text,
  happy_music_url text,
  angry_media_type text,
  happy_media_type text,
  final_message text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists mood_letters_slug_idx on mood_letters (slug);
```

Create a public Supabase Storage bucket named:

```text
mood-photos
```

Uploaded letter images are stored in that bucket under `letters/`. The backend validates `.jpg`, `.jpeg`, `.png`, and `.webp` files up to 5MB before uploading.

Optional `updated_at` trigger:

```sql
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_mood_letters_updated_at on mood_letters;

create trigger set_mood_letters_updated_at
before update on mood_letters
for each row
execute function set_updated_at();
```

## Sample Demo Data

```sql
insert into mood_letters (
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
) values (
  'demo-love-note',
  'Aaliyah',
  'Sam',
  'I made this tiny corner of the internet for whatever mood found you today.',
  'If today felt heavy, breathe first. I am not here to argue with your feelings. I am here to sit beside them, hold your hand, and remind you that you are loved even on the sharp days.',
  'Your happy is my favorite weather. I hope this keeps that smile around a little longer.',
  'Open the soft thing',
  'Play the happy thing',
  'https://images.unsplash.com/photo-1518895949257-7621c3c786d7',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://example.com/soft-piano.mp3',
  'https://example.com/calm-lofi.mp3',
  'image',
  'youtube',
  'No matter which mood you chose, I am still choosing you.'
);
```

Open the demo at:

```text
/mood/demo-love-note
```

## Local Setup

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm start
```

Open:

```text
http://localhost:3000
http://localhost:3000/admin?key=YOUR_ADMIN_KEY
http://localhost:3000/ping
```

## API

Create a mood letter:

```bash
curl -X POST "http://localhost:3000/api/moods?key=YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_name": "Aaliyah",
    "sender_name": "Sam",
    "opening_message": "Someone made this just for you.",
    "angry_letter": "I am here, even when the day is loud.",
    "happy_letter": "Your joy looks beautiful on you.",
    "angry_button_text": "Open this",
    "happy_button_text": "Play this",
    "angry_media_url": "https://example.com/photo.jpg",
    "happy_media_url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "angry_music_url": "https://example.com/soft-piano.mp3",
    "happy_music_url": "https://example.com/calm-lofi.mp3",
    "angry_media_type": "image",
    "happy_media_type": "youtube",
    "final_message": "Always on your side."
  }'
```

Upload a letter photo:

```bash
curl -X POST "http://localhost:3000/api/upload-photo?key=YOUR_ADMIN_KEY" \
  -F "photo=@/path/to/photo.webp"
```

The response contains:

```json
{
  "url": "https://your-project.supabase.co/storage/v1/object/public/mood-photos/letters/example.webp",
  "path": "letters/example.webp"
}
```

Fetch a mood letter:

```bash
curl http://localhost:3000/api/moods/demo-love-note
```

## Render Deployment

1. Push this project to GitHub.
2. Create a new Render Web Service.
3. Set the environment to Node.
4. Use build command:

```bash
npm install
```

5. Use start command:

```bash
node server.mjs
```

6. Add environment variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_KEY
BASE_URL
```

7. Set Render health check path to:

```text
/ping
```

## Security Notes

- The Supabase service role key is used only in `server.mjs`.
- No frontend file imports or exposes Supabase credentials.
- `/admin` requires `ADMIN_KEY` in the URL query.
- `POST /api/moods` requires `ADMIN_KEY` in the query, `x-admin-key`, or `Authorization: Bearer ...`.

## Background Music

The public mood page supports optional mood-specific music through:

```text
angry_music_url
happy_music_url
```

Use quiet piano, lofi, or ambient audio files. The page does not autoplay with sound until a user interaction occurs, fades music in to a low volume, loops it, and lets the recipient mute or unmute from the floating top-right control.
