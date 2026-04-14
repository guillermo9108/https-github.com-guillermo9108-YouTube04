// @ts-ignore
import jsmediatags from 'jsmediatags';

/**
 * Extrae la carátula de un audio con timeout de seguridad.
 */
const extractAudioCoverSafe = async (fileOrUrl: File | string): Promise<File | null> => {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 5000); 

        try {
            const reader = (jsmediatags as any).read || jsmediatags;
            reader(fileOrUrl, {
                onSuccess: (tag: any) => {
                    clearTimeout(timeout);
                    const picture = tag.tags.picture;
                    if (picture) {
                        const { data, format } = picture;
                        const byteArray = new Uint8Array(data);
                        const contentType = format || "image/jpeg";
                        const blob = new Blob([byteArray], { type: contentType });
                        resolve(new File([blob], `cover.jpg`, { type: contentType }));
                    } else {
                        resolve(null);
                    }
                },
                onError: () => {
                    clearTimeout(timeout);
                    resolve(null);
                }
            });
        } catch (e) {
            clearTimeout(timeout);
            resolve(null);
        }
    });
};

/**
 * Generador robusto de miniaturas y duración.
 * @param skipImage Si es true, para audios solo se extraerá la duración, ignorando la carátula.
 */
export const generateThumbnail = async (
    fileOrUrl: File | string, 
    forceAudio?: boolean,
    skipImage?: boolean
): Promise<{ thumbnail: File | null, duration: number }> => {
  const isFile = typeof fileOrUrl !== 'string';
  const mediaUrl = isFile ? URL.createObjectURL(fileOrUrl) : fileOrUrl as string;
  
  const isAudio = forceAudio ?? (isFile 
    ? (fileOrUrl as File).type.startsWith('audio') 
    : (
        mediaUrl.toLowerCase().includes('.mp3') || 
        mediaUrl.toLowerCase().includes('.m4a') || 
        mediaUrl.toLowerCase().includes('.aac')
      ));

  return new Promise(async (resolve) => {
      let isResolved = false;
      let extractedThumbnail: File | null = null;

      // Si es audio y pedimos omitir imagen, vamos por la vía rápida
      if (isAudio && skipImage) {
          const audio = new Audio();
          audio.preload = "metadata";
          audio.crossOrigin = "anonymous";
          
          const t = setTimeout(() => {
              if(!isResolved) {
                  isResolved = true;
                  if(isFile) URL.revokeObjectURL(mediaUrl);
                  resolve({ thumbnail: null, duration: 0 });
              }
          }, 8000);

          audio.onloadedmetadata = () => {
              if (isResolved) return;
              isResolved = true;
              clearTimeout(t);
              const dur = Math.floor(audio.duration) || 0;
              audio.src = "";
              audio.load();
              if(isFile) URL.revokeObjectURL(mediaUrl);
              resolve({ thumbnail: null, duration: dur });
          };

          audio.onerror = () => {
              if (isResolved) return;
              isResolved = true;
              clearTimeout(t);
              if(isFile) URL.revokeObjectURL(mediaUrl);
              resolve({ thumbnail: null, duration: 0 });
          };

          audio.src = mediaUrl;
          return;
      }

      // Proceso estándar (con soporte de imagen) para Videos o Upload manual
      const media = isAudio ? new Audio() : document.createElement('video');
      media.preload = "metadata"; 
      media.muted = true;
      media.crossOrigin = "anonymous";
      
      if (!isAudio) {
          (media as HTMLVideoElement).style.position = 'fixed';
          (media as HTMLVideoElement).style.top = '-9999px';
          (media as HTMLVideoElement).style.opacity = '0';
          document.body.appendChild(media);
      }

      const cleanup = () => {
          try {
              media.pause();
              media.src = "";
              media.load();
              if (!isAudio) (media as HTMLVideoElement).remove();
              if (isFile) URL.revokeObjectURL(mediaUrl);
          } catch(e) {}
      };

      const finish = (thumb: File | null, dur: number) => {
          if (isResolved) return;
          isResolved = true;
          clearTimeout(mainTimeout);
          cleanup();
          resolve({ thumbnail: thumb, duration: Math.floor(dur) || 0 });
      };

      const mainTimeout = setTimeout(() => {
          finish(extractedThumbnail, media.duration || 0);
      }, 15000);

      if (isAudio && !skipImage) {
          extractAudioCoverSafe(fileOrUrl).then(thumb => { extractedThumbnail = thumb; });
      }

      media.onloadedmetadata = () => {
          if (isResolved) return;
          const duration = media.duration;
          
          if (isAudio || (media instanceof HTMLVideoElement && media.videoWidth === 0)) {
              setTimeout(() => finish(extractedThumbnail, duration), isAudio ? 1200 : 500);
          } else if (media instanceof HTMLVideoElement) {
              media.currentTime = Math.min(2, duration / 2);
          }
      };

      media.onseeked = () => {
          if (isResolved || isAudio || !(media instanceof HTMLVideoElement) || media.videoWidth === 0) return;

          try {
              const canvas = document.createElement('canvas');
              const scale = Math.min(1, 640 / media.videoWidth);
              canvas.width = media.videoWidth * scale;
              canvas.height = media.videoHeight * scale;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                  ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
                  canvas.toBlob(blob => {
                      const file = blob ? new File([blob], "thumb.webp", { type: "image/webp" }) : null;
                      finish(file, media.duration || 0);
                  }, 'image/webp', 0.7);
              } else finish(null, media.duration || 0);
          } catch (e) { finish(null, media.duration || 0); }
      };

      media.onerror = () => {
          setTimeout(() => finish(extractedThumbnail, 0), 500);
      };

      media.src = mediaUrl;
  });
};