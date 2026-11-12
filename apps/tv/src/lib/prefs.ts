// Preferencias del dispositivo (se guardan en localStorage; en la app Android TV persisten).

export type SubtitleSize = 'small' | 'medium' | 'large';
export const SUBTITLE_SIZES: SubtitleSize[] = ['small', 'medium', 'large'];
export const SUBTITLE_SIZE_LABEL: Record<SubtitleSize, string> = {
  small: 'Pequeño',
  medium: 'Mediano',
  large: 'Grande',
};
/** Escala sobre el tamaño base: pequeño = el de siempre; grande moderado (+40 %). */
export const SUBTITLE_SCALE: Record<SubtitleSize, number> = { small: 1, medium: 1.2, large: 1.4 };

const KEY = 'shub.subtitleSize';

export function getSubtitleSize(): SubtitleSize {
  try {
    const v = localStorage.getItem(KEY) as SubtitleSize | null;
    if (v && SUBTITLE_SIZES.includes(v)) return v;
  } catch {
    /* sin almacenamiento */
  }
  return 'small';
}

export function setSubtitleSize(size: SubtitleSize) {
  try {
    localStorage.setItem(KEY, size);
  } catch {
    /* sin almacenamiento: dura lo que la sesión */
  }
}

/** Siguiente tamaño en el ciclo pequeño → mediano → grande → pequeño. */
export const nextSubtitleSize = (s: SubtitleSize) =>
  SUBTITLE_SIZES[(SUBTITLE_SIZES.indexOf(s) + 1) % SUBTITLE_SIZES.length];

export const subtitleScale = () => SUBTITLE_SCALE[getSubtitleSize()];
