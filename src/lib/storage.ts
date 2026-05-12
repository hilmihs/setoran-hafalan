import { supabaseAdmin, AUDIO_BUCKET } from './supabase-admin';
import type { JenisRekaman } from '@/types/db';

export function audioObjectPath(args: {
  pesertaId: string;
  weekStart: string;
  jenis: JenisRekaman;
}): string {
  return `${args.pesertaId}/${args.weekStart}/${args.jenis}.webm`;
}

export async function uploadAudio(args: {
  pesertaId: string;
  weekStart: string;
  jenis: JenisRekaman;
  blob: Blob | Buffer;
  contentType?: string;
}): Promise<string> {
  const path = audioObjectPath(args);
  const { error } = await supabaseAdmin.storage
    .from(AUDIO_BUCKET)
    .upload(path, args.blob as Blob, {
      upsert: true,
      contentType: args.contentType ?? 'audio/webm',
    });
  if (error) throw error;
  return path;
}

export async function signedAudioUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function ensureAudioBucket(): Promise<void> {
  const { data, error } = await supabaseAdmin.storage.getBucket(AUDIO_BUCKET);
  if (data) return;
  if (error && !/not.found|does not exist/i.test(error.message)) throw error;
  const { error: createErr } = await supabaseAdmin.storage.createBucket(
    AUDIO_BUCKET,
    { public: false }
  );
  if (createErr) throw createErr;
}
