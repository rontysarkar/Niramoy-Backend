import { v2 as Cloudinary, UploadApiResponse } from "cloudinary";
import config from "../config";

// Configure Cloudinary (use your own cloud_name, api_key, and api_secret)
Cloudinary.config({
  cloud_name: config.cloudinary_name,
  api_key: config.cloudinary_api_key,
  api_secret: config.cloudinary_api_secret,
});

export const cloudinary = Cloudinary;

export const uploadToCloudinary = (
  file: Express.Multer.File,
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ resource_type: "auto" }, (error, result) => {
        if (error) return reject(error);
        if (!result)
          return reject(new Error("No result returned from Cloudinary"));
        resolve(result);
      })
      .end(file.buffer);
  });
};
