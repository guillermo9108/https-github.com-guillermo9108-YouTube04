export function getThumbnailUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  
  // Si no es una imagen local o ya es una miniatura, devolver tal cual
  // También evitamos procesar las miniaturas por defecto
  if (!url.includes('api/uploads/') || 
      url.includes('_thumb.') || 
      url.includes('default.jpg') || 
      url.includes('defaultaudio.jpg')) {
    return url;
  }

  // Intentar obtener la versión _thumb.jpg
  // Asumimos que todas las miniaturas se guardan como .jpg
  const lastDotIndex = url.lastIndexOf('.');
  if (lastDotIndex === -1) return url;

  return url.substring(0, lastDotIndex) + '_thumb.jpg';
}
