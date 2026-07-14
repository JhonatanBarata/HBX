// Infra compartilhada dos mapas HBX. O OpenFreeMap fornece o estilo vetorial
// usado pelo app de entregas e pelo painel operacional, sem chave ou API paga.
export const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export function isValidMapCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}
