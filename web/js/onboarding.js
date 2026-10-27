export function showExperienceScreen(screen, screens) {
  const selected = screens[screen];
  if (!selected) throw new RangeError(`Unknown AI Buddy screen: ${screen}`);
  for (const panel of Object.values(screens)) panel.hidden = panel !== selected;
  selected.querySelector('input, button, h1')?.focus();
}

export function recordingFailureMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Microphone access was denied. Allow microphone access in browser settings, then retry.';
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') return 'No microphone was found. Connect a microphone and try again.';
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') return 'The microphone is busy or unavailable. Close other apps using it, then retry.';
  if (/supported browser|HTTPS or localhost/iu.test(error?.message || '')) return 'Voice recording needs a supported browser and a secure connection (HTTPS or localhost).';
  return error?.message || 'The sample could not be recorded. Please try again.';
}
