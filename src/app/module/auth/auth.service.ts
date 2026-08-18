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
  IForgotPasswordPayload,
  ILoginUserPayload,
  IRegisterPatientPayload,
  IRequestUser,
  IResetPasswordPayload,
  IVerifyEmailPayload,
} from "./auth.interface";
import { googleClient } from "../../lib/google-auth";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import ejs from "ejs";
import path from "path";

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

  const otp = crypto.randomInt(100000, 1000000).toString();
  const verifyEmailOtpKey = `verify-email-otp:${email}`;

  await redisClient.set(verifyEmailOtpKey, otp, {
    expiration: {
      type: "EX",
      value: 60 * 5,
    },
  });

  const verifyEmailPayload = {
    name,
    email,
    password: hashedPassword,
  };

  const verifyEmailPayloadKey = `verify-email-payload:${email}`;

  await redisClient.set(
    verifyEmailPayloadKey,
    JSON.stringify(verifyEmailPayload),
    {
      expiration: {
        type: "EX",
        value: 5 * 60,
      },
    },
  );

  const verifyEmailTemplatePath = path.join(
    process.cwd(),
    "/src/app/templates/verify-email.ejs",
  );
  const html = await ejs.renderFile(verifyEmailTemplatePath, {
    otp,
  });

  await transporter.sendMail({
    from: config.email_sender,
    to: email,
    subject: "Email Verification OTP",
    html,
  });
};

const verifyEmail = async (payload: IVerifyEmailPayload) => {
  const { email, otp } = payload;

  const verifyEmailOtpKey = `verify-email-otp:${email}`;
  const verifyEmailPayloadKey = `verify-email-payload:${email}`;

  const redisOtp = await redisClient.get(verifyEmailOtpKey);
  if (!redisOtp) {
    throw new Error("OTP Expired please send again");
  }

  if (redisOtp !== otp) {
    throw new Error("Invalid otp");
  }

  await redisClient.del(verifyEmailOtpKey);

  const redisPayload = await redisClient.get(verifyEmailPayloadKey);
  if (!redisPayload) {
    throw new Error("info dose not exists in redis");
  }

  await redisClient.del(verifyEmailPayloadKey);
  const redisPayloadData: IRegisterPatientPayload = JSON.parse(redisPayload);

  const createdUser = await prisma.user.create({
    data: {
      name: redisPayloadData.name,
      email: redisPayloadData.email,
      password: redisPayloadData.password,
      role: Role.PATIENT,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      patient: {
        create: { name: redisPayloadData.name, email: redisPayloadData.email },
      },
    },
    omit: { password: true },
    include: { patient: true },
  });

  const welcomeTemplatePath = path.join(
    process.cwd(),
    "/src/app/templates/welcome.ejs",
  );
  const html = await ejs.renderFile(welcomeTemplatePath, {
    name: createdUser.name,
    frontendUrl:"#"
  });

  await transporter.sendMail({
    from: config.email_sender,
    to: createdUser?.email,
    subject: "Welcome to Niramoy Healthcare",
    html,
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

      const welcomeTemplatePath = path.join(
        process.cwd(),
        "/src/app/templates/welcome.ejs",
      );
      const html = await ejs.renderFile(welcomeTemplatePath, {
        name: user?.name,
        frontendUrl:"#"
      });

      await transporter.sendMail({
        from: config.email_sender,
        to: user?.email,
        subject: "Welcome to Niramoy Healthcare",
        html,
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

const forgotPassword = async (payload: IForgotPasswordPayload) => {
  const { email } = payload;

  const isEmailExist = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isEmailExist) {
    throw new Error("Email Dose't Exists");
  }

  if (isEmailExist.isDeleted || isEmailExist.status !== "ACTIVE") {
    throw new Error(`Email is ${isEmailExist.status}`);
  }

  if (!isEmailExist.emailVerified) {
    throw new Error("This Email Address is not Verified");
  }

  if (!isEmailExist.password) {
    throw new Error(
      "Your Account is Sign up with google login, Please login using google",
    );
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const key = `forgot-password-otp:${isEmailExist.email}`;

  await redisClient.set(key, otp, {
    expiration: {
      type: "EX",
      value: 5 * 60,
    },
  });

  const forgotPassTemplatePath = path.join(
    process.cwd(),
    "/src/app/templates/forgot-password.ejs",
  );

  const html = await ejs.renderFile(forgotPassTemplatePath, {
    otp,
  });

  await transporter.sendMail({
    from: config.email_sender,
    to: isEmailExist.email,
    subject: "Forgot Password",
    html: html,
  });
};

const resetPassword = async (payload: IResetPasswordPayload) => {
  const { email, otp, newPassword } = payload;

  const isEmailExist = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isEmailExist) {
    throw new Error("Email Dose not Exists");
  }

  if (!isEmailExist.emailVerified) {
    throw new Error("Your Email Not Verified");
  }

  if (isEmailExist.deletedAt || isEmailExist.status === "DELETED") {
    throw new Error("Your Email is Deleted");
  }

  if (isEmailExist.status === "BLOCKED") {
    throw new Error("Your Email is Blocked");
  }

  if (!isEmailExist.password) {
    throw new Error("This account is registered using Google Sign-In");
  }

  const key = `forgot-password-otp:${isEmailExist.email}`;
  const redisOtp = await redisClient.get(key);
  if (!redisOtp) {
    throw new Error("OTP has been expired");
  }

  if (redisOtp !== otp) {
    throw new Error("OTP Not Match");
  }

  const hashNewPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  await prisma.user.update({
    where: {
      email: isEmailExist.email,
    },
    data: {
      password: hashNewPassword,
    },
  });

  await redisClient.del(key);

  const resetPassTemplatePath = path.join(
    process.cwd(),
    "/src/app/templates/reset-password.ejs",
  );

  const html = await ejs.renderFile(resetPassTemplatePath);

  await transporter.sendMail({
    from: config.email_sender,
    to: isEmailExist.email,
    subject: "Rest Password",
    html,
  });
};

export const AuthService = {
  registerPatient,
  verifyEmail,
  loginUser,
  getMe,
  refreshToken,
  googleLogin,
  forgotPassword,
  resetPassword,
};
//
