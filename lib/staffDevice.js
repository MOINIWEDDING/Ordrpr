'use client';
// El aparato del local donde el equipo entra con su PIN: { token, name, branch }. El token lo da la base
// de datos cuando el dueño activa el aparato (se guarda cifrado allá; aquí queda en este navegador).
const KEY = 'rp-staff-device';

export function getStaffDevice() {
  try {
    const d = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    return d && typeof d.token === 'string' ? d : null;
  } catch (e) { return null; }
}

export function setStaffDevice(d) {
  try {
    if (d) window.localStorage.setItem(KEY, JSON.stringify(d));
    else window.localStorage.removeItem(KEY);
  } catch (e) { /* sin almacenamiento */ }
}

// A dónde va cada rol al entrar.
export const HOME_FOR_ROLE = { cajero: '/caja', camarero: '/camarero', cocina: '/cocina', comensal: '/ordenes', contador: '/contabilidad', staff: '/caja' };
