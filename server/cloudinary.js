// Kullanici tarafindan yuklenen profil resmi/banner gorsellerini haricen
// (veritabanini sismeden) saklamak icin ince bir Cloudinary sarmalayicisi.
// CLOUDINARY_URL ortam degiskeni tanimliysa SDK kendini otomatik yapilandirir
// (cloudinary://<api_key>:<api_secret>@<cloud_name> bicimi).
const cloudinary = require('cloudinary').v2;

const configured = !!process.env.CLOUDINARY_URL;

async function uploadImage(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

async function deleteImage(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    // Eski gorseli silmek basarisiz olsa da kullanici akisini bozmamali -
    // yalnizca logluyoruz (hassas bir veri icermiyor).
    console.error('Cloudinary gorsel silinemedi:', err.message);
  }
}

module.exports = { configured, uploadImage, deleteImage };
