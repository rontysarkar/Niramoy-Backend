import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { IDoctorWithUser } from "./doctor.interface";
import { cloudinary } from "../../lib/cloudinary";

const applyAsDoctor = async (
  payload: any,
  resume: Express.Multer.File,
  additionalFiles: Express.Multer.File[],
) => {
//   const isExistsEmail = await prisma.user.findUnique({
//     where: {
//       email: payload?.user?.email,
//     },
//   });

//   if (isExistsEmail) {
//     throw new Error("This Email already Create an account");
//   }

  
  // 1. Helper function to handle stream uploads
  const uploadToCloudinary = (file: Express.Multer.File): Promise<UploadApiResponse> => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ resource_type: "auto" }, (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error("No result returned from Cloudinary"));
          resolve(result);
        })
        .end(file.buffer);
    });
  };

  // 2. Upload single resume file
  const cloudinaryResumeResult = await uploadToCloudinary(resume);

  // 3. Upload multiple additional files concurrently using Promise.all
  let uploadedAdditionalFiles: Array<{ url: string; publicId: string }> = [];
  
  if (additionalFiles && additionalFiles.length > 0) {
    const uploadPromises = additionalFiles.map((file) => uploadToCloudinary(file));
    const cloudinaryResults = await Promise.all(uploadPromises);
    
    uploadedAdditionalFiles = cloudinaryResults.map((result) => ({
      url: result.secure_url,
      publicId: result.public_id,
    }));
  }

  console.log({cloudinaryResumeResult,uploadedAdditionalFiles});


};

export const DoctorServices = {
  applyAsDoctor,
};
