import { sb, BARRO_CONFIGURED } from './supabaseClient';

// ---------- reglas de tamaño por tipo de foto/video ----------
// "product": PNG cuadrado y sin fondo (para que floten parejo sobre la tarjeta).
// "site" / "offer": foto o video panorámico 16:9 (portada, azotea, banners de oferta…).
export const PRODUCT_PHOTO_MIN = 500;
export const PRODUCT_PHOTO_MAX = 3000;
const SQUARE_TOLERANCE = 0.08; // hasta 8% de diferencia entre ancho y alto

export const LANDSCAPE_RATIO = 16 / 9;
export const LANDSCAPE_MIN_W = 1280;
export const LANDSCAPE_MIN_H = 720;
export const LANDSCAPE_MAX_W = 3840;
export const LANDSCAPE_MAX_H = 2160;
const LANDSCAPE_TOLERANCE = 0.15; // hasta 15% de diferencia respecto a 16:9

export const MAX_IMAGE_MB = 5;
export const MAX_VIDEO_MB = 25;
export const MAX_VIDEO_SECONDS = 20;

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export function isVideoFile(file) {
  return file && VIDEO_TYPES.includes(file.type);
}
// Para saber si una URL ya guardada es un video (no tenemos el File original).
export function isVideoUrl(url) {
  return !!url && /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

// Carga una imagen y devuelve sus medidas + si tiene transparencia real
// (no solo que sea .png — comprueba que al menos un píxel muestreado sea transparente).
function analyzeImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      let transparent = true; // si el canvas se bloquea por CORS, no forzamos el rechazo
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, width, height).data;
        transparent = false;
        for (let i = 3; i < data.length; i += 4 * 37) {
          if (data[i] < 250) { transparent = true; break; }
        }
      } catch (e) { /* canvas bloqueado, se ignora */ }
      URL.revokeObjectURL(url);
      resolve({ width, height, transparent });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0, transparent: true }); };
    img.src = url;
  });
}

// Carga un video y devuelve sus medidas + duración.
function analyzeVideo(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const result = { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
      URL.revokeObjectURL(url);
      resolve(result);
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0, duration: 0 }); };
    video.src = url;
  });
}

function checkLandscapeDims(width, height) {
  if (width < LANDSCAPE_MIN_W || height < LANDSCAPE_MIN_H) {
    throw new Error(`Es muy pequeño (${width}×${height}px). Debe medir al menos ${LANDSCAPE_MIN_W}×${LANDSCAPE_MIN_H}px.`);
  }
  if (width > LANDSCAPE_MAX_W || height > LANDSCAPE_MAX_H) {
    throw new Error(`Es muy grande (${width}×${height}px). Usa como máximo ${LANDSCAPE_MAX_W}×${LANDSCAPE_MAX_H}px.`);
  }
  const ratio = width / height;
  if (ratio < LANDSCAPE_RATIO * (1 - LANDSCAPE_TOLERANCE) || ratio > LANDSCAPE_RATIO * (1 + LANDSCAPE_TOLERANCE)) {
    throw new Error(`Debe ser panorámico (proporción 16:9 aprox.). Esto mide ${width}×${height}px — recórtalo antes de subirlo.`);
  }
}

