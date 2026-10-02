export const navigate = (hash: string) => {
  window.location.hash = hash;
};

export const tripHref = (id: string) => `#/trip/${encodeURIComponent(id)}`;

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|hsl\(\d{1,3} \d{1,3}% \d{1,3}%\))$/i;

/** Colours end up in Leaflet HTML icons, so only allow the formats we generate ourselves. */
export const safeColor = (color: string) => (SAFE_COLOR.test(color) ? color : '#888888');

export const safeImageSrc = (src: string | undefined) =>
  src && /^data:image\/(jpeg|png|webp);base64,/.test(src) ? src : undefined;
