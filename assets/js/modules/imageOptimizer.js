/**
 * ImageOptimizer - بهینه‌سازی تصاویر و تولید thumbnail
 * فشرده‌سازی، تغییر سایز و تبدیل فرمت تصاویر
 * @module ImageOptimizer
 */

const ImageOptimizer = {
  // تنظیمات
  maxWidth: 1920,           // حداکثر عرض تصویر اصلی
  maxHeight: 1080,          // حداکثر ارتفاع تصویر اصلی
  thumbnailSize: 400,       // سایز thumbnail
  quality: 0.85,            // کیفیت JPEG (0.7 - 0.95)
  thumbnailQuality: 0.8,    // کیفیت thumbnail
  maxFileSize: 5 * 1024 * 1024, // 5MB حداکثر حجم
  
  /**
   * Compress and resize image
   * @param {File|Blob} file - فایل تصویر ورودی
   * @param {Object} options - تنظیمات اختیاری
   * @returns {Promise<{blob: Blob, width: number, height: number}>}
   */
  async optimize(file, options = {}) {
    const {
      maxWidth = this.maxWidth,
      maxHeight = this.maxHeight,
      quality = this.quality,
      format = null // اگر null باشد، فرمت اصلی حفظ می‌شود
    } = options;

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        // محاسبه سایز جدید با حفظ نسبت
        let { width, height } = this.calculateDimensions(
          img.width, 
          img.height, 
          maxWidth, 
          maxHeight
        );
        
        // ایجاد canvas برای ریسایز
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // تعیین فرمت خروجی
        let outputFormat = format;
        if (!outputFormat) {
          outputFormat = file.type === 'image/svg+xml' ? 'image/png' : file.type;
        }
        
        // فشرده‌سازی و تبدیل
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({
                blob,
                width,
                height,
                originalSize: file.size,
                newSize: blob.size,
                compressionRatio: ((1 - blob.size / file.size) * 100).toFixed(2) + '%'
              });
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          outputFormat,
          quality
        );
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      
      img.src = url;
    });
  },

  /**
   * Generate thumbnail from image
   * @param {File|Blob} file - فایل تصویر ورودی
   * @param {number} size - سایز thumbnail (مربع)
   * @param {number} quality - کیفیت خروجی
   * @returns {Promise<{blob: Blob, width: number, height: number}>}
   */
  async generateThumbnail(file, size = this.thumbnailSize, quality = this.thumbnailQuality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        // محاسبه ابعاد برای برش مربعی
        const minDim = Math.min(img.width, img.height);
        const startX = (img.width - minDim) / 2;
        const startY = (img.height - minDim) / 2;
        
        // ایجاد canvas برای thumbnail
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        
        const ctx = canvas.getContext('2d');
        
        // برش و تغییر سایز همزمان
        ctx.drawImage(
          img,
          startX, startY, minDim, minDim, // منبع (مرکز تصویر)
          0, 0, size, size // مقصد (مربع کامل)
        );
        
        // تولید thumbnail
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({
                blob,
                width: size,
                height: size,
                originalSize: file.size,
                newSize: blob.size,
                compressionRatio: ((1 - blob.size / file.size) * 100).toFixed(2) + '%'
              });
            } else {
              reject(new Error('Failed to generate thumbnail'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      
      img.src = url;
    });
  },

  /**
   * Calculate dimensions while maintaining aspect ratio
   * @param {number} origWidth 
   * @param {number} origHeight 
   * @param {number} maxWidth 
   * @param {number} maxHeight 
   * @returns {{width: number, height: number}}
   */
  calculateDimensions(origWidth, origHeight, maxWidth, maxHeight) {
    let width = origWidth;
    let height = origHeight;
    
    // اگر تصویر بزرگتر از حداکثر است، تغییر سایز بده
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(
        maxWidth / width,
        maxHeight / height
      );
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    }
    
    return { width, height };
  },

  /**
   * Validate image file
   * @param {File} file 
   * @returns {boolean}
   */
  isValidImage(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    return validTypes.includes(file.type) && file.size <= this.maxFileSize;
  },

  /**
   * Convert image to different format
   * @param {File|Blob} file 
   * @param {string} targetFormat - 'image/jpeg', 'image/png', 'image/webp'
   * @param {number} quality 
   * @returns {Promise<Blob>}
   */
  async convertFormat(file, targetFormat, quality = this.quality) {
    const result = await this.optimize(file, {
      format: targetFormat,
      quality
    });
    return result.blob;
  },

  /**
   * Process image for upload (optimize + thumbnail)
   * @param {File} file 
   * @returns {Promise<{original: Blob, thumbnail: Blob, metadata: Object}>}
   */
  async processForUpload(file) {
    if (!this.isValidImage(file)) {
      throw new Error('Invalid image file');
    }

    // بهینه‌سازی تصویر اصلی
    const optimized = await this.optimize(file);
    
    // تولید thumbnail
    const thumbnail = await this.generateThumbnail(file);
    
    return {
      original: optimized.blob,
      thumbnail: thumbnail.blob,
      metadata: {
        originalName: file.name,
        mimeType: file.type,
        originalSize: file.size,
        optimizedSize: optimized.newSize,
        thumbnailSize: thumbnail.newSize,
        width: optimized.width,
        height: optimized.height,
        compressionRatio: optimized.compressionRatio
      }
    };
  },

  /**
   * Extract EXIF orientation (simplified version)
   * @param {ArrayBuffer} arrayBuffer 
   * @returns {number} orientation value (1-8)
   */
  getExifOrientation(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    
    // Check JPEG marker
    if (view.getUint16(0, false) !== 0xFFD8) {
      return 1; // No EXIF data
    }
    
    const length = view.byteLength;
    let offset = 2;
    
    while (offset < length) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      
      // SOS marker (Start Of Scan) - no more headers
      if (marker === 0xFFDA) break;
      
      // APP1 marker (EXIF)
      if (marker === 0xFFE1) {
        // Check EXIF header
        if (view.getUint32(offset += 2, false) !== 0x45786966) {
          return 1;
        }
        
        const tiffOffset = offset + 6;
        const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
        const getUint16Func = (o) => view.getUint16(o, littleEndian);
        const getUint32Func = (o) => view.getUint32(o, littleEndian);
        
        const firstIFDOffset = getUint32Func(tiffOffset + 4);
        if (firstIFDOffset < 0 || firstIFDOffset > length - tiffOffset) {
          return 1;
        }
        
        const entries = getUint16Func(tiffOffset + firstIFDOffset);
        for (let i = 0; i < entries; i++) {
          const entryOffset = tiffOffset + firstIFDOffset + 2 + (i * 12);
          const tag = getUint16Func(entryOffset);
          if (tag === 0x0112) { // Orientation tag
            return getUint16Func(entryOffset + 8);
          }
        }
      }
    }
    
    return 1; // Default orientation
  },

  /**
   * Apply EXIF orientation to canvas
   * @param {HTMLCanvasElement} canvas 
   * @param {number} orientation 
   * @returns {HTMLCanvasElement}
   */
  applyOrientation(canvas, orientation) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    if (orientation > 4) {
      canvas.width = height;
      canvas.height = width;
    }
    
    switch (orientation) {
      case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
      case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
      case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
      case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
      case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
      case 7: ctx.transform(0, -1, -1, 0, height, width); break;
      case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
    }
    
    return canvas;
  }
};

// Export for ES6 modules compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImageOptimizer;
}
