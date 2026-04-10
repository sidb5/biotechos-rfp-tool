'use client';

import { useState, useRef } from 'react';

interface Props {
  initialLogoUrl: string | null;
}

export default function LogoUpload({ initialLogoUrl }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [preview, setPreview] = useState<string | null>(initialLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    // Client-side pre-validation
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      setError('Invalid file type. Upload a PNG, JPG, or SVG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 2 MB.`);
      return;
    }

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);

    try {
      const form = new FormData();
      form.append('logo', file);
      const res = await fetch('/api/profile/logo', { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Upload failed.');
        setPreview(logoUrl); // revert preview
        return;
      }
      setLogoUrl(body.logo_url);
      setPreview(body.logo_url);
    } catch {
      setError('Upload failed. Please try again.');
      setPreview(logoUrl);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete() {
    if (!window.confirm('Remove your logo? This will also remove it from future exports.')) return;
    setDeleting(true);
    setError('');
    try {
      await fetch('/api/profile/logo', { method: 'DELETE' });
      setLogoUrl(null);
      setPreview(null);
    } catch {
      setError('Delete failed. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-4">
        {/* Preview box */}
        <div className="w-40 h-16 border border-gray-200 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
          {preview ? (
            <img
              src={preview}
              alt="Company logo"
              className="max-w-full max-h-full object-contain p-1"
            />
          ) : (
            <span className="text-xs text-gray-400 text-center px-2">No logo uploaded</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
            onChange={handleFileChange}
            className="hidden"
            id="logo-file-input"
          />
          <label
            htmlFor="logo-file-input"
            className={`inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {uploading ? (
              <>
                <svg className="animate-spin w-4 h-4 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Uploading…
              </>
            ) : logoUrl ? 'Replace logo' : 'Upload logo'}
          </label>
          {logoUrl && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-red-500 hover:text-red-700 font-medium text-left disabled:opacity-40"
            >
              {deleting ? 'Removing…' : 'Remove logo'}
            </button>
          )}
          <p className="text-xs text-gray-400">PNG, JPG or SVG · max 2 MB</p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {logoUrl && (
        <p className="text-xs text-green-600">
          ✓ Logo will appear on all exported PDF and Word proposals
        </p>
      )}
    </div>
  );
}
