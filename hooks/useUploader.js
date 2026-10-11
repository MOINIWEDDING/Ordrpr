'use client';
import { useRef, useState, useCallback } from 'react';
import { uploadPhoto, isVideoFile, isVideoUrl } from '@/lib/upload';

// opts.kind: 'product' | 'site' | 'offer' (ver lib/upload.js para las reglas de cada uno).
export function useUploader(opts = {}) {
  const inputRef = useRef(null);
  const [url, setUrlState] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const setUrl = useCallback((u) => {
    setUrlState(u || '');
    setPreviewUrl(u || '');
    setPreviewIsVideo(isVideoUrl(u));
    setError('');
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const reset = useCallback(() => {
    setUrlState('');
    setPreviewUrl('');
    setPreviewIsVideo(false);
    setError('');
    setProgress(0);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError('');
    setUploading(true);
    // Se limpia la URL ya guardada de inmediato: mientras el archivo nuevo no
    // termine de subir, no debe quedar disponible ninguna URL "vieja" con la
    // que se pudiera guardar el formulario por error.
    setUrlState('');
    const localUrl = URL.createObjectURL(file);
    const videoFile = isVideoFile(file);
    setPreviewUrl(localUrl);
    setPreviewIsVideo(videoFile);
    setProgress(10);
    try {
      const publicUrl = await uploadPhoto(file, setProgress, opts);
      setUrlState(publicUrl);
      setPreviewUrl(publicUrl);
      setPreviewIsVideo(videoFile);
    } catch (err) {
      setError(err.message);
      setUrlState('');
      setPreviewUrl('');
      setPreviewIsVideo(false);
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 400);
    }
  }, [opts]);

  const onInputChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    handleFile(file);
  }, [handleFile]);

  return { inputRef, url, previewUrl, previewIsVideo, progress, uploading, error, setUrl, reset, onInputChange };
}
