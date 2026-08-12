import bcrypt from "bcryptjs";
import { JwtPayload, SignOptions } from "jsonwebtoken";
import {
  AuthProvider,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import {
  googleLoginPayload,
  ILoginUserPayload,
  IRegisterPatientPayload,
  IRequestUser,
} from "./auth.interface";
import { googleClient } from "../../lib/google-auth";

const registerPatient = async (payload: IRegisterPatientPayload) => {
  const { name, password } = payload;
  const email = payload.email.trim().toLowerCase();

  const isUserExists = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExists) {
    throw new Error("User with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 8);

  const createdUser = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: Role.PATIENT,
      status: UserStatus.ACTIVE,
      emailVerified: false,
      patient: {
        create: { name, email },
      },
    },
    omit: { password: true },
    include: { patient: true },
  });

  const { patient, ...user } = createdUser;
  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    user,
    patient,
    accessToken,
    refreshToken,
  };
};

const loginUser = async (payload: ILoginUserPayload) => {
  const { password } = payload;
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User is blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new Error("User is deleted");
  }

  if (user.password === null && user.googleId !== null) {
    throw new Error(
      "User has an Account with Google , Please try to google login",
    );
  }

  const isPasswordMatched = await bcrypt.compare(
    password,
    user.password as string,
  );

  if (!isPasswordMatched) {
    throw new Error("Invalid credentials");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const getMe = async (user: IRequestUser) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
    include: {
      patient: true,
    },
    omit: {
      password: true,
    },
  });

  if (!isUserExists) {
    throw new Error("User not found");
  }

  return isUserExists;
};

const refreshToken = async (token: string) => {
  const verifiedRefreshToken = jwtUtils.verifyToken(
    token,
    config.jwt_refresh_secret,
  );

  if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
    throw new Error(
      config.node_env === "development"
        ? verifiedRefreshToken.error
        : "Invalid refresh token",
    );
  }

  const data = verifiedRefreshToken.data as JwtPayload;

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
    throw new Error("User is inactive or not found");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const googleLogin = async (payload: googleLoginPayload) => {
  let googleInfo = null;
  try {
    const ticket = googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.google_client_id,
    });

    googleInfo = (await ticket).getPayload();
  } catch (error) {
    console.log("Google Id Token Verification failed", error);
    throw new Error("Invalid Or Expired google id token");
  }

  if (!googleInfo) {
    throw new Error("Invalid or Expired Google id token");
  }

  if (!googleInfo.email) {
    throw new Error("Email Not Found");
  }

  if (!googleInfo.name) {
    throw new Error("Name Not Found");
  }

  const ifExistWithGoogle = await prisma.user.findUnique({
    where: {
      email: googleInfo.email,
      role: Role.PATIENT,
      googleId: googleInfo.sub,
    },
  });

  let user = ifExistWithGoogle;


  if (!ifExistWithGoogle) {
    const ifExistWithCredential = await prisma.user.findUnique({
      where: {
        email: googleInfo.email,
        role: Role.PATIENT,
        authProvider: AuthProvider.CREDENTIAL,
      },
    });

    

    if (ifExistWithCredential) {
      if (
        ifExistWithCredential.isDeleted ||
        ifExistWithCredential.status !== "ACTIVE"
      ) {
        throw new Error(`Account is ${ifExistWithCredential.status}`);
      }

      user = await prisma.user.update({
        where: {
          id: ifExistWithCredential.id,
        },
        data: {
          googleId: googleInfo.sub,
          emailVerified: true,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: googleInfo.email,
          name: googleInfo.name,
          googleId: googleInfo.sub,
          authProvider: AuthProvider.GOOGLE,
          role: Role.PATIENT,
          emailVerified: true,
          patient: {
            create: {
              name: googleInfo.name,
              email: googleInfo.email,
            },
          },
        },
      });
    }
  }

  if (!user) {
    throw new Error("User Not Found");
  }

  if (user.isDeleted || user.status !== "ACTIVE") {
    throw new Error(`Account is ${user.status}`);
  }

  if (!user.emailVerified) {
    throw new Error("Email Not Verified---------");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

export const AuthService = {
  registerPatient,
  loginUser,
  getMe,
  refreshToken,
  googleLogin,
};