// Sube un archivo al bucket 'fotos' y devuelve su URL pública.
// onProgress recibe un número de 0 a 100 (aproximado).
// opts.kind: 'product' (PNG cuadrado sin fondo) | 'site' | 'offer' (foto o video 16:9).
export async function uploadPhoto(file, onProgress, opts = {}) {
  if (!BARRO_CONFIGURED) throw new Error('Conecta Supabase para poder subir fotos.');
  if (!file) throw new Error('No se seleccionó ningún archivo.');

  const kind = opts.kind || (opts.requireTransparent ? 'product' : 'site');
  const isVideo = isVideoFile(file);

  if (kind === 'product') {
    if (isVideo) throw new Error('Las fotos de producto no pueden ser video.');
    if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen.');
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`La foto pesa más de ${MAX_IMAGE_MB} MB. Usa una más liviana.`);
    if (file.type !== 'image/png') throw new Error('La foto del producto debe ser un PNG con el fondo ya quitado (sin fondo).');

    if (onProgress) onProgress(8);
    const { width, height, transparent } = await analyzeImage(file);
    if (width < PRODUCT_PHOTO_MIN || height < PRODUCT_PHOTO_MIN) {
      throw new Error(`La foto es muy pequeña (${width}×${height}px). Debe medir al menos ${PRODUCT_PHOTO_MIN}×${PRODUCT_PHOTO_MIN}px.`);
    }
    if (width > PRODUCT_PHOTO_MAX || height > PRODUCT_PHOTO_MAX) {
      throw new Error(`La foto es muy grande (${width}×${height}px). Usa una de máximo ${PRODUCT_PHOTO_MAX}×${PRODUCT_PHOTO_MAX}px.`);
    }
    const ratio = width / height;
    if (ratio < 1 - SQUARE_TOLERANCE || ratio > 1 + SQUARE_TOLERANCE) {
      throw new Error(`La foto debe ser cuadrada (ancho y alto casi iguales). Esta mide ${width}×${height}px — recórtala antes de subirla.`);
    }
    if (!transparent) {
      throw new Error('Esta imagen no tiene el fondo transparente. Quítale el fondo (por ejemplo en remove.bg) y vuelve a subirla.');
    }
  } else if (kind === 'logo') {
    // logo del negocio: cualquier proporción, PNG/JPG/WebP/SVG, liviano
    if (isVideo) throw new Error('El logo no puede ser un video.');
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error('El logo debe ser PNG, JPG, WebP o SVG.');
    if (file.size > 2 * 1024 * 1024) throw new Error('El logo pesa más de 2 MB. Usa una versión más liviana.');
    if (onProgress) onProgress(8);
  } else if (kind === 'avatar') {
    // foto de avatar: cuadrada, sin exigir fondo transparente (es una foto normal)
    if (isVideo) throw new Error('Un avatar no puede ser un video.');
    if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen.');
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`La foto pesa más de ${MAX_IMAGE_MB} MB. Usa una más liviana.`);

    if (onProgress) onProgress(8);
    const { width, height } = await analyzeImage(file);
    if (width < PRODUCT_PHOTO_MIN || height < PRODUCT_PHOTO_MIN) {
      throw new Error(`La foto es muy pequeña (${width}×${height}px). Debe medir al menos ${PRODUCT_PHOTO_MIN}×${PRODUCT_PHOTO_MIN}px.`);
    }
    if (width > PRODUCT_PHOTO_MAX || height > PRODUCT_PHOTO_MAX) {
      throw new Error(`La foto es muy grande (${width}×${height}px). Usa una de máximo ${PRODUCT_PHOTO_MAX}×${PRODUCT_PHOTO_MAX}px.`);
    }
    const avatarRatio = width / height;
    if (avatarRatio < 1 - SQUARE_TOLERANCE || avatarRatio > 1 + SQUARE_TOLERANCE) {
      throw new Error(`El avatar debe ser cuadrado (ancho y alto casi iguales). Esta mide ${width}×${height}px — recórtala antes de subirla.`);
    }
  } else {
    // 'site' u 'offer': foto o video panorámico 16:9
    if (!isVideo && !file.type.startsWith('image/')) {
      throw new Error('El archivo debe ser una imagen o un video (MP4 / WebM).');
    }
    if (isVideo) {
      if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`El video pesa más de ${MAX_VIDEO_MB} MB. Usa uno más liviano.`);
      if (onProgress) onProgress(8);
      const { width, height, duration } = await analyzeVideo(file);
      if (duration > MAX_VIDEO_SECONDS) {
        throw new Error(`El video dura ${Math.round(duration)}s. Debe durar ${MAX_VIDEO_SECONDS} segundos o menos.`);
      }
      checkLandscapeDims(width, height);
    } else {
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`La foto pesa más de ${MAX_IMAGE_MB} MB. Usa una más liviana.`);
      if (onProgress) onProgress(8);
      const { width, height } = await analyzeImage(file);
      checkLandscapeDims(width, height);
    }
  }

  if (onProgress) onProgress(15);
  const ext = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await sb.storage.from('fotos').upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type,
  });
  if (error) throw new Error('No se pudo subir el archivo: ' + error.message);

  if (onProgress) onProgress(85);
  const { data } = sb.storage.from('fotos').getPublicUrl(path);
  if (onProgress) onProgress(100);
  return data.publicUrl;
}
