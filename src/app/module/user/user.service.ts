import { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const profileImageUpdate = async (buffer: Buffer, userId: string) => {
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      imagePublicId: true,
      profileImage: true,
    },
  });

  const cloudinaryResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ resource_type: "auto" }, (error, result) => {
          if (error) {
            return reject(error);
          }
          if (!result) {
            return reject(new Error("No result returned from Cloudinary"));
          }
          resolve(result);
        })
        .end(buffer);
    },
  );

  const updateUser = await prisma.user.update({
    where: { id: userId },
    data: {
      profileImage: cloudinaryResult.secure_url,
      imagePublicId: cloudinaryResult.public_id,
    },
    omit: {
      password: true,
    },
  });

  if (currentUser?.imagePublicId && currentUser.profileImage) {
    await cloudinary.uploader.destroy(currentUser.imagePublicId);
  }

  return updateUser;
};

export const UserService = {
  profileImageUpdate,
};
