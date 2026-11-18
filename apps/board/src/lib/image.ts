import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE } from '@pann/shared'

export interface PreparedImage {
  blob: Blob
  mime: 'image/jpeg'
  width: number
  height: number
}

export class ImageError extends Error {
  constructor(readonly code: 'type' | 'unreadable' | 'too_large') {
    super(code)
  }
}

/**
 * Prepares an image for every network: at most MAX_IMAGE_SIDE pixels on its longest side
 * and MAX_IMAGE_BYTES (the lowest limit, Bluesky's), as JPEG. Transparent areas become
 * white. Done in the browser, so the original never leaves the person's computer.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) throw new ImageError('type')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ImageError('unreadable')
  }
  let scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  for (let round = 0; round < 6; round++) {
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new ImageError('unreadable')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    for (const quality of [0.9, 0.82, 0.74, 0.66]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      )
      if (blob && blob.size <= MAX_IMAGE_BYTES) {
        bitmap.close()
        return { blob, mime: 'image/jpeg', width, height }
      }
    }
    scale *= 0.8
  }
  bitmap.close()
  throw new ImageError('too_large')
}
