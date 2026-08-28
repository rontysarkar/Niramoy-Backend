import type { UploadApiResponse } from "cloudinary";

import { prisma } from "../../lib/prisma";
import { cloudinary, uploadToCloudinary } from "../../lib/cloudinary";

const profileImageUpdate = async (
  file: Express.Multer.File,
  userId: string,
) => {
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      imagePublicId: true,
      profileImage: true,
    },
  });

  const cloudinaryResult = await uploadToCloudinary(file);

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
