import Jimp from 'jimp';
import fs from 'fs';
import path, { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { PROTOCOL } from '../config/config.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const imageResize = async (request) => {
  try {
    const pathvalue = []; // Initialize pathvalue array

    const upsertFiles = request.files
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
    }
    const resizedImageUrls = [];
    for (const file of upsertFiles) {
      const image = await Jimp.read(file.path);
       // Resize and save the large image to the uploads directory
      const largeImagePath = { Path: path.resolve(uploadsDir, `large_${file.filename}`), file: `large_${file.filename}` };
      const largeUrl = `${PROTOCOL}://${request.headers.host}/large_${file.filename}`;
      await image.clone().writeAsync(largeImagePath.Path);
      resizedImageUrls.push({ Large: largeUrl });
      pathvalue.push({Large:largeImagePath});
      // console.log(pathvalue); 

      // Resize and save the medium image to the medium directory
      const mediumWidth = image.bitmap.width / 2; // Half of the original width
      const mediumImagePath = { Path: path.resolve(uploadsDir, `medium_${file.filename}`), file: `medium_${file.filename}` };
      const mediumUrl = `${PROTOCOL}://${request.headers.host}/medium_${file.filename}`;
      await image.clone().resize(mediumWidth, Jimp.AUTO).writeAsync(mediumImagePath.Path);
      resizedImageUrls.push({ Medium: mediumUrl });
      pathvalue.push({Medium:mediumImagePath}); 

   //small file Size logics  
      const smallWidth = 20;
      const smallImagePath = { Path: path.resolve(uploadsDir, `small_${file.filename}`), file: `small_${file.filename}` };
      const smallUrl = `${PROTOCOL}://${request.headers.host}/small_${file.filename}`;
      await image.clone().resize(smallWidth, Jimp.AUTO).writeAsync(smallImagePath.Path);
      resizedImageUrls.push({ Small: smallUrl });
      pathvalue.push({Small:smallImagePath}); 

    }

    const groupedUrls = resizedImageUrls.reduce((acc, obj) => {
      const key = Object.keys(obj)[0];
      const value = obj[key];
      if (acc[key]) {
        acc[key].push(value);
      } else {
        acc[key] = [value];
      }
      return acc;
    }, {});

    const groupedpath = pathvalue.reduce((acc, obj) => {
      const key = Object.keys(obj)[0];
      const value = obj[key];
      if (acc[key]) {
        acc[key].push(value);
      } else {
        acc[key] = [value];
      }
      return acc;
    }, {});
    return { url: groupedUrls, path: groupedpath }
  } catch (error) {
    return `${error.message} : Error in Resizing Images`
  }
}


export default imageResize
